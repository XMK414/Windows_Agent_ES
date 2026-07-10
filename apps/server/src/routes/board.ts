import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFullWithUsage } from "../adapters/collect.js";
import { estimateCostCents } from "../adapters/pricing.js";
import { ContextResolver } from "../injection/context-resolver.js";
import type { AuditLog } from "../security/audit-log.js";

interface Seat {
  adapterId: string;
  model: string;
  personaId?: string; // e.g. "persona/skeptical-reviewer"
  /** Archetype/system-prompt for this seat (e.g. one of the Counsel archetypes). */
  systemPrompt?: string;
  label?: string;
}

/** Wrap a seat's archetype system prompt as a human-authored instruction block,
 * matching how the injection resolver fences persona content, so the adapter is
 * allowed to treat it as an instruction rather than reference data. */
function fenceInstruction(source: string, content: string): string {
  return `<injected-context source="${source}" trust="human-authored">\n${content}\n</injected-context>`;
}

/**
 * Board of Directors — a phased advisory board modelled on the "Counsel" flow:
 *   1. Board    — every seat answers the brief in parallel (fan-out).
 *   2. Review   — (optional) each seat sees the whole panel's answers and
 *                 critiques the collective thinking (peer review).
 *   3. Verdict  — the chair/moderator synthesises board + reviews into a single
 *                 recommendation and the one concrete next step.
 */
