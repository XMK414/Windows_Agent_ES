import type { Express } from "express";
import { FileLibraryIndex, LIBRARY_TYPES, type LibraryType } from "../library/index.js";
import type { AuditLog } from "../security/audit-log.js";

export function registerLibraryRoutes(app: Express, deps: { library: FileLibraryIndex; auditLog: AuditLog }): void {
  const { library, auditLog } = deps;

  app.get("/api/library", (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    res.json({ items: library.list({ type, query }) });
  });

  // The browser UI always acts as a human; this endpoint is where an
  // agent-initiated write (once agents can call the API directly) would
  // instead pass actor: "agent" and hit the owner-check in library.create.
  app.post("/api/library/:type/:slug", async (req, res) => {
    const { type, slug } = req.params as { type: LibraryType; slug: string };
    if (!LIBRARY_TYPES.includes(type)) {
      return res.status(400).json({ error: `Unknown library type "${type}"` });
    }

    const { name, tags, body, owner } = req.body as {
      name: string;
      tags?: string[];
      body: string;
      owner?: "human" | "agent";
    };
    if (!name || !body) return res.status(400).json({ error: "name and body required" });

    try {
      library.create("human", type, slug, { name, tags: tags ?? [], body, owner: owner ?? "human" });
      await auditLog.append({ action: "library.write", actor: "user", target: `${type}/${slug}` });
      res.json({ ok: true, ref: `${type.replace(/s$/, "")}/${slug}` });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
