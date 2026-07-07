import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFull } from "../adapters/collect.js";
import { ContextResolver } from "../injection/context-resolver.js";
import type { AuditLog } from "../security/audit-log.js";

interface Seat {
  adapterId: string;
  model: string;
  personaId?: string; // e.g. "persona/skeptical-reviewer"
}

export function registerBoardRoutes(
  app: Express,
  deps: { db: Database.Database; providers: Map<string, ChatProvider>; contextResolver: ContextResolver; auditLog: AuditLog },
): void {
  const { db, providers, contextResolver, auditLog } = deps;

  app.post("/api/board/run", async (req, res) => {
    const { paneId, prompt, seats, chair } = req.body as {
      paneId: string;
      prompt: string;
      seats: Seat[];
      chair: { adapterId: string; model: string };
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

    const seatResults = await Promise.allSettled(
      seats.map(async (seat) => {
        const provider = providers.get(seat.adapterId)!;
        const injected = seat.personaId ? contextResolver.resolve([{ kind: "library", ref: seat.personaId }]) : [];
        await auditLog.append({ action: "board.seat.run", actor: "user", target: seat.adapterId, detail: { model: seat.model, personaId: seat.personaId } });
        const text = await collectFull(provider, seat.model, [{ role: "user", content: prompt }], injected.map((i) => i.block));
        return { seat, text };
      }),
    );

    const seatMessages = seatResults.map((result, i) => {
      const seat = seats[i];
      const ok = result.status === "fulfilled";
      const content = ok ? result.value.text : `[seat error: ${(result as PromiseRejectedResult).reason}]`;
      const id = uuid();
      db.prepare(
        `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
      ).run(id, threadId, content, JSON.stringify({ seat, ok }), new Date().toISOString());
      return { seatIndex: i, adapterId: seat.adapterId, model: seat.model, personaId: seat.personaId, ok, content };
    });

    const synthesisPrompt = [
      `Original question: ${prompt}`,
      "",
      "Panel responses:",
      ...seatMessages.map((m, i) => `Seat ${i + 1} (${m.adapterId}/${m.model}${m.personaId ? `, ${m.personaId}` : ""}):\n${m.content}`),
      "",
      "Synthesize the above into a single recommendation, noting any disagreement between seats.",
    ].join("\n");

    let synthesis: string;
    try {
      synthesis = await collectFull(providers.get(chair.adapterId)!, chair.model, [{ role: "user", content: synthesisPrompt }], []);
    } catch (err) {
      synthesis = `[chair synthesis error: ${err instanceof Error ? err.message : String(err)}]`;
    }

    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`,
    ).run(uuid(), threadId, synthesis, JSON.stringify({ synthesis: true, chair }), new Date().toISOString());

    res.json({ threadId, seats: seatMessages, synthesis });
  });
}
