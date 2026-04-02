# Symphony Runtime Operations

Date: 2026-04-02

## Purpose

Describe the active runtime and operator setup for this repository's Symphony control plane.

This document replaces the older evaluation/parity setup story.

## Current Product Contract

- Docker-only issue execution
- admitted repos must provide `.symphony/runtime.ts` and `.symphony/prompt.md`
- one active run per Linear issue
- prompt rendering happens in memory
- platform-owned setup/refusal failures move issues to `Failed`
- repo-owned lifecycle failures move issues to `Blocked`

## Local Runtime Startup

Build the default runner image:

```bash
pnpm docker:workspace-image:build
```

Start the runtime:

```bash
export SYMPHONY_SOURCE_REPO=/absolute/path/to/admitted-repo
export LINEAR_API_KEY=...
export GITHUB_TOKEN=...
pnpm --filter @symphony/api dev
```

Optional overrides:

- `PORT`
- `SYMPHONY_DOCKER_WORKSPACE_IMAGE`
- `SYMPHONY_DOCKER_MATERIALIZATION_MODE`
- `SYMPHONY_DOCKER_WORKSPACE_PATH`
- `SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX`
- `SYMPHONY_DOCKER_SHELL`

## Admitted Repo Expectations

The admitted repository must provide:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

The repo contract must be explicit:

- lifecycle commands are stable repo commands
- lifecycle consumes injected process env only
- required secret-bearing values are not written into repo files by default
- `.symphony/` contains static contract artifacts, not generated secret-bearing state

## Lifecycle Expectations

- `bootstrap` installs dependencies and prepares repo-local runtime assumptions
- `migrate` applies deterministic repo-owned setup against declared services
- `verify` proves the environment is usable with a narrow, deterministic proof
- `runtime:doctor` validates the contract in redacted, non-dispatch form

The platform is not responsible for making repo-internal code quality perfect. It is responsible
for making the isolated environment explicit, valid, and usable.

## State Semantics

Use `Todo`, `In Progress`, `Rework`, and `Approved` for active work.

Use `In Review`, `Blocked`, and `Failed` as non-dispatch parking states.

Use `Done` and `Canceled` as terminal states. Terminal states are final for workspace cleanup and
fresh-run eligibility.

## Dashboard Scope

The dashboard is useful for observability and operator drilldowns, but it is not part of the
critical path for orchestration hardening. Runtime contract, dispatch behavior, and Docker
execution remain the priority.
