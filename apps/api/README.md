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

- `GITHUB_TOKEN`
- `PORT`
- `WORKFLOW_PATH`
- `SYMPHONY_DB_FILE`
- `SYMPHONY_SOURCE_REPO`

## Docker Workspace Development

The supported local Docker-first path is documented in
`docs/docker-workspace-local-development.md`.

Short version:

```bash
pnpm docker:workspace-image:build
export SYMPHONY_WORKSPACE_BACKEND=docker
export SYMPHONY_SOURCE_REPO=/absolute/path/to/source-repo
export LINEAR_API_KEY=...
pnpm --filter @symphony/api dev
```

When Docker backend execution is selected, `@symphony/api` now defaults to the supported generic
runner image `symphony/workspace-runner:local` unless `SYMPHONY_DOCKER_WORKSPACE_IMAGE` is set.

## Current State

This app now owns the real TypeScript HTTP and websocket surfaces, DB-backed observability,
autonomous polling, a real Linear tracker, and a local Codex app-server execution path.

The remaining work is backend hardening and cleanup rather than basic runtime wiring:

- continued Elixir-to-TypeScript behavioral parity sweeps
- backend refactors to tighten module boundaries and split oversized files
- frontend/dashboard work on top of the now-stable API and observability contracts

See `docs/architecture/symphony-typescript-parity-readiness.md` for the explicit cutover gates.
