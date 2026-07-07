import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import matter from "gray-matter";
import { resolveJailedPath } from "../security/path-jail.js";
import type { AuditLog } from "../security/audit-log.js";

export function registerNoteRoutes(app: Express, deps: { db: Database.Database; vaultDir: string; auditLog: AuditLog }): void {
  const { db, vaultDir, auditLog } = deps;
  const notesDir = "notes";
  mkdirSync(resolveJailedPath(vaultDir, notesDir), { recursive: true });

  app.post("/api/notes", async (req, res) => {
    const { sourcePane, threadId, model, excerpt, tags } = req.body as {
      sourcePane: string;
      threadId?: string;
      model?: string;
      excerpt: string;
      tags?: string[];
    };
    if (!excerpt) return res.status(400).json({ error: "excerpt required" });

    const id = uuid();
    const createdAt = new Date().toISOString();
    const relPath = `${notesDir}/${id}.md`;
    const fullPath = resolveJailedPath(vaultDir, relPath);

    const file = matter.stringify(excerpt, {
      source_pane: sourcePane,
      thread_id: threadId ?? null,
      model: model ?? null,
      tags: tags ?? [],
      created_at: createdAt,
    });
    writeFileSync(fullPath, file, "utf8");

    db.prepare(
      `INSERT INTO notes (id, source_pane, thread_id, model, excerpt, note_path, tags_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, sourcePane, threadId ?? null, model ?? null, excerpt, relPath, JSON.stringify(tags ?? []), createdAt);

    await auditLog.append({ action: "note.save", actor: "user", target: relPath, detail: { sourcePane } });
    res.json({ id, path: relPath });
  });

  app.get("/api/notes", (_req, res) => {
    const rows = db.prepare(`SELECT * FROM notes ORDER BY created_at DESC`).all();
    res.json({ notes: rows });
  });

  app.get("/api/notes/:id", (req, res) => {
    const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(req.params.id) as
      | { note_path: string }
      | undefined;
    if (!row) return res.status(404).json({ error: "not found" });

    const fullPath = resolveJailedPath(vaultDir, row.note_path);
    const { data, content } = matter(readFileSync(fullPath, "utf8"));
    res.json({ ...row, frontmatter: data, content });
  });
}
