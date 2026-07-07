import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolveJailedPath } from "../security/path-jail.js";
import type { AuditLog } from "../security/audit-log.js";

/**
 * An artifact is a named, versioned file under
 * <project>/artifacts/<name>/v<version>.md — every version is kept (never
 * overwritten) so any pane can reopen a version another pane produced.
 */
export function registerArtifactRoutes(app: Express, deps: { db: Database.Database; projectsDir: string; auditLog: AuditLog }): void {
  const { db, projectsDir, auditLog } = deps;

  app.get("/api/projects/:id/artifacts", (req, res) => {
    res.json({
      artifacts: db
        .prepare(`SELECT * FROM artifacts WHERE project_id = ? ORDER BY name, version DESC`)
        .all(req.params.id),
    });
  });

  app.post("/api/projects/:id/artifacts", async (req, res) => {
    const { name, content, createdByPane } = req.body as { name: string; content: string; createdByPane: string };
    if (!name || content == null || !createdByPane) {
      return res.status(400).json({ error: "name, content, createdByPane required" });
    }

    const existing = db
      .prepare(`SELECT MAX(version) as maxVersion FROM artifacts WHERE project_id = ? AND name = ?`)
      .get(req.params.id, name) as { maxVersion: number | null };
    const version = (existing.maxVersion ?? 0) + 1;

    const relPath = `artifacts/${name}/v${version}.md`;
    const fullPath = resolveJailedPath(projectsDir, `${req.params.id}/${relPath}`);
    mkdirSync(fullPath.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(fullPath, content, "utf8");

    const id = uuid();
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO artifacts (id, project_id, name, version, content_ref, created_by_pane, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, req.params.id, name, version, relPath, createdByPane, createdAt);

    await auditLog.append({ action: "artifact.create", actor: createdByPane, target: `${name}@v${version}` });
    res.json({ id, name, version, relPath });
  });

  app.get("/api/projects/:id/artifacts/:artifactId", (req, res) => {
    const row = db.prepare(`SELECT * FROM artifacts WHERE id = ? AND project_id = ?`).get(req.params.artifactId, req.params.id) as
      | { content_ref: string }
      | undefined;
    if (!row) return res.status(404).json({ error: "not found" });

    const fullPath = resolveJailedPath(projectsDir, `${req.params.id}/${row.content_ref}`);
    res.json({ ...row, content: readFileSync(fullPath, "utf8") });
  });
}
