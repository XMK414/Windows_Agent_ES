import type { Express } from "express";
import { CliExecutor } from "../security/cli-executor.js";
import type { AuditLog } from "../security/audit-log.js";
import { resolveJailedPath } from "../security/path-jail.js";

const DEFAULT_ALLOWLIST = ["git", "node", "npm", "claude"] as const;

/**
 * The web UI always acts as a human (there's no way to reach this route
 * except through an authenticated browser session), so `requireConfirmation`
 * is only ever consulted for agent-initiated calls — reserved for when
 * agents get direct API access to this executor rather than only through
 * chat responses. See docs/SECURITY.md §4.
 */
export function registerCliRoutes(app: Express, deps: { projectsDir: string; auditLog: AuditLog; allowlist?: readonly string[] }): void {
  const { projectsDir, auditLog, allowlist = DEFAULT_ALLOWLIST } = deps;

  app.post("/api/projects/:id/cli/run", async (req, res) => {
    const { cmd, args, cwd } = req.body as { cmd: string; args?: string[]; cwd?: string };
    if (!cmd) return res.status(400).json({ error: "cmd required" });

    const projectRoot = resolveJailedPath(projectsDir, req.params.id);
    const executor = new CliExecutor({
      allowlist,
      projectRoot,
      auditLog,
      actor: "user",
      requireConfirmation: async () => true,
    });

    try {
      const result = await executor.run(cmd, args ?? [], cwd ?? ".");
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
