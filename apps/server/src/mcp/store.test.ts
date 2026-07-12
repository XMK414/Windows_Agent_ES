import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../db/schema.js";
import { seedConnectors, listConnectors, setConnectorFlags, upsertConnector, DEFAULT_CONNECTORS, slugify } from "./store.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}

describe("mcp connector store", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = freshDb();
  });

  it("seeds the default connectors, all locked and routed, and is idempotent", () => {
    seedConnectors(db);
    seedConnectors(db); // second call must not duplicate
    const list = listConnectors(db);
    expect(list).toHaveLength(DEFAULT_CONNECTORS.length);
    expect(list.every((c) => c.locked === 1 && c.routed === 1)).toBe(true);
    expect(list.map((c) => c.name)).toContain("Stripe");
  });

  it("preserves user edits across a reseed", () => {
    seedConnectors(db);
    setConnectorFlags(db, "spotify", { routed: false });
    seedConnectors(db);
    expect(listConnectors(db).find((c) => c.id === "spotify")!.routed).toBe(0);
  });

  it("cannot route a connector that isn't locked in", () => {
    seedConnectors(db);
    const unlocked = setConnectorFlags(db, "dropbox", { locked: false });
    expect(unlocked!.locked).toBe(0);
    expect(unlocked!.routed).toBe(0); // unlocking forces routed off
    const tryRoute = setConnectorFlags(db, "dropbox", { routed: true });
    expect(tryRoute!.routed).toBe(0); // still can't route while unlocked
  });

  it("upserts a custom connector by slug", () => {
    const c = upsertConnector(db, { id: slugify("My Tool"), name: "My Tool", type: "Web", status: "Connected" });
    expect(c.id).toBe("my-tool");
    expect(c.locked).toBe(1);
  });
});
