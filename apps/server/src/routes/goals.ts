import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import type { AuditLog } from "../security/audit-log.js";

const GOAL_STATUSES = ["todo", "doing", "blocked", "done"] as const;
const STEP_STATUSES = GOAL_STATUSES;

export function registerGoalRoutes(app: Express, deps: { db: Database.Database; auditLog: AuditLog }): void {
  const { db, auditLog } = deps;

  app.post("/api/projects/:id/goals", (req, res) => {
    const { title } = req.body as { title: string };
    if (!title) return res.status(400).json({ error: "title required" });

    const id = uuid();
    db.prepare(`INSERT INTO goals (id, project_id, title, status, created_at) VALUES (?, ?, ?, 'todo', ?)`).run(
      id,
      req.params.id,
      title,
      new Date().toISOString(),
    );
    res.json({ id, title, status: "todo" });
  });

  app.get("/api/projects/:id/goals", (req, res) => {
    const goals = db.prepare(`SELECT * FROM goals WHERE project_id = ? ORDER BY created_at ASC`).all(req.params.id) as { id: string }[];
    const withSteps = goals.map((goal) => ({
      ...goal,
      steps: db.prepare(`SELECT * FROM steps WHERE goal_id = ? ORDER BY order_idx ASC`).all(goal.id),
    }));
    res.json({ goals: withSteps });
  });

  app.patch("/api/goals/:id", async (req, res) => {
    const { status } = req.body as { status: string };
    if (!GOAL_STATUSES.includes(status as (typeof GOAL_STATUSES)[number])) {
      return res.status(400).json({ error: `status must be one of ${GOAL_STATUSES.join(", ")}` });
    }
    db.prepare(`UPDATE goals SET status = ? WHERE id = ?`).run(status, req.params.id);
    await auditLog.append({ action: "goal.status", actor: "user", target: req.params.id, detail: { status } });
    res.json({ ok: true });
  });

  app.post("/api/goals/:id/steps", (req, res) => {
    const { title, threadId } = req.body as { title: string; threadId?: string };
    if (!title) return res.status(400).json({ error: "title required" });

    const { maxOrder } = db.prepare(`SELECT MAX(order_idx) as maxOrder FROM steps WHERE goal_id = ?`).get(req.params.id) as {
      maxOrder: number | null;
    };
    const id = uuid();
    db.prepare(`INSERT INTO steps (id, goal_id, title, status, thread_id, order_idx) VALUES (?, ?, ?, 'todo', ?, ?)`).run(
      id,
      req.params.id,
      title,
      threadId ?? null,
      (maxOrder ?? -1) + 1,
    );
    res.json({ id, title, status: "todo" });
  });

  app.patch("/api/steps/:id", async (req, res) => {
    const { status } = req.body as { status: string };
    if (!STEP_STATUSES.includes(status as (typeof STEP_STATUSES)[number])) {
      return res.status(400).json({ error: `status must be one of ${STEP_STATUSES.join(", ")}` });
    }
    db.prepare(`UPDATE steps SET status = ? WHERE id = ?`).run(status, req.params.id);
    await auditLog.append({ action: "step.status", actor: "user", target: req.params.id, detail: { status } });
    res.json({ ok: true });
  });
}
