import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

export interface ToolInput {
  category: string;
  name: string;
  costType: "free" | "freemium" | "subscription" | "one_time" | "usage_based";
  costAmountCents?: number;
  costPer?: "project" | "month" | "unit";
  termsSummary?: string;
  termsUrl?: string;
  hosting: "self" | "hosted" | "both";
  license?: "open_source" | "proprietary";
  easeOfUse?: number;
  speed?: number;
  quality?: number;
  privacy?: number;
  vendorLockIn?: number;
  integrations?: number;
  support?: number;
  scalability?: number;
  notes?: string;
}

const RATING_FIELDS = ["easeOfUse", "speed", "quality", "privacy", "vendorLockIn", "integrations", "support", "scalability"] as const;

export function registerToolRoutes(app: Express, deps: { db: Database.Database }): void {
  const { db } = deps;

  app.post("/api/tools", (req, res) => {
    const input = req.body as ToolInput;
    if (!input.category || !input.name || !input.costType || !input.hosting) {
      return res.status(400).json({ error: "category, name, costType, hosting required" });
    }
    for (const field of RATING_FIELDS) {
      const value = input[field];
      if (value != null && (value < 1 || value > 5)) {
        return res.status(400).json({ error: `${field} must be between 1 and 5` });
      }
    }

    const id = uuid();
    db.prepare(
      `INSERT INTO tools (
         id, category, name, cost_type, cost_amount_cents, cost_per, terms_summary, terms_url,
         hosting, license, ease_of_use, speed, quality, privacy, vendor_lock_in, integrations, support, scalability, notes, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.category,
      input.name,
      input.costType,
      input.costAmountCents ?? null,
      input.costPer ?? null,
      input.termsSummary ?? null,
      input.termsUrl ?? null,
      input.hosting,
      input.license ?? null,
      input.easeOfUse ?? null,
      input.speed ?? null,
      input.quality ?? null,
      input.privacy ?? null,
      input.vendorLockIn ?? null,
      input.integrations ?? null,
      input.support ?? null,
      input.scalability ?? null,
      input.notes ?? null,
      new Date().toISOString(),
    );
    res.json({ id });
  });

  app.get("/api/tools", (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : undefined;

    let rows = db.prepare(`SELECT * FROM tools ORDER BY category, name`).all() as { category: string; name: string }[];
    if (category) rows = rows.filter((r) => r.category === category);
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    res.json({ tools: rows });
  });

  app.get("/api/tools/categories", (_req, res) => {
    const rows = db.prepare(`SELECT DISTINCT category FROM tools ORDER BY category`).all() as { category: string }[];
    res.json({ categories: rows.map((r) => r.category) });
  });
}
