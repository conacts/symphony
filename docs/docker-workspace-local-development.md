# Docker Workspace Local Development

This is the supported local path for Symphony. There is no supported local/worktree backend.

## Requirements

- Docker daemon available locally
- `codex` installed and authenticated
- GitHub CLI auth when the agent needs `gh`
- `LINEAR_API_KEY`
- `GITHUB_TOKEN`
- `SYMPHONY_SOURCE_REPO=/absolute/path/to/admitted-repo`

The admitted source repository must contain:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

## Supported Runner Image

The default runner image is:

- image tag: `symphony/workspace-runner:local`
- Dockerfile: `docker/workspace-runner/Dockerfile`
- base image: `node:24-bookworm-slim`

Build or refresh it with:

```bash
pnpm docker:workspace-image:build
```

You only need `SYMPHONY_DOCKER_WORKSPACE_IMAGE` when overriding the default image.

## Start The Runtime

```bash
export SYMPHONY_SOURCE_REPO=/absolute/path/to/admitted-repo
export LINEAR_API_KEY=...
export GITHUB_TOKEN=...
pnpm --filter @symphony/api dev
```

Optional runtime overrides:

- `PORT`
- `SYMPHONY_DOCKER_WORKSPACE_IMAGE`
- `SYMPHONY_DOCKER_MATERIALIZATION_MODE=bind_mount|volume`
- `SYMPHONY_DOCKER_WORKSPACE_PATH`
- `SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX`
- `SYMPHONY_DOCKER_SHELL`

## Contract Expectations

Symphony reads the repo contract from the admitted repository, not from this platform repo.

- `.symphony/runtime.ts` declares env, services, and lifecycle steps
- `.symphony/prompt.md` is a static prompt template rendered in memory
- lifecycle commands consume injected process env only
- required secret-bearing values are not written into repo files by default

## Preflight And Failure

Symphony fails before dispatch when:

- Docker is unavailable
- the workspace image is missing
- the configured shell does not exist in the image
- required auth or env is missing
- the repo contract is missing or invalid
- prompt rendering cannot complete

Platform-owned failures move the issue to `Failed` with a structured Linear comment. Repo-owned
lifecycle failures move the issue to `Blocked`.

## Scope

This document covers the core runtime path only. The dashboard is optional and not part of the
critical path for orchestration hardening.
