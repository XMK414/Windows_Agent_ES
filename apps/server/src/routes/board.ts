import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { estimateCostCents } from "../adapters/pricing.js";
import { ContextResolver } from "../injection/context-resolver.js";
import type { AuditLog } from "../security/audit-log.js";
import { asyncHandler } from "./async-handler.js";
import {
  runAdvisory,
  runVerdict,
  ADVISOR_ROLES,
  type AgentConfig,
  type AdvisorResult,
  type ReviewResult,
} from "../board/counsel.js";

const DEFAULT_ADVISOR: AgentConfig = { adapterId: "anthropic-api", model: "claude-sonnet-5" };
const DEFAULT_COUNSEL: AgentConfig = { adapterId: "anthropic-api", model: "claude-opus-4-8" };

/** Normalise a partial list of agents to exactly `count`, filling with a default. */
function fill(list: AgentConfig[] | undefined, count: number, fallback: AgentConfig): AgentConfig[] {
  const out = (list ?? []).slice(0, count);
  while (out.length < count) out.push({ ...fallback });
  return out;
}

/**
 * Board of Directors — the 10-agent Counsel flow (see board/counsel.ts):
 *   POST /api/board/run     → advisors + peer reviews + clarifying questions
 *   POST /api/board/verdict → report + single verdict + next 3 micro-action steps
 */
export function registerBoardRoutes(
  app: Express,
  deps: { db: Database.Database; providers: Map<string, ChatProvider>; contextResolver: ContextResolver; auditLog: AuditLog },
): void {
  const { db, providers, auditLog } = deps;

  function recordCost(threadId: string, adapterId: string, model: string, usage?: { inputTokens: number; outputTokens: number }) {
    if (!usage) return;
    const costCents = estimateCostCents(model, usage.inputTokens, usage.outputTokens);
    db.prepare(
      `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(uuid(), adapterId, model, usage.inputTokens, usage.outputTokens, costCents, threadId, new Date().toISOString());
  }

  function persist(threadId: string, phase: string, provenance: Record<string, unknown>, content: string) {
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
    ).run(uuid(), threadId, content, JSON.stringify({ phase, ...provenance }), new Date().toISOString());
  }

  app.post(
    "/api/board/run",
    asyncHandler(async (req, res) => {
      const { prompt, advisors, reviewers, counsel } = req.body as {
        prompt: string;
        advisors?: AgentConfig[];
        reviewers?: AgentConfig[];
        counsel?: AgentConfig;
      };
      if (!prompt?.trim()) return res.status(400).json({ error: "prompt required" });

      const advisorAgents = fill(advisors, ADVISOR_ROLES.length, DEFAULT_ADVISOR);
      const reviewerAgents = fill(reviewers, 5, DEFAULT_ADVISOR);
      const counselAgent = counsel ?? DEFAULT_COUNSEL;

      for (const a of [...advisorAgents, ...reviewerAgents, counselAgent]) {
        if (!providers.has(a.adapterId)) return res.status(400).json({ error: `Unknown provider "${a.adapterId}"` });
      }

      const threadId = uuid();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO threads (id, pane_id, provider, model, created_at) VALUES (?, 'board', ?, ?, ?)`).run(
        threadId,
        counselAgent.adapterId,
        counselAgent.model,
        now,
      );
      db.prepare(`INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`).run(uuid(), threadId, prompt, now);

      await auditLog.append({ action: "board.run", actor: "user", target: threadId, detail: { advisors: advisorAgents.length, reviewers: reviewerAgents.length } });

      const out = await runAdvisory(providers, {
        brief: prompt,
        advisors: advisorAgents,
        reviewers: reviewerAgents,
        counsel: counselAgent,
      });

      out.advisors.forEach((a: AdvisorResult) => {
        persist(threadId, "advisor", { roleKey: a.roleKey, label: a.label, adapterId: a.adapterId, model: a.model, ok: a.ok }, a.content);
        recordCost(threadId, a.adapterId, a.model, a.usage);
      });
      out.reviews.forEach((r: ReviewResult) => {
        persist(threadId, "review", { reviewerIndex: r.reviewerIndex, adapterId: r.adapterId, model: r.model, ok: r.ok }, r.content);
        recordCost(threadId, r.adapterId, r.model, r.usage);
      });

      // Stash the counsel context + questions so /verdict can pick up the flow
      // without the client having to echo a large payload back.
      persist(threadId, "questions", { questions: out.clarifyingQuestions, counselContext: out.counselContext, counsel: counselAgent }, out.clarifyingQuestions.join("\n"));

      res.json({
        threadId,
        advisors: out.advisors.map((a) => ({ roleKey: a.roleKey, label: a.label, adapterId: a.adapterId, model: a.model, ok: a.ok, content: a.content })),
        reviews: out.reviews.map((r) => ({ reviewerIndex: r.reviewerIndex, adapterId: r.adapterId, model: r.model, ok: r.ok, content: r.content })),
        clarifyingQuestions: out.clarifyingQuestions,
      });
    }),
  );

  app.post(
    "/api/board/verdict",
    asyncHandler(async (req, res) => {
      const { threadId, answers } = req.body as { threadId: string; answers?: string };
      if (!threadId) return res.status(400).json({ error: "threadId required" });

      const row = db
        .prepare(`SELECT content, provenance_json FROM messages WHERE thread_id = ? AND provenance_json LIKE '%"phase":"questions"%' ORDER BY created_at DESC LIMIT 1`)
        .get(threadId) as { content: string; provenance_json: string } | undefined;
      if (!row) return res.status(404).json({ error: "no pending questions for this thread — run the board first" });

      const meta = JSON.parse(row.provenance_json) as { questions: string[]; counselContext: string; counsel: AgentConfig };
      if (!providers.has(meta.counsel.adapterId)) return res.status(400).json({ error: `Unknown provider "${meta.counsel.adapterId}"` });

      await auditLog.append({ action: "board.verdict", actor: "user", target: threadId });

      const verdict = await runVerdict(providers, {
        counselContext: meta.counselContext,
        questions: meta.questions,
        answers: answers ?? "",
        counsel: meta.counsel,
      });

      recordCost(threadId, meta.counsel.adapterId, meta.counsel.model, verdict.usage);
      persist(threadId, "verdict", { counsel: meta.counsel, steps: verdict.steps }, verdict.raw);

      res.json({ threadId, report: verdict.report, verdict: verdict.verdict, steps: verdict.steps });
    }),
  );
}
