import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema.js";

export function openDb(dbPath: string): Database.Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  migrate(db);
  return db;
}

/** Idempotent column additions for DBs created before a column existed —
 * SQLite has no "ADD COLUMN IF NOT EXISTS", so we check pragma table_info. */
function migrate(db: Database.Database): void {
  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn("projects", "description", "TEXT");
  ensureColumn("projects", "phase", "TEXT NOT NULL DEFAULT 'DISCOVERY'");
  ensureColumn("projects", "started_at", "TEXT");
}
