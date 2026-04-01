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
- `SYMPHONY_DB_FILE`

## Current State

This app now owns the real TypeScript HTTP and websocket surfaces, DB-backed observability,
autonomous polling, a real Linear tracker, and a local Codex app-server execution path.

The remaining cutover work is backend hardening rather than basic runtime wiring:

- live parity validation against the installed Codex binary
- broader Elixir-to-TypeScript behavioral parity sweeps
- backend refactors to tighten module boundaries and split oversized files
- frontend/dashboard work after backend parity is stable

See `docs/architecture/symphony-typescript-parity-readiness.md` for the explicit cutover gates.
