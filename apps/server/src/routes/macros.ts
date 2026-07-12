import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFullWithUsage } from "../adapters/collect.js";
import { estimateCostCents } from "../adapters/pricing.js";
import { ContextResolver, type InjectionRef } from "../injection/context-resolver.js";
import type { FileLibraryIndex } from "../library/index.js";
import type { AuditLog } from "../security/audit-log.js";
import { isBuildRestricted, BUILD_RESTRICTED_MESSAGE } from "../adapters/build-restriction.js";

/**
 * A macro is "run this saved prompt (plus whatever context you attach)
 * right now" — one click, no thread management. Reuses the same
 * ContextResolver and collectFullWithUsage the rest of the app uses, so
 * injections are provenance-tagged and cost is tracked identically.
 */
export function registerMacroRoutes(
  app: Express,
  deps: { db: Database.Database; providers: Map<string, ChatProvider>; library: FileLibraryIndex; contextResolver: ContextResolver; auditLog: AuditLog },
): void {
  const { db, providers, library, contextResolver, auditLog } = deps;

  app.post("/api/macros/run", async (req, res) => {
    const { promptRef, provider, model, injections } = req.body as {
      promptRef: string;
      provider: string;
      model: string;
      injections?: InjectionRef[];
    };
    if (!promptRef || !provider || !model) return res.status(400).json({ error: "promptRef, provider, model required" });

    const chatProvider = providers.get(provider);
    if (!chatProvider) return res.status(400).json({ error: `Unknown provider "${provider}"` });
    if (isBuildRestricted(chatProvider)) return res.status(403).json({ error: BUILD_RESTRICTED_MESSAGE });

    const promptItem = library.lookup(promptRef);
    if (!promptItem) return res.status(400).json({ error: `Unknown prompt "${promptRef}"` });

    const resolved = contextResolver.resolve(injections ?? []);
    await auditLog.append({ action: "macro.run", actor: "user", target: promptRef, detail: { provider, model } });

    try {
      const { text, usage } = await collectFullWithUsage(
        chatProvider,
        model,
        [{ role: "user", content: promptItem.body }],
        resolved.map((r) => r.block),
      );

      if (usage) {
        const costCents = estimateCostCents(model, usage.inputTokens, usage.outputTokens);
        db.prepare(
          `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        ).run(uuid(), provider, model, usage.inputTokens, usage.outputTokens, costCents, new Date().toISOString());
      }

      res.json({ text });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
