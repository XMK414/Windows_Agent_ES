# Snippets

Reference implementations for the security- and architecture-critical
modules described in `docs/SPEC.md` and `docs/SECURITY.md`. These aren't a
runnable app yet — they're the pieces that need to exist *before* Phase 0
wires up a real server, so that no build step ever starts with "add auth
later" or "encrypt secrets later."

- `server/security/` — secrets vault, path-jail, CLI executor, audit log,
  local auth middleware
- `server/adapters/` — the `ChatProvider` interface and an Anthropic API
  implementation
- `server/injection/` — the `@mention` context resolver that fences
  injected content with a provenance/trust tag before it reaches a model

Dependencies referenced but not installed here: `@anthropic-ai/sdk`,
`libsodium-wrappers`, `express` (or a comparable framework). Wire these into
`apps/server` during Phase 0/1 per `docs/PLAN.md`.
