import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { resolveJailedPath, PathEscapeError } from "../security/path-jail.js";
import type { AuditLog } from "../security/audit-log.js";
import { isProjectPhase } from "../projects/phases.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function registerProjectRoutes(app: Express, deps: { db: Database.Database; projectsDir: string; auditLog: AuditLog }): void {
  const { db, projectsDir, auditLog } = deps;

  function projectDir(id: string): string {
    return resolveJailedPath(projectsDir, id);
  }

  app.post("/api/projects", (req, res) => {
    const { name, description } = req.body as { name: string; description?: string };
    if (!name) return res.status(400).json({ error: "name required" });

    const id = uuid();
    const now = new Date().toISOString();
    mkdirSync(projectDir(id), { recursive: true });
    db.prepare(`INSERT INTO projects (id, name, description, phase, started_at, created_at) VALUES (?, ?, ?, 'DISCOVERY', ?, ?)`).run(
      id,
      name,
      description ?? null,
      now,
      now,
    );
    res.json({ id, name });
  });

  app.get("/api/projects", (_req, res) => {
    res.json({ projects: db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() });
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id);
    if (!project) return res.status(404).json({ error: "not found" });
    res.json({ project });
  });

  // Update description and/or phase.
  app.patch("/api/projects/:id", (req, res) => {
    const { description, phase } = req.body as { description?: string; phase?: string };
    if (phase !== undefined && !isProjectPhase(phase)) {
      return res.status(400).json({ error: "invalid phase" });
    }
    const existing = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: "not found" });

    if (description !== undefined) db.prepare(`UPDATE projects SET description = ? WHERE id = ?`).run(description, req.params.id);
    if (phase !== undefined) db.prepare(`UPDATE projects SET phase = ? WHERE id = ?`).run(phase, req.params.id);
    res.json({ ok: true });
  });

  // Work-log: a dated brief of what was done in a session on this project.
  app.get("/api/projects/:id/log", (req, res) => {
    const entries = db.prepare(`SELECT id, entry, created_at FROM project_log WHERE project_id = ? ORDER BY created_at DESC`).all(req.params.id);
    res.json({ entries });
  });

  app.post("/api/projects/:id/log", (req, res) => {
    const { entry } = req.body as { entry: string };
    if (!entry?.trim()) return res.status(400).json({ error: "entry required" });
    const id = uuid();
    db.prepare(`INSERT INTO project_log (id, project_id, entry, created_at) VALUES (?, ?, ?, ?)`).run(id, req.params.id, entry.trim(), new Date().toISOString());
    res.json({ id });
  });

  app.get("/api/projects/:id/files", (req, res) => {
    const rows = db
      .prepare(`SELECT id, rel_path, size, mime, checksum, uploaded_at FROM files WHERE project_id = ? ORDER BY uploaded_at DESC`)
      .all(req.params.id);
    res.json({ files: rows });
  });

  app.post("/api/projects/:id/files", async (req, res) => {
    const { relPath, content, mime } = req.body as { relPath: string; content: string; mime?: string };
    if (!relPath || content == null) return res.status(400).json({ error: "relPath and content required" });

    const byteLength = Buffer.byteLength(content, "utf8");
    if (byteLength > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `File exceeds ${MAX_FILE_BYTES} byte limit` });
    }

    let fullPath: string;
    try {
      fullPath = resolveJailedPath(projectDir(req.params.id), relPath);
    } catch (err) {
      if (err instanceof PathEscapeError) return res.status(400).json({ error: err.message });
      throw err;
    }

    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");

    const checksum = createHash("sha256").update(content).digest("hex");
    const id = uuid();
    const uploadedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO files (id, project_id, rel_path, size, mime, checksum, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, req.params.id, relPath, byteLength, mime ?? null, checksum, uploadedAt);

    await auditLog.append({ action: "file.write", actor: "user", target: `${req.params.id}/${relPath}`, detail: { byteLength } });
    res.json({ id, relPath, size: byteLength, checksum });
  });

  app.get("/api/projects/:id/files/*", (req, res) => {
    const relPath = (req.params as Record<string, string>)[0];
    let fullPath: string;
    try {
      fullPath = resolveJailedPath(projectDir(req.params.id), relPath);
    } catch (err) {
      if (err instanceof PathEscapeError) return res.status(400).json({ error: err.message });
      throw err;
    }

    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) return res.status(404).json({ error: "not a file" });
      res.type("text/plain").send(readFileSync(fullPath, "utf8"));
    } catch {
      res.status(404).json({ error: "not found" });
    }
  });

  // Directory listing straight off disk (not just the `files` DB index) so
  // artifacts written outside the upload endpoint (e.g. by the CLI
  // executor) still show up.
  app.get("/api/projects/:id/tree", (req, res) => {
    const root = projectDir(req.params.id);
    const entries: string[] = [];

    function walk(dir: string, prefix: string) {
      for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(abs).isDirectory()) {
          walk(abs, rel);
        } else {
          entries.push(rel);
        }
      }
    }

    try {
      walk(root, "");
    } catch {
      // project dir doesn't exist yet — empty tree, not an error
    }
    res.json({ entries });
  });
}
