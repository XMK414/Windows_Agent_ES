import type { Express } from "express";
import type Database from "better-sqlite3";
import { CONTEXT_SET_TEMPLATES, listSets, getSet, createSet, updateSet, activateSet, deleteSet } from "../context-sets/store.js";

/**
 * Context sets power the Macros surface: named, swappable bundles of
 * prompt/rules/restraints/plan.md/notes, seeded from templates and scopable to
 * a project so each project can keep several and swap the active one.
 */
export function registerContextSetRoutes(app: Express, deps: { db: Database.Database }): void {
  const { db } = deps;

  app.get("/api/context-sets/templates", (_req, res) => {
    res.json({ templates: CONTEXT_SET_TEMPLATES });
  });

  app.get("/api/context-sets", (req, res) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    res.json({ sets: listSets(db, projectId) });
  });

  app.get("/api/context-sets/:id", (req, res) => {
    const set = getSet(db, req.params.id);
    if (!set) return res.status(404).json({ error: "not found" });
    res.json({ set });
  });

  app.post("/api/context-sets", (req, res) => {
    const { projectId, name, prompt, rules, restraints, plan_md, notes } = req.body as {
      projectId?: string | null;
      name?: string;
      prompt?: string;
      rules?: string;
      restraints?: string;
      plan_md?: string;
      notes?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    res.json({ set: createSet(db, { projectId, name: name.trim(), prompt, rules, restraints, plan_md, notes }) });
  });

  app.patch("/api/context-sets/:id", (req, res) => {
    const set = updateSet(db, req.params.id, req.body ?? {});
    if (!set) return res.status(404).json({ error: "not found" });
    res.json({ set });
  });

  app.post("/api/context-sets/:id/activate", (req, res) => {
    const set = activateSet(db, req.params.id);
    if (!set) return res.status(404).json({ error: "not found" });
    res.json({ set });
  });

  app.delete("/api/context-sets/:id", (req, res) => {
    deleteSet(db, req.params.id);
    res.json({ ok: true });
  });
}
