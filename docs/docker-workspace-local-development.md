# Docker Workspace Local Development

This is the supported local Docker-first path for Symphony right now.

## Supported Runner Image

Symphony now targets one generic workspace runner image first:

- image tag: `symphony/workspace-runner:local`
- Dockerfile: `docker/workspace-runner/Dockerfile`
- base image: `node:24-bookworm-slim`

The image guarantees these cross-repo tools:

- `bash`
- `codex`
- `git`
- `node`
- `corepack`
- `pnpm`
- `python3`
- `psql`
- `rg`

It also includes the usual transport tooling needed for repo access and downloads:

- `curl`
- `openssh-client`
- `ca-certificates`

## Layering

Keep the split strict:

- image: generic execution environment and cross-repo CLI/tooling only
- manifest lifecycle: repo-specific install, migrate, seed, verify, and cleanup steps
- sidecars: runtime services such as Postgres

What stays out of the image:

- repo-specific dependency bootstrap
- repo-specific env files
- repo-specific databases or service containers
- repo-specific hook logic

## Bootstrap

Build or refresh the supported image with:

```bash
pnpm docker:workspace-image:build
```

That command builds `symphony/workspace-runner:local` by default. If you need a different local
tag, export `SYMPHONY_DOCKER_WORKSPACE_IMAGE` before running the build.

Run Symphony against Docker workspaces with:

```bash
export SYMPHONY_WORKSPACE_BACKEND=docker
export SYMPHONY_SOURCE_REPO=/absolute/path/to/source-repo
export LINEAR_API_KEY=...
pnpm --filter @symphony/api dev
```

You do not need to set `SYMPHONY_DOCKER_WORKSPACE_IMAGE` for the supported local path. Symphony
defaults to `symphony/workspace-runner:local` when Docker backend execution is selected.

Optional overrides:

- `SYMPHONY_DOCKER_WORKSPACE_IMAGE`
- `SYMPHONY_DOCKER_MATERIALIZATION_MODE=bind_mount|volume`
- `SYMPHONY_DOCKER_WORKSPACE_PATH`
- `SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX`
- `SYMPHONY_DOCKER_SHELL`

## Preflight Behavior

When `SYMPHONY_WORKSPACE_BACKEND=docker`, Symphony now fails before workspace prepare if:

- Docker is not installed or the daemon is not reachable
- the selected image is not available locally
- the selected image is missing the required Symphony runner tools
- the configured shell does not exist inside the image

For the default local image, missing-image errors point directly at:

```bash
pnpm docker:workspace-image:build
```

## Intentionally Deferred

Still deferred in this pass:

- Docker as the default backend
- repo-specific workspace images
- moving repo lifecycle into the image
- sidecars inside the main workspace image
- service types beyond the current manifest contract
- broader auth and subscription redesign
