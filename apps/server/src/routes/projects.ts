import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { resolveJailedPath, PathEscapeError } from "../security/path-jail.js";
import type { AuditLog } from "../security/audit-log.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function registerProjectRoutes(app: Express, deps: { db: Database.Database; projectsDir: string; auditLog: AuditLog }): void {
  const { db, projectsDir, auditLog } = deps;

  function projectDir(id: string): string {
    return resolveJailedPath(projectsDir, id);
  }

  app.post("/api/projects", (req, res) => {
    const { name } = req.body as { name: string };
    if (!name) return res.status(400).json({ error: "name required" });

    const id = uuid();
    mkdirSync(projectDir(id), { recursive: true });
    db.prepare(`INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)`).run(id, name, new Date().toISOString());
    res.json({ id, name });
  });

  app.get("/api/projects", (_req, res) => {
    res.json({ projects: db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() });
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
