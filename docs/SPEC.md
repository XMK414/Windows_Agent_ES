# Windows Agent ES — Architecture Spec

## 1. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (multiple windows/tabs, one PWA)                        │
│  /combined  /claude  /gemini  /library  /projects  /pm  /memory   │
└───────────────▲───────────────────────────────────────┬─────────┘
                 │ HTTPS (localhost) + WebSocket           │
┌────────────────┴──────────────────────────────────────────────────┐
│  Local server (Node/TypeScript, bound to 127.0.0.1)                 │
│                                                                      │
│  ┌───────────┐ ┌────────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │ Auth /     │ │ Provider   │ │ Injection │ │ Audit log          │  │
│  │ CSRF       │ │ adapters   │ │ resolver  │ │ (hash-chained)      │  │
│  └───────────┘ └─────┬──────┘ └─────┬─────┘ └───────────────────┘  │
│                       │              │                              │
│  ┌───────────┐ ┌──────▼──────┐ ┌────▼──────┐ ┌───────────────────┐ │
│  │ Secrets    │ │ CLI executor│ │ Path-jail │ │ Cost ledger /      │ │
│  │ vault      │ │ (pty)       │ │           │ │ spend caps          │ │
│  └───────────┘ └─────────────┘ └───────────┘ └───────────────────┘ │
└───────────────────────────────┬──────────────────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────┐
        ▼                        ▼                          ▼
  SQLite (state)          Filesystem                  External APIs
  threads/messages   projects/ files/ artifacts/   Anthropic, Google
  libraries/goals     vault/ (Obsidian)             (+ optional web-session
  audit_log/cost                                     adapters via Playwright,
                                                       isolated profile)
```

## 2. Repository layout (target, post-build)

```
Windows_Agent_ES/
  docs/                   PLAN.md, SPEC.md, SECURITY.md
  snippets/               reference implementations (this commit)
  library-templates/      starter .md files for each library type
  apps/
    server/               Node/TS backend
      src/
        adapters/         ChatProvider implementations
        security/          secrets-vault, cli-executor, path-jail, auth
        injection/         context resolver / @mention resolution
        routes/            REST + WS handlers
        db/                schema + migrations
    web/                  React/Vite frontend
  data/                   gitignored: sqlite db, vault, projects, secrets
```

## 3. Data model (SQLite)

```
threads(id, pane_id, provider, model, persona_id, created_at, archived)
messages(id, thread_id, role, content, provenance_json, created_at)
library_items(id, type, name, path, tags_json, created_at, updated_at)
  -- type: 'prompt' | 'agent' | 'rule' | 'skill' | 'persona'
  -- path points into library-templates/ or a user library dir; content is
  -- markdown+frontmatter, DB row is an index for search/tagging
notes(id, source_pane, thread_id, model, excerpt, note_path, tags_json, created_at)
files(id, project_id, rel_path, size, mime, checksum, uploaded_at)
artifacts(id, project_id, name, version, content_ref, created_by_pane, created_at)
goals(id, project_id, title, status, created_at)
steps(id, goal_id, title, status, thread_id, order_idx)
jobs(id, name, cron, adapter, prompt_ref, enabled, cost_cap_cents, last_run_at)
cost_ledger(id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at)
audit_log(id, ts, actor, action, target, detail_json, prev_hash, hash)
```

Notes:
- `provenance_json` on `messages` records every injected context item (id,
  type, source) so a response can always be traced back to what was fed in.
- `audit_log` is append-only; each row's `hash` covers `prev_hash` plus its
  own fields, giving a tamper-evident chain (see `snippets/server/security/audit-log.ts`).

## 4. Provider adapter contract

All four chat surfaces (Claude x3, Gemini, plus solo windows) talk to a
single interface so the UI never special-cases a provider:

```ts
interface ChatProvider {
  readonly id: string;            // 'anthropic-api' | 'google-api' | 'claude-web' | 'gemini-web'
  listModels(): Promise<ModelInfo[]>;
  send(req: ChatRequest): AsyncIterable<StreamChunk>;
}
```

See `snippets/server/adapters/provider-adapter.interface.ts` and the
Anthropic implementation for the concrete shape. Web-session adapters
implement the same interface but are only ever invoked from interactive
routes — the job runner (`jobs` table) is hard-restricted to adapters whose
`id` ends in `-api`.

## 5. Library file schema

Every library item is a markdown file with YAML frontmatter. The DB row is
just an index; the file is the source of truth (so it's diffable in git and
editable directly).

```markdown
---
type: persona            # prompt | agent | rule | skill | persona
name: "Skeptical Reviewer"
tags: [board-of-directors, review]
owner: human             # human | agent  (agents may only write owner: agent items)
version: 1
---

Body content: the actual system-prompt fragment, rule text, skill
description, or prompt template.
```

`owner: human` items are read-only to every agent/adapter — enforced in the
injection resolver, not just the UI, so an agent invoking the API directly
still can't overwrite one. See `library-templates/` for one example of each
type.

## 6. Injection ("@mention") contract

The resolver turns a reference list into fenced, provenance-tagged blocks
appended to the outgoing request — never merged silently into the system
prompt as if the user typed it:

```
<injected-context source="file:projects/acme/notes/kickoff.md" trust="user">
...file content...
</injected-context>
<injected-context source="library:persona/skeptical-reviewer" trust="human-authored">
...persona body...
</injected-context>
```

The resolver also carries a `trust` tag (`user`, `human-authored`, `agent-authored`,
`web-fetched`) forwarded to the model as context, and the base system prompt
instructs models that content inside `<injected-context>` is data, not
instructions, unless its `trust` is `human-authored`. This is a mitigation,
not a guarantee — see `docs/SECURITY.md` §5.

## 7. CLI executor contract

The embedded terminal never runs a free-form shell string:

```ts
interface CliExecutor {
  run(cmd: string, args: string[], opts: { cwd: string }): Promise<CliResult>;
}
```

`cmd` must be in a configured allowlist (e.g. `claude`, `git`, `node`); `cwd`
must resolve inside the active project root via the path-jail helper; every
call is written to `audit_log` before it starts (not just on completion, so
a crash doesn't hide that it ran).

## 8. Board of Directors orchestration

```ts
interface BoardRequest {
  prompt: string;
  seats: { adapterId: string; model: string; personaId: string }[];
  chair: { adapterId: string; model: string };
}
```

Flow: fan `prompt` + each seat's persona out in parallel via the adapters
above → collect all responses (labelled by seat) → feed them, plus the
original prompt, to the `chair` adapter for a synthesis pass. Every seat
response and the synthesis are stored as sibling `messages` under one
`thread`, so the whole session is one reviewable artifact.

## 9. REST/WS surface (v1)

```
POST   /api/threads                       create thread (pane, provider, model, persona)
POST   /api/threads/:id/messages          send message (body: content, injections[])
GET    /api/threads/:id/stream (WS)        streamed assistant response
GET    /api/library?type=&q=               search library items
POST   /api/library                        create/update a library item (owner-checked)
POST   /api/notes                          save a highlighted excerpt
GET    /api/projects/:id/files             list shared files
POST   /api/projects/:id/files             upload (size/type checked, path-jailed)
POST   /api/cli/run                        run an allowlisted command
POST   /api/board/run                      Board of Directors fan-out + synthesis
GET    /api/memory/query?q=                 NotebookLM-style retrieval + answer
GET    /api/cost/summary                   usage/cost rollup
GET    /api/audit                          paginated audit log (read-only)
```

All routes require the local auth token (§ SECURITY.md) except a health
check.
