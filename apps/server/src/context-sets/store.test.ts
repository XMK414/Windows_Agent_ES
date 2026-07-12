import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../db/schema.js";
import { createSet, listSets, updateSet, activateSet, deleteSet, getSet, CONTEXT_SET_TEMPLATES } from "./store.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}

describe("context-set store", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = freshDb();
  });

  it("ships starter templates", () => {
    expect(CONTEXT_SET_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(CONTEXT_SET_TEMPLATES.map((t) => t.name)).toContain("Blank");
  });

  it("creates and lists sets, scoped to a project plus globals", () => {
    createSet(db, { projectId: "p1", name: "A" });
    createSet(db, { projectId: "p2", name: "B" });
    createSet(db, { projectId: null, name: "Global" });

    const forP1 = listSets(db, "p1").map((s) => s.name).sort();
    expect(forP1).toEqual(["A", "Global"]);

    const globals = listSets(db).map((s) => s.name);
    expect(globals).toEqual(["Global"]);
  });

  it("updates fields and bumps updated_at", () => {
    const set = createSet(db, { projectId: "p1", name: "A", prompt: "old" });
    const updated = updateSet(db, set.id, { prompt: "new", rules: "r" });
    expect(updated?.prompt).toBe("new");
    expect(updated?.rules).toBe("r");
  });

  it("activating a set clears the others in the same project only", () => {
    const a = createSet(db, { projectId: "p1", name: "A" });
    const b = createSet(db, { projectId: "p1", name: "B" });
    const other = createSet(db, { projectId: "p2", name: "C" });

    activateSet(db, a.id);
    expect(getSet(db, a.id)!.active).toBe(1);
    activateSet(db, b.id);
    expect(getSet(db, a.id)!.active).toBe(0);
    expect(getSet(db, b.id)!.active).toBe(1);
    // A different project is untouched.
    activateSet(db, other.id);
    expect(getSet(db, other.id)!.active).toBe(1);
    expect(getSet(db, b.id)!.active).toBe(1);
  });

  it("deletes a set", () => {
    const a = createSet(db, { projectId: "p1", name: "A" });
    deleteSet(db, a.id);
    expect(getSet(db, a.id)).toBeUndefined();
  });
});
