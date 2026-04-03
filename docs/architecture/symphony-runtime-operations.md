# Symphony Runtime Operations

Date: 2026-04-03

## Purpose

Describe the active runtime and operator setup for this repository's Symphony control plane.

This document replaces the older evaluation/parity setup story.

## Current Product Contract

- Docker-only issue execution
- admitted repos must provide `.symphony/runtime.ts` and `.symphony/prompt.md`
- one active run per Linear issue
- one durable workspace per Linear issue
- prompt rendering happens in memory
- agent turns run through the Codex TypeScript SDK over `codex exec --experimental-json`
- typed turn artifacts are captured from the SDK stream instead of raw transport blobs
- platform-owned pre-agent failures move issues to `Failed`
- platform/provider interruptions move issues to `Paused`
- there are no hidden retries
- workspace reuse is the default; reset is explicit

## Local Runtime Startup

Build the default runner image:

```bash
pnpm docker:workspace-image:build
```

Start the runtime:

```bash
source /opt/homebrew/opt/nvm/nvm.sh && nvm use
pnpm install
pnpm docker:workspace-image:build
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

## Codex Transport

The control plane now treats the Codex CLI as the canonical execution surface.

That means:

- Codex runs inside the issue container, not on the host
- Symphony uses the TypeScript SDK to drive turns and resume threads
- event capture is based on typed SDK events such as `reasoning`, `todo_list`,
  `command_execution`, `file_change`, `mcp_tool_call`, and `agent_message`
- the dashboard should prefer these typed artifacts over raw line-oriented transport logs

This is a better fit for the product because the SDK event model is closer to the actual user story
we want to reconstruct: what the agent thought, what it executed, what files it touched, and why it
stopped.

For this repository, the durable orchestration rules are:

- the issue workspace survives across runs by default
- unstaged changes, staged changes, local commits, and service data survive across runs
- hot compute may stop when a run ends in `Paused`, `Failed`, `Blocked`, or `In Review`
- `Done` and `Canceled` eagerly tear the workspace down only after final artifact capture

## State Semantics

Use `Todo`, `Bootstrapping`, `In Progress`, `Rework`, and `Approved` for active work.

Use `In Review`, `Blocked`, `Paused`, and `Failed` as non-dispatch parking states.

Use `Done` and `Canceled` as terminal states. Terminal states are final for workspace cleanup and
fresh-run eligibility.

## Dashboard Scope

The dashboard is useful for observability and operator drilldowns, but it is not part of the
critical path for orchestration hardening. Runtime contract, dispatch behavior, and Docker
execution remain the priority.
