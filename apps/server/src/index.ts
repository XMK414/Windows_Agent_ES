import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { AuditLog } from "./security/audit-log.js";
import { FileSecretsVault } from "./security/secrets-vault.js";
import { generateInstallToken, requireAuth, localOnlyCors } from "./security/auth-middleware.js";
import { openDb } from "./db/index.js";
import { registerRoutes } from "./routes/index.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const WEB_ORIGIN = process.env.WAES_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const PORT = Number(process.env.WAES_PORT ?? 8787);

mkdirSync(DATA_DIR, { recursive: true });

// The install token is generated once and persisted locally (gitignored) —
// this is what stands in for "auth" on a single-user local server. See
// docs/SECURITY.md §3.
const tokenPath = path.join(DATA_DIR, "install-token.txt");
const installToken = existsSync(tokenPath)
  ? readFileSync(tokenPath, "utf8").trim()
  : (() => {
      const token = generateInstallToken();
      writeFileSync(tokenPath, token, { mode: 0o600 });
      return token;
    })();

const auditLog = new AuditLog(path.join(DATA_DIR, "audit.log.jsonl"));
const db = openDb(path.join(DATA_DIR, "app.db"));

// Vault passphrase comes from an env var set outside the repo (a Windows
// env var, a launcher script, etc.) — never hardcoded, never committed.
// See docs/SECURITY.md §2 for the OS-credential-store path this falls back
// from once a native Windows binding is wired in.
const vault = new FileSecretsVault(path.join(DATA_DIR, "secrets.vault"), async () => {
  const passphrase = process.env.WAES_VAULT_PASSPHRASE;
  if (!passphrase) {
    throw new Error(
      "WAES_VAULT_PASSPHRASE is not set — the secrets vault refuses to run with a default/blank passphrase",
    );
  }
  return passphrase;
});

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(localOnlyCors(WEB_ORIGIN));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(
  "/api",
  requireAuth({
    installToken,
    csrfCookieName: "waes_csrf",
    csrfHeaderName: "x-waes-csrf",
  }),
);

registerRoutes(app, { db, vault, auditLog, dataDir: DATA_DIR });

app.listen(PORT, "127.0.0.1", () => {
  // Printed once per run so the operator can copy it into the UI's login
  // prompt; never written to the audit log or any persistent log file.
  console.log(`Windows Agent ES server listening on http://127.0.0.1:${PORT}`);
  console.log(`Install token (keep this local): ${installToken}`);
});
