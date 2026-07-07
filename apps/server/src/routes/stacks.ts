import type { Express } from "express";
import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

interface StackItemInput {
  toolId: string;
  category: string;
}

/** Normalizes every tool's cost onto a single "monthly-equivalent" basis so a stack of mixed one-time/subscription/usage tools can be compared against one budget. One-time costs are NOT amortized here — they're reported separately, since a $500 one-time tool isn't equivalent to $500/month. */
function monthlyEquivalentCents(costType: string, amountCents: number | null, costPer: string | null): number {
  if (costType === "free" || costType === "freemium") return 0;
  if (amountCents == null) return 0;
  if (costType === "one_time") return 0; // reported under oneTimeCents instead
  if (costPer === "month") return amountCents;
  if (costPer === "project") return amountCents; // treated as a flat project cost, not monthly
  return amountCents; // usage_based / unit: best-effort, shown as an estimate
}

export function registerStackRoutes(app: Express, deps: { db: Database.Database }): void {
  const { db } = deps;

  app.post("/api/stacks", (req, res) => {
    const { name, budgetCents, budgetPeriod, items } = req.body as {
      name: string;
      budgetCents?: number;
      budgetPeriod?: "project" | "month";
      items: StackItemInput[];
    };
    if (!name || !items?.length) return res.status(400).json({ error: "name and items[] required" });

    const id = uuid();
    db.prepare(`INSERT INTO stacks (id, name, budget_cents, budget_period, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      name,
      budgetCents ?? null,
      budgetPeriod ?? null,
      new Date().toISOString(),
    );

    for (const item of items) {
      db.prepare(`INSERT INTO stack_items (id, stack_id, tool_id, category) VALUES (?, ?, ?, ?)`).run(uuid(), id, item.toolId, item.category);
    }

    res.json(buildStackSummary(db, id));
  });

  app.get("/api/stacks", (_req, res) => {
    const stacks = db.prepare(`SELECT id FROM stacks ORDER BY created_at DESC`).all() as { id: string }[];
    res.json({ stacks: stacks.map((s) => buildStackSummary(db, s.id)) });
  });

  app.get("/api/stacks/:id", (req, res) => {
    const stack = db.prepare(`SELECT id FROM stacks WHERE id = ?`).get(req.params.id);
    if (!stack) return res.status(404).json({ error: "not found" });
    res.json(buildStackSummary(db, req.params.id));
  });
}

function buildStackSummary(db: Database.Database, stackId: string) {
  const stack = db.prepare(`SELECT * FROM stacks WHERE id = ?`).get(stackId) as {
    id: string;
    name: string;
    budget_cents: number | null;
    budget_period: string | null;
  };

  const items = db
    .prepare(
      `SELECT stack_items.category as itemCategory, tools.* FROM stack_items
       JOIN tools ON tools.id = stack_items.tool_id
       WHERE stack_items.stack_id = ?`,
    )
    .all(stackId) as Array<Record<string, unknown> & { cost_type: string; cost_amount_cents: number | null; cost_per: string | null }>;

  let monthlyCents = 0;
  let oneTimeCents = 0;
  for (const item of items) {
    if (item.cost_type === "one_time" && item.cost_amount_cents) {
      oneTimeCents += item.cost_amount_cents;
    } else {
      monthlyCents += monthlyEquivalentCents(item.cost_type, item.cost_amount_cents, item.cost_per);
    }
  }

  const overBudget =
    stack.budget_cents != null &&
    (stack.budget_period === "project" ? oneTimeCents + monthlyCents > stack.budget_cents : monthlyCents > stack.budget_cents);

  return {
    id: stack.id,
    name: stack.name,
    budgetCents: stack.budget_cents,
    budgetPeriod: stack.budget_period,
    items,
    totals: { monthlyCents, oneTimeCents },
    overBudget,
  };
}
