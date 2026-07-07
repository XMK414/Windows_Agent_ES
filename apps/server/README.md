# @windows-agent-es/server

Phase 0 backend: local auth + CSRF, encrypted secrets vault, hash-chained
audit log, SQLite schema, and the `ChatProvider`/injection-resolver
contracts from `docs/SPEC.md`, wired into a running Express server.

## Run it

```
export WAES_VAULT_PASSPHRASE=choose-a-real-passphrase   # required, no default
npm install
npm run dev
```

On first run the server prints an install token — every request under
`/api/*` (except `/health`) requires it as `Authorization: Bearer <token>`,
and state-changing requests also require a matching `waes_csrf` cookie and
`x-waes-csrf` header (CSRF double-submit). The token is written to
`data/install-token.txt`, which is gitignored.

## Endpoints (Phase 0)

- `GET /health` — no auth
- `GET /api/status` — whether provider API keys are configured, audit chain validity
- `POST /api/secrets/:key` — store a secret in the vault (e.g. `anthropic_api_key`, `google_api_key`)
- `GET /api/audit?limit=N` — tail the audit log

## Next

Wire `src/adapters/anthropic-api.adapter.ts` into a real `/api/threads`
streaming route (Phase 1), then build `apps/web` against it.
