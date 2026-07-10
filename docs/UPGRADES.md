# Windows Agent ES — Upgrade Plan

Tracks the multi-section upgrade requested 2026-07. Each phase lists scope,
files, and the tests that gate it. Checked items are landed on
`claude/model-selector-openrouter-qstvma`.

## Phase 0 — Connectivity & reliability (fixes "Failed to fetch" / spinners)

Root cause of "Failed to fetch" when saving a key, projects not saving, and the
cost dashboard spinning forever: the browser origin didn't match the server's
single allowed CORS origin, so every call was blocked. Silent spinners hid it.

- [x] CORS allows both `127.0.0.1` and `localhost` on the dev/preview ports,
      and any extra origins from `WAES_WEB_ORIGINS` (comma-separated).
- [x] Async route errors return JSON 500 instead of hanging the request
      (`asyncHandler` wrapper + error middleware).
- [x] Frontend surfaces fetch failures instead of infinite "Loading…"
      (Cost dashboard, Projects) with a retry.
- [x] Tests: CORS allow-list logic; password policy; board orchestration.

## Phase 1 — Board of Directors (10-agent Counsel flow)

Rebuild to the canonical flow (supersedes the earlier 5-seat version):

1. **5 advisor agents**, fixed roles, each pressure-tests differently:
   - Contrarian — only finds fatal flaws / what kills the project.
   - First Principles — ignores the question, drills "what are you really
     doing/selling?" to the smallest clean unit.
   - Expansionist — the non-obvious upside everyone misses.
   - Outsider — gets ONLY the raw question, zero history/context.
   - Executioner — only the exact next actionable step.
2. Answers are **anonymized + shuffled** and handed to **5 separate peer-review
   agents** — they see only the answers (no author/role), and validate the
   logic, writing a review of each.
3. **Counsel Verdict agent** receives everything (answers, reviews, and each
   agent's label + role), then **asks the user clarifying questions** (team
   size, budget, current tools, desired autonomy, time/day, etc.).
4. After the user answers, the Counsel writes a **clear report**, then one
   **single clear verdict** and the **only next 3 actionable steps**, each
   broken into **micro-actions** engineered for quick, big wins.

- [x] Server: `board/counsel.ts` (roles, prompt builders, anonymize/shuffle,
      step parsing, `runAdvisory` / `runVerdict`) + phased persistence + cost.
- [x] Routes: `POST /api/board/run` (advisors→reviews→questions),
      `POST /api/board/verdict` (report + verdict + 3 micro-action steps).
- [x] Web: two-step Board UI (run → answer questions → verdict), model pickers
      per agent, provider spread.
- [x] Tests: role prompts, anonymize/shuffle strips attribution, step parser,
      full orchestration with mock providers.

## Phase 2 — Vault (full page, password-gated)

- [x] Password gate: min 12 chars, ≥2 each of lower, upper, digit, and special
      (`!@#$%^&*=+`). Shared policy util with tests.
- [x] Secret slots for Anthropic, Google, OpenRouter + **blank custom slots**
      (add-your-own name/value) for keys to be found later.
- [x] OAuth — ChatGPT via OAuth: `chatgpt-oauth` provider (OpenAI-compatible,
      configurable endpoint since a ChatGPT session token doesn't authenticate
      against api.openai.com), stored token + endpoint in the vault, selectable
      in Round Table / Board / Chat. `buildRestricted` flag enforced — the
      server refuses it on the Macros and Jobs (product-building) surfaces.
      Tests cover the flag.
- [ ] MCP connectors: list, lock-in, and route. Depends on connector inventory.

## Phase 3 — Projects (save + detail)

- [ ] Project detail view: Description, Date Started, and a work-log (each entry
      = date + brief of what was done).
- [ ] Phase label per project: Discovery → Architecture → Construction →
      Verify Quality → Ship.
- [ ] Server: `description`, `phase`, `started_at` columns + `project_log` table
      + routes. Tests for log append and phase transitions.

## Phase 4 — Macros (templates + per-project swappable sets)

- [ ] Saved prompts, rules, restraints, `.md` files, and a `plan.md` template
      notepad; multiple named setups selectable + injectable; per-project saved
      version that's swappable. Starter templates for each type.

## Phase 5 — Cost analytics (live usage + floating widget)

- [ ] Live account usage pulls for Anthropic + Google (in addition to the local
      API-cost ledger) on the main Cost screen. (Deferred — needs per-provider
      console OAuth/scraping; not exposed via the API key.)
- [x] A small always-visible cost readout on any screen that makes calls —
      floating `CostWidget`, draggable, resizable (CSS resize), adjustable
      transparency, collapsible, app-wide with a show/hide toggle.

## Phase 6 — Break Timer (deferred, needs research)

- [ ] Expand each section from the reference photos into actionable help.
