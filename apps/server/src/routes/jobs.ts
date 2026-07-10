import type { Express } from "express";
import type Database from "better-sqlite3";
import * as cron from "node-cron";
import { v4 as uuid } from "uuid";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import type { JobScheduler } from "../jobs/scheduler.js";
import { isBuildRestricted, BUILD_RESTRICTED_MESSAGE } from "../adapters/build-restriction.js";

export function registerJobRoutes(app: Express, deps: { db: Database.Database; providers: Map<string, ChatProvider>; scheduler: JobScheduler }): void {
  const { db, providers, scheduler } = deps;

  app.post("/api/jobs", (req, res) => {
    const { name, cronExpr, adapter, model, promptRef, costCapCents } = req.body as {
      name: string;
      cronExpr: string;
      adapter: string;
      model: string;
      promptRef: string;
      costCapCents: number;
    };
    if (!name || !cronExpr || !adapter || !model || !promptRef || costCapCents == null) {
      return res.status(400).json({ error: "name, cronExpr, adapter, model, promptRef, costCapCents required" });
    }
    if (!cron.validate(cronExpr)) return res.status(400).json({ error: "invalid cron expression" });

    const provider = providers.get(adapter);
    if (!provider) return res.status(400).json({ error: `Unknown provider "${adapter}"` });
    if (!provider.requiresApiKey) {
      return res.status(400).json({ error: "scheduled jobs may only use API-key adapters, never a web-session adapter" });
    }
    if (isBuildRestricted(provider)) return res.status(403).json({ error: BUILD_RESTRICTED_MESSAGE });

    const id = uuid();
    db.prepare(
      `INSERT INTO jobs (id, name, cron, adapter, model, prompt_ref, enabled, cost_cap_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, name, cronExpr, adapter, model, promptRef, costCapCents, new Date().toISOString());

    scheduler.schedule({ id, name, cron: cronExpr, adapter, model, prompt_ref: promptRef, enabled: 1, cost_cap_cents: costCapCents });
    res.json({ id });
  });

  app.get("/api/jobs", (_req, res) => {
    res.json({ jobs: db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all() });
  });

  app.patch("/api/jobs/:id", (req, res) => {
    const { enabled } = req.body as { enabled: boolean };
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id) as any;
    if (!job) return res.status(404).json({ error: "not found" });

    db.prepare(`UPDATE jobs SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, req.params.id);
    if (enabled) {
      scheduler.schedule({ ...job, enabled: 1 });
    } else {
      scheduler.unschedule(req.params.id);
    }
    res.json({ ok: true });
  });

  app.delete("/api/jobs/:id", (req, res) => {
    scheduler.unschedule(req.params.id);
    db.prepare(`DELETE FROM jobs WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/jobs/:id/run-now", async (req, res) => {
    try {
      const result = await scheduler.runJob(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
