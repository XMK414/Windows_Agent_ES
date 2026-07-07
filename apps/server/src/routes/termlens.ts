import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { mkdirSync, writeFileSync } from "node:fs";
import matter from "gray-matter";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFullWithUsage } from "../adapters/collect.js";
import { estimateCostCents } from "../adapters/pricing.js";
import { ContextResolver } from "../injection/context-resolver.js";
import { resolveJailedPath } from "../security/path-jail.js";
import type { AuditLog } from "../security/audit-log.js";

interface ScanClause {
  title: string;
  original: string;
  plainEnglish: string;
  risk: "low" | "medium" | "high";
  why: string;
}

interface ScanResult {
  summary: string;
  overallRisk: "low" | "medium" | "high";
  clauses: ScanClause[];
}

/** Model output is instructed to be pure JSON, but strip a markdown fence defensively if one shows up anyway. */
function parseScanResult(raw: string): ScanResult {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed.clauses) || typeof parsed.summary !== "string") {
    throw new Error("Model response did not match the expected TermLens JSON shape");
  }
  return parsed as ScanResult;
}

export function registerTermLensRoutes(
  app: Express,
  deps: { db: Database.Database; providers: Map<string, ChatProvider>; contextResolver: ContextResolver; vaultDir: string; auditLog: AuditLog },
): void {
  const { db, providers, contextResolver, vaultDir, auditLog } = deps;
  const scansDir = "termlens-scans";
  mkdirSync(resolveJailedPath(vaultDir, scansDir), { recursive: true });

  app.post("/api/termlens/scan", async (req, res) => {
    const { text, sourceName, provider, model } = req.body as {
      text: string;
      sourceName?: string;
      provider: string;
      model: string;
    };
    if (!text?.trim()) return res.status(400).json({ error: "text required" });
    const chatProvider = providers.get(provider);
    if (!chatProvider) return res.status(400).json({ error: `Unknown provider "${provider}"` });

    const persona = contextResolver.resolve([{ kind: "library", ref: "agent/termlens-scanner" }]);
    const documentBlock = `<injected-context source="pasted-text" trust="user">\n${text}\n</injected-context>`;

    await auditLog.append({ action: "termlens.scan.start", actor: "user", target: sourceName ?? "pasted-text", detail: { provider, model } });

    let result: ScanResult;
    let rawText = "";
    try {
      const { text: scanText, usage } = await collectFullWithUsage(
        chatProvider,
        model,
        [{ role: "user", content: "Analyze the document in the injected context and respond with ONLY the JSON described in your instructions." }],
        [...persona.map((p) => p.block), documentBlock],
      );
      rawText = scanText;
      if (usage) {
        const costCents = estimateCostCents(model, usage.inputTokens, usage.outputTokens);
        db.prepare(
          `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        ).run(uuid(), provider, model, usage.inputTokens, usage.outputTokens, costCents, new Date().toISOString());
      }
      result = parseScanResult(rawText);
    } catch (err) {
      return res.status(502).json({
        error: `TermLens scan failed: ${err instanceof Error ? err.message : String(err)}`,
        raw: rawText || undefined,
      });
    }

    const id = uuid();
    const createdAt = new Date().toISOString();
    const source = sourceName ?? "pasted-text";

    db.prepare(
      `INSERT INTO scans (id, provider, model, source, overall_risk, summary, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, provider, model, source, result.overallRisk, result.summary, JSON.stringify(result), createdAt);

    // "Savable scans" means every scan is saved by default, not an opt-in
    // extra step — it also lands in the vault so memory/query can surface
    // a past scan alongside notes and files.
    const notePath = resolveJailedPath(vaultDir, `${scansDir}/${id}.md`);
    writeFileSync(
      notePath,
      matter.stringify(
        [`## ${source}`, "", result.summary, "", ...result.clauses.map((c) => `### ${c.title} (${c.risk})\n${c.plainEnglish}`)].join("\n"),
        { scan_id: id, provider, model, overall_risk: result.overallRisk, created_at: createdAt },
      ),
      "utf8",
    );

    await auditLog.append({ action: "termlens.scan.saved", actor: "user", target: id, detail: { overallRisk: result.overallRisk } });
    res.json({ id, source, createdAt, ...result });
  });

  app.get("/api/termlens/scans", (_req, res) => {
    res.json({
      scans: db
        .prepare(`SELECT id, provider, model, source, overall_risk, summary, created_at FROM scans ORDER BY created_at DESC`)
        .all(),
    });
  });

  app.get("/api/termlens/scans/:id", (req, res) => {
    const row = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(req.params.id) as { result_json: string } | undefined;
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ ...row, result: JSON.parse(row.result_json) });
  });
}
