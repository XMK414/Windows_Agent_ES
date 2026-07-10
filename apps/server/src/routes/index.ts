import type { Express } from "express";
import type Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { AuditLog } from "../security/audit-log.js";
import type { SecretsVault } from "../security/secrets-vault.js";
import { asyncHandler } from "./async-handler.js";

export interface RouteDeps {
  db: Database.Database;
  vault: SecretsVault;
  auditLog: AuditLog;
  dataDir: string;
}

export function registerRoutes(app: Express, deps: RouteDeps): void {
  const { vault, auditLog } = deps;

  app.get(
    "/api/status",
    asyncHandler(async (_req, res) => {
      const anthropicConfigured = Boolean(await vault.get("anthropic_api_key"));
      const googleConfigured = Boolean(await vault.get("google_api_key"));
      const openrouterConfigured = Boolean(await vault.get("openrouter_api_key"));
      const chatgptOauthConfigured = Boolean(await vault.get("chatgpt_oauth_token"));
      res.json({ anthropicConfigured, googleConfigured, openrouterConfigured, chatgptOauthConfigured, auditChainValid: auditLog.verifyChain() });
    }),
  );

  // Never echoes the key back and never logs it — only records that a key
  // of this name was set, not its value.
  app.post(
    "/api/secrets/:key",
    asyncHandler(async (req, res) => {
      const { key } = req.params;
      const { value } = req.body as { value?: string };
      if (!value) return res.status(400).json({ error: "value required" });

      await vault.set(key, value);
      await auditLog.append({ action: "secrets.set", actor: "user", target: key });
      res.json({ ok: true });
    }),
  );

  app.get("/api/audit", (req, res) => {
    const auditPath = path.join(deps.dataDir, "audit.log.jsonl");
    if (!existsSync(auditPath)) return res.json({ entries: [] });

    const limit = Number(req.query.limit ?? 50);
    const lines = readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean);
    const entries = lines.slice(-limit).map((line) => JSON.parse(line));
    res.json({ entries, chainValid: auditLog.verifyChain() });
  });
}
