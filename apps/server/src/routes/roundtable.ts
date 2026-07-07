import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFullWithUsage } from "../adapters/collect.js";
import { estimateCostCents } from "../adapters/pricing.js";
import { ContextResolver } from "../injection/context-resolver.js";
import type { AuditLog } from "../security/audit-log.js";

interface Speaker {
  kind: "llm" | "user";
  label: string;
  adapterId?: string;
  model?: string;
  personaId?: string;
}

/**
 * A round table is a single shared thread multiple participants (LLMs and
 * the user) take turns in, each seeing everyone else's prior turns — unlike
 * Board of Directors (one-shot fan-out + synthesis) or the 4-pane grid
 * (independent, non-shared conversations). Turn orchestration (whose turn
 * is next, pausing on the user's turn, the round cap) lives client-side;
 * this route just resolves one turn against the shared transcript.
 */
export function registerRoundtableRoutes(
  app: Express,
  deps: { db: Database.Database; providers: Map<string, ChatProvider>; contextResolver: ContextResolver; auditLog: AuditLog },
): void {
  const { db, providers, contextResolver, auditLog } = deps;

  app.post("/api/roundtable/threads", (req, res) => {
    const { topic } = req.body as { topic?: string };
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO threads (id, pane_id, provider, model, created_at) VALUES (?, 'roundtable', 'roundtable', 'multi', ?)`).run(id, now);
    if (topic) {
      db.prepare(`INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'user', ?, ?, ?)`).run(
        uuid(),
        id,
        topic,
        JSON.stringify({ speaker: "Topic" }),
        now,
      );
    }
    res.json({ id });
  });

  app.post("/api/roundtable/threads/:id/turns", async (req, res) => {
    const threadId = req.params.id;
    const speaker = req.body.speaker as Speaker;
    if (!speaker?.label) return res.status(400).json({ error: "speaker.label required" });

    if (speaker.kind === "user") {
      const { content } = req.body as { content: string };
      if (!content) return res.status(400).json({ error: "content required for a user turn" });
      const id = uuid();
      db.prepare(
        `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'user', ?, ?, ?)`,
      ).run(id, threadId, content, JSON.stringify({ speaker: speaker.label }), new Date().toISOString());
      return res.json({ speaker: speaker.label, content });
    }

    if (!speaker.adapterId || !speaker.model) return res.status(400).json({ error: "adapterId and model required for an llm turn" });
    const provider = providers.get(speaker.adapterId);
    if (!provider) return res.status(400).json({ error: `Unknown provider "${speaker.adapterId}"` });

    const history = db
      .prepare(`SELECT content, provenance_json, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC`)
      .all(threadId) as { content: string; provenance_json: string | null; created_at: string }[];

    const transcript = history
      .map((m) => {
        const speakerLabel = m.provenance_json ? JSON.parse(m.provenance_json).speaker ?? "Someone" : "Someone";
        return `${speakerLabel}: ${m.content}`;
      })
      .join("\n\n");

    const persona = speaker.personaId ? contextResolver.resolve([{ kind: "library", ref: speaker.personaId }]) : [];
    const instruction = [
      `You are "${speaker.label}", one participant in a multi-party round-table discussion alongside other AI models and a human.`,
      "Below is the discussion so far, each line prefixed with who said it. Write only your own next contribution — do not restate the transcript, do not speak as anyone else, and do not prefix your reply with your own name.",
      "",
      transcript || "(the discussion hasn't started yet — open with an opening thought on the topic)",
    ].join("\n");

    try {
      await auditLog.append({ action: "roundtable.turn", actor: "user", target: threadId, detail: { speaker: speaker.label, adapterId: speaker.adapterId } });

      const { text, usage } = await collectFullWithUsage(
        provider,
        speaker.model,
        [{ role: "user", content: instruction }],
        persona.map((p) => p.block),
      );

      const id = uuid();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
      ).run(id, threadId, text, JSON.stringify({ speaker: speaker.label, adapterId: speaker.adapterId, model: speaker.model }), now);

      if (usage) {
        const costCents = estimateCostCents(speaker.model, usage.inputTokens, usage.outputTokens);
        db.prepare(
          `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(uuid(), speaker.adapterId, speaker.model, usage.inputTokens, usage.outputTokens, costCents, threadId, now);
      }

      res.json({ speaker: speaker.label, content: text });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err), speaker: speaker.label });
    }
  });
}
