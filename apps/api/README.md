# @symphony/api

Thin runtime app boundary for the Symphony developer control plane.

## Owns

- App-boundary env loading for the runtime.
- Hono route composition, startup, websocket wiring, and runtime-specific adapters.
- The current evaluation launcher for the TypeScript runtime.

## Does not own

- Reusable orchestration logic.
- Shared transport schemas.
- Dashboard UI composition.
- Legacy business-domain logic from the old host repo.

## Local Evaluation

The local evaluation launcher is:

```bash
./scripts/symphony/run-typescript-local.sh
```

Equivalent package command:

```bash
pnpm --filter @symphony/api dev
```

The runtime loads env files from `apps/api` using `@symphony/env`.

Minimum env:

- `LINEAR_API_KEY`

Supported overrides:

- `PORT`
- `WORKFLOW_PATH`
- `SYMPHONY_RUN_JOURNAL_FILE`

## Current Limitation

This app now owns the real TypeScript HTTP and websocket surfaces, but the default runtime wiring is
still evaluation-only:

- tracker polling still uses an in-memory tracker
- agent execution still uses a stub runtime rather than Codex app-server
- repo-owned workspace lifecycle scripts are not yet wired in

So this app is suitable for transport and dashboard evaluation today, but it is not yet the active
replacement for `symphony/elixir`.

See `docs/architecture/symphony-typescript-parity-readiness.md` for the explicit cutover gates.
