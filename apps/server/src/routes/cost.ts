import type { Express } from "express";
import type Database from "better-sqlite3";

export function registerCostRoutes(app: Express, deps: { db: Database.Database }): void {
  const { db } = deps;

  app.get("/api/cost/summary", (req, res) => {
    const days = Number(req.query.days ?? 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const byProviderModel = db
      .prepare(
        `SELECT provider, model,
                SUM(tokens_in) as tokensIn,
                SUM(tokens_out) as tokensOut,
                SUM(cost_cents) as costCents,
                COUNT(*) as calls
         FROM cost_ledger
         WHERE created_at >= ?
         GROUP BY provider, model
         ORDER BY costCents DESC`,
      )
      .all(since);

    const byDay = db
      .prepare(
        `SELECT substr(created_at, 1, 10) as day,
                SUM(tokens_in) as tokensIn,
                SUM(tokens_out) as tokensOut,
                SUM(cost_cents) as costCents
         FROM cost_ledger
         WHERE created_at >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .all(since);

    const total = db
      .prepare(`SELECT SUM(cost_cents) as costCents, COUNT(*) as calls FROM cost_ledger WHERE created_at >= ?`)
      .get(since) as { costCents: number | null; calls: number };

    res.json({ days, byProviderModel, byDay, total: { costCents: total.costCents ?? 0, calls: total.calls } });
  });
}
