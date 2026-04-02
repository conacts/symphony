# @symphony/api

Thin runtime app boundary for the Symphony developer control plane.

## Owns

- App-boundary env loading for local runtime invocation.
- Hono route composition, startup, websocket wiring, and runtime-specific adapters.
- The Docker-backed runtime launcher for the Symphony control plane.

## Does not own

- Reusable orchestration logic.
- Shared transport schemas.
- Dashboard UI composition.
- Legacy business-domain logic from the old host repo.

## Local Runtime

Start the runtime directly with:

```bash
pnpm --filter @symphony/api dev
```

For local invocation, the app boundary can still source env from `apps/api` through
`@symphony/env`. That is a launcher convenience, not the admitted orchestration contract.

Minimum env:

- `LINEAR_API_KEY`
- `GITHUB_TOKEN`
- `SYMPHONY_SOURCE_REPO`

Supported overrides:

- `PORT`
- `SYMPHONY_DB_FILE`
- `SYMPHONY_DOCKER_WORKSPACE_IMAGE`
- `SYMPHONY_DOCKER_MATERIALIZATION_MODE`
- `SYMPHONY_DOCKER_WORKSPACE_PATH`
- `SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX`
- `SYMPHONY_DOCKER_SHELL`

## Docker Workspace Development

The supported local runtime path is documented in
`../../docs/docker-workspace-local-development.md`.

Short version:

```bash
pnpm docker:workspace-image:build
export SYMPHONY_SOURCE_REPO=/absolute/path/to/source-repo
export LINEAR_API_KEY=...
export GITHUB_TOKEN=...
pnpm --filter @symphony/api dev
```

`@symphony/api` defaults to the supported generic runner image
`symphony/workspace-runner:local` unless `SYMPHONY_DOCKER_WORKSPACE_IMAGE` is set.

## Current State

This app owns the TypeScript HTTP and websocket surfaces, DB-backed observability, autonomous
polling, real Linear integration, and the Docker-backed Codex execution path.

The remaining work is contract hardening and cleanup rather than basic runtime wiring:

- tightening the repo admission and prompt contract paths
- removing remaining legacy local/worktree assumptions
- keeping the dashboard off the critical path while the orchestration core hardens

For the current operator/runtime story, see
`../../docs/architecture/symphony-runtime-operations.md`.
