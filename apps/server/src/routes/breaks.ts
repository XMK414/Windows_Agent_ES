import type { Express } from "express";
import type Database from "better-sqlite3";

const MIN_INTERVAL = 25;
const MAX_INTERVAL = 100;
const STEP = 5;

/** Break-reminder settings are a single row (single-user local app, no need for a table of users). */
export function registerBreakRoutes(app: Express, deps: { db: Database.Database }): void {
  const { db } = deps;

  app.get("/api/breaks/settings", (_req, res) => {
    const row = db.prepare(`SELECT * FROM break_settings WHERE id = 'default'`).get() as
      | { interval_minutes: number; enabled: number; exercise_types_json: string | null }
      | undefined;

    if (!row) {
      return res.json({ intervalMinutes: MIN_INTERVAL, enabled: true, exerciseTypes: ["breathing", "neck", "full-body-scan", "meditation"] });
    }
    res.json({
      intervalMinutes: row.interval_minutes,
      enabled: Boolean(row.enabled),
      exerciseTypes: row.exercise_types_json ? JSON.parse(row.exercise_types_json) : [],
    });
  });

  app.post("/api/breaks/settings", (req, res) => {
    const { intervalMinutes, enabled, exerciseTypes } = req.body as {
      intervalMinutes: number;
      enabled: boolean;
      exerciseTypes: string[];
    };

    if (intervalMinutes < MIN_INTERVAL || intervalMinutes > MAX_INTERVAL || intervalMinutes % STEP !== 0) {
      return res.status(400).json({ error: `intervalMinutes must be between ${MIN_INTERVAL} and ${MAX_INTERVAL} in steps of ${STEP}` });
    }

    db.prepare(
      `INSERT INTO break_settings (id, interval_minutes, enabled, exercise_types_json) VALUES ('default', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET interval_minutes = excluded.interval_minutes, enabled = excluded.enabled, exercise_types_json = excluded.exercise_types_json`,
    ).run(intervalMinutes, enabled ? 1 : 0, JSON.stringify(exerciseTypes ?? []));

    res.json({ ok: true });
  });
}
