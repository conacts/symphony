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

Start the runtime directly with:

```bash
pnpm --filter @symphony/api dev
```

The runtime loads env files from `apps/api` using `@symphony/env`.

Minimum env:

- `LINEAR_API_KEY`

Supported overrides:

- `PORT`
- `WORKFLOW_PATH`
- `SYMPHONY_DB_FILE`
- `SYMPHONY_SOURCE_REPO`

## Current State

This app now owns the real TypeScript HTTP and websocket surfaces, DB-backed observability,
autonomous polling, a real Linear tracker, and a local Codex app-server execution path.

The remaining work is backend hardening and cleanup rather than basic runtime wiring:

- continued Elixir-to-TypeScript behavioral parity sweeps
- backend refactors to tighten module boundaries and split oversized files
- frontend/dashboard work on top of the now-stable API and observability contracts

See `docs/architecture/symphony-typescript-parity-readiness.md` for the explicit cutover gates.
