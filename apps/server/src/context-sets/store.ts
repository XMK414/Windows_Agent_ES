import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

/**
 * A context set is a named, swappable bundle of the reusable pieces that steer
 * work on a project: a system prompt, rules, restraints, a plan.md, and free
 * notes. Each project can keep several and swap which one is "active"; sets with
 * a null project are global/library sets. Starter templates seed new ones.
 */
export interface ContextSet {
  id: string;
  project_id: string | null;
  name: string;
  prompt: string;
  rules: string;
  restraints: string;
  plan_md: string;
  notes: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface ContextSetTemplate {
  name: string;
  prompt: string;
  rules: string;
  restraints: string;
  plan_md: string;
  notes: string;
}

export const CONTEXT_SET_TEMPLATES: ContextSetTemplate[] = [
  {
    name: "Blank",
    prompt: "",
    rules: "",
    restraints: "",
    plan_md: "# Plan\n\n## Goal\n\n## Milestones\n1. \n2. \n3. \n\n## Notes\n",
    notes: "",
  },
  {
    name: "Product build partner",
    prompt:
      "You are my senior build partner. Bias toward the simplest thing that works, ship in small verifiable slices, and tell me when I'm overbuilding.",
    rules: "- Match the surrounding code's style and conventions.\n- Write a test for anything non-trivial.\n- Explain tradeoffs briefly, then recommend one path.",
    restraints: "- No new dependencies without asking.\n- No large refactors bundled into a feature.\n- Never touch secrets or push without being asked.",
    plan_md: "# Plan\n\n## Problem\n\n## Approach\n\n## Steps\n1. \n2. \n3. \n\n## Done when\n",
    notes: "",
  },
  {
    name: "Research & synthesis",
    prompt: "You are a rigorous research analyst. Prefer primary sources, cite them, separate fact from inference, and flag uncertainty.",
    rules: "- Cite every non-obvious claim.\n- State confidence levels.\n- Give the answer first, then the support.",
    restraints: "- Do not speculate beyond the evidence.\n- Note when something couldn't be verified.",
    plan_md: "# Research plan\n\n## Question\n\n## Sub-questions\n- \n\n## Sources to check\n- \n\n## Findings\n",
    notes: "",
  },
  {
    name: "Content ops",
    prompt: "You are a content operations assistant. Keep voice consistent, structure for skimming, and always produce a title + hook + body.",
    rules: "- Lead with the hook.\n- Short paragraphs.\n- End with one clear call to action.",
    restraints: "- Stay on-brand.\n- No unverifiable claims.",
    plan_md: "# Content plan\n\n## Piece\n\n## Audience\n\n## Outline\n1. \n2. \n3. \n",
    notes: "",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

/** Sets visible for a project: its own sets plus global (null-project) sets. */
export function listSets(db: Database.Database, projectId?: string): ContextSet[] {
  if (projectId) {
    return db
      .prepare(`SELECT * FROM context_sets WHERE project_id = ? OR project_id IS NULL ORDER BY updated_at DESC`)
      .all(projectId) as ContextSet[];
  }
  return db.prepare(`SELECT * FROM context_sets WHERE project_id IS NULL ORDER BY updated_at DESC`).all() as ContextSet[];
}

export function getSet(db: Database.Database, id: string): ContextSet | undefined {
  return db.prepare(`SELECT * FROM context_sets WHERE id = ?`).get(id) as ContextSet | undefined;
}

export function createSet(
  db: Database.Database,
  input: { projectId?: string | null; name: string; prompt?: string; rules?: string; restraints?: string; plan_md?: string; notes?: string },
): ContextSet {
  const id = uuid();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO context_sets (id, project_id, name, prompt, rules, restraints, plan_md, notes, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    input.projectId ?? null,
    input.name,
    input.prompt ?? "",
    input.rules ?? "",
    input.restraints ?? "",
    input.plan_md ?? "",
    input.notes ?? "",
    ts,
    ts,
  );
  return getSet(db, id)!;
}

const UPDATABLE = ["name", "prompt", "rules", "restraints", "plan_md", "notes"] as const;

export function updateSet(db: Database.Database, id: string, patch: Partial<Record<(typeof UPDATABLE)[number], string>>): ContextSet | undefined {
  const set = getSet(db, id);
  if (!set) return undefined;
  for (const field of UPDATABLE) {
    if (patch[field] !== undefined) db.prepare(`UPDATE context_sets SET ${field} = ? WHERE id = ?`).run(patch[field], id);
  }
  db.prepare(`UPDATE context_sets SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
  return getSet(db, id);
}

/** Make one set the active (swapped-in) set for its project, clearing the rest. */
export function activateSet(db: Database.Database, id: string): ContextSet | undefined {
  const set = getSet(db, id);
  if (!set) return undefined;
  const tx = db.transaction(() => {
    if (set.project_id === null) {
      db.prepare(`UPDATE context_sets SET active = 0 WHERE project_id IS NULL`).run();
    } else {
      db.prepare(`UPDATE context_sets SET active = 0 WHERE project_id = ?`).run(set.project_id);
    }
    db.prepare(`UPDATE context_sets SET active = 1 WHERE id = ?`).run(id);
  });
  tx();
  return getSet(db, id);
}

export function deleteSet(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM context_sets WHERE id = ?`).run(id);
}
