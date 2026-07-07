# Windows Agent ES

A local "Everything Station" for AI work on Windows: a multiplexed chat
surface across three Claude instances and Gemini, shared prompt/agent/rule/
skill/persona libraries, shared files/projects/artifacts, an embedded CLI,
long-term memory in Obsidian, project management, and multi-agent
orchestration ("Board of Directors") — all local-first and secrets-secured.

Start here:

- [`docs/PLAN.md`](docs/PLAN.md) — phased build roadmap
- [`docs/SPEC.md`](docs/SPEC.md) — architecture, data model, module contracts
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model and required controls
- [`snippets/`](snippets/) — reference implementations of the
  security-critical modules (secrets vault, path-jail, CLI executor, audit
  log, provider adapters, injection resolver)
- [`library-templates/`](library-templates/) — starter examples for each
  library type (prompt, agent, rule, skill, persona)
