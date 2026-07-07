import type { Express } from "express";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import type { AuditLog } from "../security/audit-log.js";

interface LoginCapable {
  login(): Promise<void>;
}

function hasLogin(provider: ChatProvider): provider is ChatProvider & LoginCapable {
  return typeof (provider as unknown as LoginCapable).login === "function";
}

/**
 * Opens a real, visible browser window on the machine running this server,
 * pointed at the provider's own login page — the human authenticates
 * normally, nothing here ever touches credentials. Only present when
 * WAES_ENABLE_WEB_SESSION_ADAPTERS=true registered these adapters at all.
 */
export function registerWebSessionRoutes(app: Express, deps: { providers: Map<string, ChatProvider>; auditLog: AuditLog }): void {
  const { providers, auditLog } = deps;

  app.post("/api/web-session/:provider/login", async (req, res) => {
    const provider = providers.get(`${req.params.provider}-web`);
    if (!provider || !hasLogin(provider)) {
      return res.status(404).json({ error: "web-session adapters are disabled or unknown provider" });
    }

    try {
      await provider.login();
      await auditLog.append({ action: "web_session.login_opened", actor: "user", target: req.params.provider });
      res.json({ ok: true, message: "A browser window has been opened — log in there, then leave it open." });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
