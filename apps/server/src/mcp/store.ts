import type Database from "better-sqlite3";

/**
 * A managed registry of the user's MCP connectors — the "locked in and routed"
 * inventory. This app can't invoke claude.ai connectors itself, so this is a
 * config surface: which connectors are approved (locked) and active in routing
 * (routed). Seeded from the user's connector list, then editable.
 */
export interface McpConnector {
  id: string;
  name: string;
  type: string;
  status: string;
  locked: number;
  routed: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectorSeed {
  id: string;
  name: string;
  type: string;
  status: string;
}

/** The user's current connectors. All Web, all locked in and routed by default. */
export const DEFAULT_CONNECTORS: ConnectorSeed[] = [
  { id: "courtroom5", name: "Courtroom5", type: "Web", status: "Connected" },
  { id: "dropbox", name: "Dropbox", type: "Web", status: "Connected" },
  { id: "elicit", name: "Elicit", type: "Web", status: "Connected" },
  { id: "github", name: "GitHub Integration", type: "Web", status: "Connected" },
  { id: "gmail", name: "Gmail", type: "Web", status: "Connected" },
  { id: "google-calendar", name: "Google Calendar", type: "Web", status: "Connected" },
  { id: "google-drive", name: "Google Drive", type: "Web", status: "Connected" },
  { id: "hyperframes", name: "HyperFrames by HeyGen", type: "Web", status: "Connected" },
  { id: "lovable", name: "Lovable", type: "Web", status: "Connected" },
  { id: "paypal", name: "PayPal", type: "Web", status: "Connected" },
  { id: "shopify", name: "Shopify", type: "Web", status: "Connected" },
  { id: "spotify", name: "Spotify", type: "Web", status: "Connected" },
  { id: "stripe", name: "Stripe", type: "Web", status: "Connected" },
  { id: "vercel", name: "Vercel", type: "Web", status: "Connected" },
  { id: "zoom", name: "Zoom for Claude", type: "Web", status: "Connected" },
];

/** Insert any seed connectors that aren't already present (idempotent). */
export function seedConnectors(db: Database.Database, seeds: ConnectorSeed[] = DEFAULT_CONNECTORS): void {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO mcp_connectors (id, name, type, status, locked, routed, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const s of seeds) insert.run(s.id, s.name, s.type, s.status, now, now);
  });
  tx();
}

export function listConnectors(db: Database.Database): McpConnector[] {
  return db.prepare(`SELECT * FROM mcp_connectors ORDER BY name COLLATE NOCASE ASC`).all() as McpConnector[];
}

export function getConnector(db: Database.Database, id: string): McpConnector | undefined {
  return db.prepare(`SELECT * FROM mcp_connectors WHERE id = ?`).get(id) as McpConnector | undefined;
}

export function upsertConnector(db: Database.Database, seed: ConnectorSeed): McpConnector {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mcp_connectors (id, name, type, status, locked, routed, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, status = excluded.status, updated_at = excluded.updated_at`,
  ).run(seed.id, seed.name, seed.type, seed.status, now, now);
  return getConnector(db, seed.id)!;
}

export function setConnectorFlags(
  db: Database.Database,
  id: string,
  patch: { locked?: boolean; routed?: boolean },
): McpConnector | undefined {
  const existing = getConnector(db, id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  if (patch.locked !== undefined) db.prepare(`UPDATE mcp_connectors SET locked = ? WHERE id = ?`).run(patch.locked ? 1 : 0, id);
  // A connector can't be routed if it isn't locked in.
  if (patch.routed !== undefined) {
    const locked = patch.locked ?? Boolean(existing.locked);
    db.prepare(`UPDATE mcp_connectors SET routed = ? WHERE id = ?`).run(patch.routed && locked ? 1 : 0, id);
  }
  // Unlocking forces routed off.
  if (patch.locked === false) db.prepare(`UPDATE mcp_connectors SET routed = 0 WHERE id = ?`).run(id);
  db.prepare(`UPDATE mcp_connectors SET updated_at = ? WHERE id = ?`).run(now, id);
  return getConnector(db, id);
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