export function registerBoardRoutes(
  app: Express,
  deps: { db: Database.Database; providers: Map<string, ChatProvider>; contextResolver: ContextResolver; auditLog: AuditLog },
): void {
  const { db, providers, contextResolver, auditLog } = deps;

  app.post("/api/board/run", async (req, res) => {
    const { paneId, prompt, seats, chair, peerReview } = req.body as {
      paneId: string;
      prompt: string;
      seats: Seat[];
      chair: { adapterId: string; model: string };
      peerReview?: boolean;
    };
    if (!prompt || !seats?.length || !chair) {
      return res.status(400).json({ error: "prompt, seats[], and chair required" });
    }
    for (const seat of [...seats, chair]) {
      if (!providers.has(seat.adapterId)) return res.status(400).json({ error: `Unknown provider "${seat.adapterId}"` });
    }

    const threadId = uuid();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO threads (id, pane_id, provider, model, created_at) VALUES (?, 'board', ?, ?, ?)`).run(
      threadId,
      chair.adapterId,
      chair.model,
      now,
    );
    db.prepare(`INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`).run(
      uuid(),
      threadId,
      prompt,
      now,
    );

    function recordCost(provider: string, model: string, usage?: { inputTokens: number; outputTokens: number }) {
      if (!usage) return;
      const costCents = estimateCostCents(model, usage.inputTokens, usage.outputTokens);
      db.prepare(
        `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(uuid(), provider, model, usage.inputTokens, usage.outputTokens, costCents, threadId, new Date().toISOString());
    }

    function seatLabel(seat: Seat, i: number): string {
      return seat.label?.trim() || `Seat ${i + 1}`;
    }

    /** Injected context for a seat: its archetype system prompt + optional persona. */
    function seatContext(seat: Seat): string[] {
      const blocks: string[] = [];
      if (seat.systemPrompt?.trim()) blocks.push(fenceInstruction("board:archetype", seat.systemPrompt.trim()));
      if (seat.personaId) blocks.push(...contextResolver.resolve([{ kind: "library", ref: seat.personaId }]).map((i) => i.block));
      return blocks;
    }

    function persist(phase: string, provenance: Record<string, unknown>, content: string) {
      db.prepare(
        `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
      ).run(uuid(), threadId, content, JSON.stringify({ phase, ...provenance }), new Date().toISOString());
    }

    // ---- Phase 1: Board ---------------------------------------------------
    const boardResults = await Promise.allSettled(
      seats.map(async (seat) => {
        const provider = providers.get(seat.adapterId)!;
        await auditLog.append({ action: "board.seat.run", actor: "user", target: seat.adapterId, detail: { phase: "board", model: seat.model, personaId: seat.personaId } });
        const { text, usage } = await collectFullWithUsage(provider, seat.model, [{ role: "user", content: prompt }], seatContext(seat));
        recordCost(seat.adapterId, seat.model, usage);
        return { text };
      }),
    );

    const board = boardResults.map((result, i) => {
      const seat = seats[i];
      const ok = result.status === "fulfilled";
      const content = ok ? result.value.text : `[seat error: ${(result as PromiseRejectedResult).reason}]`;
      persist("board", { seat, ok }, content);
      return { seatIndex: i, label: seatLabel(seat, i), adapterId: seat.adapterId, model: seat.model, personaId: seat.personaId, ok, content };
    });

    const boardTranscript = board
      .map((m) => `${m.label} (${m.adapterId}/${m.model}):\n${m.content}`)
      .join("\n\n---\n\n");

    // ---- Phase 2: Peer review (optional) ---------------------------------
    let reviews: { seatIndex: number; label: string; adapterId: string; model: string; ok: boolean; content: string }[] = [];
    if (peerReview && seats.length > 1) {
      const reviewResults = await Promise.allSettled(
        seats.map(async (seat, i) => {
          const provider = providers.get(seat.adapterId)!;
          const reviewPrompt = [
            `Original brief: ${prompt}`,
            "",
            "Every board member's opening response is below.",
            "",
            boardTranscript,
            "",
            `Speaking as ${seatLabel(seat, i)}, critique the panel's collective thinking: what is strong, what is missing, and what is wrong. Be specific and concise — do not restate the responses.`,
          ].join("\n");
          await auditLog.append({ action: "board.seat.review", actor: "user", target: seat.adapterId, detail: { phase: "review", model: seat.model } });
          const { text, usage } = await collectFullWithUsage(provider, seat.model, [{ role: "user", content: reviewPrompt }], seatContext(seat));
          recordCost(seat.adapterId, seat.model, usage);
          return { text };
        }),
      );

      reviews = reviewResults.map((result, i) => {
        const seat = seats[i];
        const ok = result.status === "fulfilled";
        const content = ok ? result.value.text : `[review error: ${(result as PromiseRejectedResult).reason}]`;
        persist("review", { seat, ok }, content);
        return { seatIndex: i, label: seatLabel(seat, i), adapterId: seat.adapterId, model: seat.model, ok, content };
      });
    }

    // ---- Phase 3: Verdict -------------------------------------------------
    const verdictPrompt = [
      `Original brief: ${prompt}`,
      "",
      "Board responses:",
      ...board.map((m) => `${m.label}:\n${m.content}`),
      ...(reviews.length
        ? ["", "Peer reviews:", ...reviews.map((m) => `${m.label}:\n${m.content}`)]
        : []),
      "",
      "As the chair, synthesise the above into a single clear recommendation, noting any real disagreement between seats.",
      'Finish with a line of exactly the form "THE ONLY NEXT STEP: <one concrete action>".',
    ].join("\n");

    let verdict: string;
    try {
      const { text, usage } = await collectFullWithUsage(providers.get(chair.adapterId)!, chair.model, [{ role: "user", content: verdictPrompt }], []);
      recordCost(chair.adapterId, chair.model, usage);
      verdict = text;
    } catch (err) {
      verdict = `[chair verdict error: ${err instanceof Error ? err.message : String(err)}]`;
    }

    persist("verdict", { chair }, verdict);

    const nextStepMatch = verdict.match(/THE ONLY NEXT STEP:\s*(.+)\s*$/i);
    const nextStep = nextStepMatch ? nextStepMatch[1].trim() : null;

    // `seats` and `synthesis` are kept as aliases for the board phase and the
    // verdict so older callers keep working alongside the phased fields.
    res.json({ threadId, board, seats: board, reviews, verdict, synthesis: verdict, nextStep });
  });
}
