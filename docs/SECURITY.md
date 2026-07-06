# Windows Agent ES — Security Model

This system deliberately gives multiple AI agents shared access to files, a
CLI, and each other's output. That's the whole point of an "Everything
Station" — and it's also why the security model has to be designed up
front, not bolted on. This doc is the threat model and the controls each
phase in `PLAN.md` must satisfy before it ships.

## 1. Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| Anthropic/Google API keys | Plaintext on disk, committed to git, leaked via logs | OS-backed secrets vault (Windows Credential Manager / DPAPI), never in `.env` committed to the repo, never printed/logged; see §2 |
| claude.ai / gemini.google.com session cookies | Same as above, plus session hijack if exfiltrated | Stored only inside the isolated Playwright browser profile, never exposed to the web UI's own JS, encrypted at rest; used for interactive chat only, never cron |
| Local server | Any local process or malicious webpage in another tab hits `http://127.0.0.1:PORT` | Bind to `127.0.0.1` only by default; require a per-install random auth token; CSRF double-submit cookie; no wildcard CORS |
| Embedded CLI | Command/argument injection, arbitrary code execution, agent escaping the project sandbox | `spawn(cmd, argsArray)` only — never a shell string; allowlisted executables; cwd path-jailed; every invocation audit-logged before it runs |
| Filesystem (projects/vault/artifacts) | Path traversal (`../../`), writing outside the intended root, unbounded upload sizes | `resolvePath()` jail helper on every user- or agent-supplied path; size/mime checks on upload; agents get read-only mounts on library folders marked `owner: human` |
| Injected content (files/notes/web) fed into a model's context | Prompt injection — a note or file containing "ignore previous instructions..." | Injected content is fenced with `<injected-context trust="...">`, never merged into the system prompt as if user-authored; base system prompt instructs models to treat it as data unless `trust="human-authored"`; documented as a mitigation, not a guarantee (see §5) |
| Shared projects folder written by 3 Claude instances + Gemini | Concurrent write conflicts silently clobbering work; one agent's bad output corrupting a shared file | Last-write-wins with a version log (`artifacts.version`), not silent overwrite; human-only folders enforced server-side, not just hidden in the UI |
| Cron / scheduled jobs | An unattended job burns API spend or runs a destructive CLI command with nobody watching | Jobs restricted to API-key adapters only (never web-session adapters); per-job `cost_cap_cents`; jobs cannot invoke the CLI executor, only chat adapters |
| Cost/spend | Runaway usage from automation, Board of Directors fan-out (4x calls per prompt), or a bug in a loop | `cost_ledger` tracked per call; daily/per-project spend cap enforced before dispatch, not just reported after |
| Audit trail | An agent or bug does something destructive and there's no record | Every CLI run, file write, injection, and job execution logged to an append-only, hash-chained `audit_log` before the action completes |
| Dependencies | Supply-chain compromise via npm packages (this app talks to two model APIs and drives a real browser session — a high-value target) | Lockfiles committed; `npm audit`/equivalent in CI; minimal dependency surface, especially in the Playwright/browser-automation path |

## 2. Secrets handling

- **Never** commit `.env`, `data/secrets/`, or any `*.session.json` — see
  `.gitignore`.
- API keys are written/read through `snippets/server/security/secrets-vault.ts`,
  which prefers the OS credential store (Windows Credential Manager via a
  native binding) and falls back to an encrypted-at-rest file
  (libsodium secretbox, key derived from a user passphrase + machine-bound
  salt) — never a plain JSON blob.
- Playwright browser-session state (`storageState`) for the web-session
  adapters is written to the same vault directory, encrypted, and is never
  readable by the web UI's JS context (it lives entirely server-side).
- Secrets are never written to `audit_log` or any console/log output —
  logging helpers must redact anything sourced from the vault.

## 3. Local server auth

Even though the server binds to `127.0.0.1`, other local processes (or a
malicious page open in another browser tab) can still reach it. Controls:

- A random token is generated on first run and required as a bearer token
  or session cookie for every route except `/health`.
- Cookies are `HttpOnly`, `SameSite=Strict`; state-changing routes also
  check a CSRF header that must match a value only the legitimate UI knows.
- CORS is not opened up — the server only serves its own UI origin.

## 4. CLI execution sandboxing

The CLI pane is the single highest-risk surface in this system because it's
real code execution. Rules, enforced in code, not just documentation:

1. Commands are matched against a configured allowlist (e.g. `claude`,
   `git`, `node`, `npm`) — anything else is rejected before spawning.
2. Arguments are always passed as an array to `child_process.spawn`
   (`shell: false`) — never string-concatenated into a shell command. This
   is the difference between "safe" and "trivially injectable."
3. `cwd` must resolve inside the active project's root via the path-jail
   helper; symlink escapes are checked by resolving the real path.
4. Every invocation is written to `audit_log` **before** it runs (so a crash
   or hang still leaves a record) and updated with exit code/output hash on
   completion.
5. A "require confirmation" mode (default on) pauses before executing
   anything an agent (rather than the human) requested, until the user
   explicitly relaxes it per project.

## 5. Prompt-injection posture

Any system that reads files/notes/web content and folds it into a model's
context is exposed to prompt injection — content designed to look like
instructions. This design reduces the risk but does not eliminate it:

- Injected content is always wrapped in `<injected-context trust="...">`
  tags with a provenance source, never blended into the system prompt.
- Only `trust="human-authored"` content (library items with `owner: human`)
  is treated as instruction-like; everything else is framed to the model as
  reference data.
- The CLI executor and file-write paths are **not** reachable from inside a
  chat response automatically — an agent's text output doesn't
  self-execute. Any action a model "recommends" (run this command, write
  this file) still goes through the same allowlist/confirmation/audit path
  as a human-initiated action.
- Web-fetched content (if/when a fetch tool is added) is always tagged
  `trust="web-fetched"`, the lowest trust tier.

## 6. Filesystem jail

`snippets/server/security/path-jail.ts` is the one function every route,
adapter, and CLI call uses before touching disk. It resolves the requested
path against the permitted root and rejects anything that escapes it
(`..`, absolute paths outside the root, symlink escapes). No route
constructs a filesystem path by string concatenation without going through
this helper.

## 7. Audit log

Append-only JSONL (mirrored into the `audit_log` table), each entry hashed
together with the previous entry's hash. This doesn't make tampering
impossible (it's a local file, not a distributed ledger) but it makes
*silent* tampering detectable — deleting or editing a past entry breaks the
chain. Every CLI run, file write, library `owner: human` write attempt by
an agent, injection event, and job execution appends an entry.

## 8. Multi-agent write permissions

- `library_items` with `owner: human` (agent rules, agent definitions) are
  rejected at the API layer if a request's actor is an agent/adapter, not
  just hidden in the UI — an agent calling `/api/library` directly gets a
  403, same as a script would.
- Shared project folders can be marked read-only per agent seat (e.g. "Claude
  #3 can read the repo but only Claude #1 writes code") — enforced by the
  path-jail + a permissions table, not convention.

## 9. What's explicitly out of scope for v1

- Multi-laptop network exposure (Phase 7) — until then, assume single
  machine, localhost-only, and don't weaken the bind/CORS/auth posture to
  "make LAN access easier."
- Sandboxing the CLI executor's *child processes* beyond allowlist + jail
  (e.g. full container/VM isolation) — noted as a future hardening step if
  the allowlist ever needs to include less-trusted tools.
