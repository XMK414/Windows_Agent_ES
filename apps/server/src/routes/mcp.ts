import type { Express } from "express";
import type Database from "better-sqlite3";
import { listConnectors, setConnectorFlags, upsertConnector, seedConnectors, slugify } from "../mcp/store.js";
import type { AuditLog } from "../security/audit-log.js";

/** MCP connector registry: the "locked in and routed" inventory. */
export function registerMcpRoutes(app: Express, deps: { db: Database.Database; auditLog: AuditLog }): void {
  const { db, auditLog } = deps;

  // Seed the known connectors once at registration (idempotent).
  seedConnectors(db);

  app.get("/api/mcp/connectors", (_req, res) => {
    res.json({ connectors: listConnectors(db) });
  });

  app.post("/api/mcp/connectors/reseed", (_req, res) => {
    seedConnectors(db);
    res.json({ connectors: listConnectors(db) });
  });

  app.post("/api/mcp/connectors", (req, res) => {
    const { name, type, status } = req.body as { name?: string; type?: string; status?: string };
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    const connector = upsertConnector(db, { id: slugify(name), name: name.trim(), type: type ?? "Web", status: status ?? "Connected" });
    res.json({ connector });
  });

  app.patch("/api/mcp/connectors/:id", async (req, res) => {
    const { locked, routed } = req.body as { locked?: boolean; routed?: boolean };
    const connector = setConnectorFlags(db, req.params.id, { locked, routed });
    if (!connector) return res.status(404).json({ error: "not found" });
    await auditLog.append({ action: "mcp.connector.update", actor: "user", target: req.params.id, detail: { locked: connector.locked, routed: connector.routed } });
    res.json({ connector });
  });
}
