import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ChatProvider, Message } from "../adapters/provider-adapter.interface.js";
import { ContextResolver, type InjectionRef } from "../injection/context-resolver.js";
import { AuditLog } from "../security/audit-log.js";
import { estimateCostCents } from "../adapters/pricing.js";

export interface ThreadRouteDeps {
  db: Database.Database;
  providers: Map<string, ChatProvider>;
  contextResolver: ContextResolver;
  auditLog: AuditLog;
}

export function registerThreadRoutes(app: Express, deps: ThreadRouteDeps): void {
  const { db, providers, contextResolver, auditLog } = deps;

  app.post("/api/threads", (req, res) => {
    const { paneId, provider, model, personaId } = req.body as {
      paneId: string;
      provider: string;
      model: string;
      personaId?: string;
    };

    if (!providers.has(provider)) {
      return res.status(400).json({ error: `Unknown provider "${provider}"` });
    }

    const id = uuid();
    db.prepare(
      `INSERT INTO threads (id, pane_id, provider, model, persona_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, paneId, provider, model, personaId ?? null, new Date().toISOString());

    res.json({ id });
  });

  app.get("/api/threads/:id/messages", (req, res) => {
    const rows = db
      .prepare(`SELECT id, role, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC`)
      .all(req.params.id);
    res.json({ messages: rows });
  });

  // Streams the assistant's reply as Server-Sent Events in response to the
  // same POST that sends the user's message — simpler than a separate
  // WebSocket channel for a single-user local app, revisit if that stops
  // being true (e.g. multiple browser tabs watching one thread).
  app.post("/api/threads/:id/messages", async (req, res) => {
    const threadId = req.params.id;
    const thread = db.prepare(`SELECT * FROM threads WHERE id = ?`).get(threadId) as
      | { provider: string; model: string }
      | undefined;
    if (!thread) return res.status(404).json({ error: "thread not found" });

    const provider = providers.get(thread.provider);
    if (!provider) return res.status(400).json({ error: `Unknown provider "${thread.provider}"` });

    const { content, injections } = req.body as { content: string; injections?: InjectionRef[] };
    if (!content) return res.status(400).json({ error: "content required" });

    const resolved = contextResolver.resolve(injections ?? []);
    for (const injection of resolved) {
      await auditLog.append({
        action: "injection.resolved",
        actor: "user",
        target: injection.source,
        detail: { trust: injection.trust },
      });
    }

    const userMessageId = uuid();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provenance_json, created_at) VALUES (?, ?, 'user', ?, ?, ?)`,
    ).run(userMessageId, threadId, content, JSON.stringify(resolved.map((r) => r.source)), now);

    const history = db
      .prepare(`SELECT role, content FROM messages WHERE thread_id = ? ORDER BY created_at ASC`)
      .all(threadId) as Message[];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let assistantText = "";
    try {
      for await (const chunk of provider.send({
        threadId,
        model: thread.model,
        messages: history,
        injectedContext: resolved.map((r) => r.block),
      })) {
        if (chunk.type === "delta" && chunk.text) {
          assistantText += chunk.text;
          res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`);
        } else if (chunk.type === "done") {
          const assistantId = uuid();
          db.prepare(
            `INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)`,
          ).run(assistantId, threadId, assistantText, new Date().toISOString());

          if (chunk.usage) {
            const costCents = estimateCostCents(thread.model, chunk.usage.inputTokens, chunk.usage.outputTokens);
            db.prepare(
              `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(uuid(), thread.provider, thread.model, chunk.usage.inputTokens, chunk.usage.outputTokens, costCents, threadId, new Date().toISOString());
          }

          res.write(`event: done\ndata: ${JSON.stringify({ usage: chunk.usage })}\n\n`);
        } else if (chunk.type === "error") {
          res.write(`event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`);
        }
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      res.end();
    }
  });
}
