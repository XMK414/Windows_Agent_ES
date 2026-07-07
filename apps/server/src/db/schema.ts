export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  cost_type TEXT NOT NULL, -- free | freemium | subscription | one_time | usage_based
  cost_amount_cents INTEGER,
  cost_per TEXT, -- project | month | unit
  terms_summary TEXT,
  terms_url TEXT,
  hosting TEXT NOT NULL, -- self | hosted | both
  license TEXT, -- open_source | proprietary
  ease_of_use INTEGER, -- 1-5
  speed INTEGER, -- 1-5
  quality INTEGER, -- 1-5
  privacy INTEGER, -- 1-5, data privacy / security posture
  vendor_lock_in INTEGER, -- 1-5, 5 = easiest to migrate away from
  integrations INTEGER, -- 1-5, API/ecosystem breadth
  support INTEGER, -- 1-5, community & support quality
  scalability INTEGER, -- 1-5
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stacks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  budget_cents INTEGER,
  budget_period TEXT, -- project | month
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stack_items (
  id TEXT PRIMARY KEY,
  stack_id TEXT NOT NULL REFERENCES stacks(id),
  tool_id TEXT NOT NULL REFERENCES tools(id),
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS break_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  interval_minutes INTEGER NOT NULL DEFAULT 25,
  enabled INTEGER NOT NULL DEFAULT 1,
  exercise_types_json TEXT
);

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  source TEXT NOT NULL,
  overall_risk TEXT,
  summary TEXT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  pane_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  persona_id TEXT,
  created_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provenance_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'human',
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  source_pane TEXT NOT NULL,
  thread_id TEXT REFERENCES threads(id),
  model TEXT,
  excerpt TEXT NOT NULL,
  note_path TEXT NOT NULL,
  tags_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT,
  checksum TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_ref TEXT NOT NULL,
  created_by_pane TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  thread_id TEXT REFERENCES threads(id),
  order_idx INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_ref TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cost_cap_cents INTEGER NOT NULL,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  thread_id TEXT REFERENCES threads(id),
  created_at TEXT NOT NULL
);
`;
