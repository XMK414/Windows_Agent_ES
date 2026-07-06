# Windows Agent ES — Build Plan

## Vision

One machine-local "Everything Station" for AI work: a multiplexed chat surface
across Claude (x3) and Gemini, backed by shared libraries (prompts, agents,
rules, skills, personas), shared files/projects/artifacts, an embedded CLI,
long-term memory in Obsidian, project management, and multi-agent
orchestration ("Board of Directors") — all running locally, secrets never
leaving the machine.

## Guiding principles

- **Local-first.** Server binds to `127.0.0.1` by default. No LAN/multi-laptop
  exposure until it's explicitly asked for and secured.
- **API keys are the reliable engine.** Web-session wrapping (reusing
  claude.ai / gemini.google.com logins) is an optional convenience layer for
  interactive foreground chat only — never used for cron/automation, since
  that needs a session that's always valid and revocable.
- **Every injection, file write, and CLI command is logged.** The audit log
  is not optional and not a v2 feature.
- **Agent-writable vs human-only is explicit.** Rule/agent-definition
  libraries are human-edited by default; agents don't silently rewrite their
  own constraints.
- **Ship a usable single-machine tool before layering automation.** Phases
  0–3 produce something usable daily; 4–7 add power features on that base.

## Phases

### Phase 0 — Foundations
- Monorepo skeleton (server + web UI)
- Secrets vault (OS-backed) wired before any real API key touches disk
- Local auth (token/session + CSRF) for the server, even though it's
  localhost-only
- Audit log module (append-only, hash-chained)
- `.gitignore` / secret-scanning pre-commit hook
- CI: lint, typecheck, dependency audit

### Phase 1 — Core multiplexed chat
- Provider adapter interface
- Anthropic API adapter (drives Claude #1/#2/#3 as three independent
  sessions — no shared state, no cross-talk unless explicitly piped)
- Google API adapter (Gemini)
- Combined 4-pane chat window (Claude, Gemini, Claude #2, Claude #3)
- Two solo windows (Claude w/ model switcher, Gemini w/ model switcher)
- Streaming responses, per-pane conversation state, save/resume threads

### Phase 2 — Highlight-to-note + libraries
- Text-selection capture in input & output panes → "Save to Notes"
- Notes stored as Obsidian-vault-shaped markdown (frontmatter: source pane,
  model, thread id, timestamp, tags)
- Prompt library (CRUD, tagging, search)
- Agent `.md` library (persona-style system prompts per "agent")
- Agent rules library (reusable rule blocks, composable into a system prompt)
- Skills library + Persona library (skills = capability blocks, personas =
  voice/tone/role blocks — both composable, kept distinct from full agent
  definitions)
- `@mention` injection picker usable from all 5 chat surfaces, pulling from
  every library + notes + files, each injection provenance-tagged

### Phase 3 — Shared projects, files, artifacts, CLI
- Shared "Projects" folder visible from all agent windows, with a
  per-folder read/write permission model
- Shared Files browser (upload, tag, inject)
- Artifacts system (versioned, diffable; one artifact produced in any pane
  is reopenable in any other)
- Embedded Claude CLI terminal pane (xterm.js + pty): allowlisted commands,
  cwd jailed to the project root, every invocation audit-logged
- Path-jail helper used everywhere a user- or agent-supplied path resolves
  to disk

### Phase 4 — Automation & multi-agent orchestration
- Cron/scheduled jobs (node-cron or Windows Task Scheduler) — API-key
  adapters only, never the web-session adapters; cost-capped
- Automated tasks (e.g. "daily inbox summary", "reindex memory")
- Board of Directors mode: fan one prompt out to N adapters+personas in
  parallel, then a synthesis pass by a designated chair model
- Compare-answers view (side-by-side, pick/merge)
- Cost & usage dashboard (token/$ per model/project/day) with spend caps
  and alerts

### Phase 5 — Shared memory & retrieval
- Obsidian vault wired as canonical long-term memory
- Local embedding index (e.g. `sqlite-vec`) over notes/prompts/library/chat
  history/project files
- NotebookLM-style global query bar: retrieve top-k + citations, answer via
  chosen model
- Memory write-back: agents can propose new memory notes; human-approve by
  default (configurable per project)

### Phase 6 — Project management
- Goals list → actionable steps → status (todo/doing/blocked/done)
- Steps linkable to a chat thread / artifact / project
- Kanban-style board view
- Board of Directors can review goals/steps and propose next actions

### Phase 7 — Polish & cross-machine
- Voice in/out (optional, per pane)
- Macro runner (saved prompt + injected context → one-click)
- Multi-laptop sync design (Obsidian vault + shared folder via
  Syncthing/OneDrive) — revisit once the solo build is stable
- Electron wrapper (optional) for native multi-window/tray feel

## Definition of done per phase

Each phase ships when: the feature works end-to-end in the browser UI, the
relevant audit-log events fire, and any new secret/file/CLI surface has been
checked against `docs/SECURITY.md`.
