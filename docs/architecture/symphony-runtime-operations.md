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

For self-host development on this repository with hot reload enabled for both the API and the
dashboard:

```bash
pnpm install
pnpm docker:workspace-image:build
mkdir -p ~/.config/symphony
cp symphony.env.example ~/.config/symphony/symphony.env
pnpm dev:self
```

`pnpm dev:self` forces `SYMPHONY_SOURCE_REPO` to the repository root, sets the dashboard runtime
base URL to the local API, and keeps the runtime DB at `./symphony.db`. Use it instead of bare
`pnpm dev` when the goal is to have Symphony improve this repository directly.

Optional overrides:

- `PORT`
- `SYMPHONY_DOCKER_WORKSPACE_IMAGE`
- `SYMPHONY_DOCKER_MATERIALIZATION_MODE`
- `SYMPHONY_DOCKER_WORKSPACE_PATH`
- `SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX`
- `SYMPHONY_DOCKER_SHELL`
- `SYMPHONY_DB_FILE`

On Linux Mint, an operator-managed hot-reload service can use the root-level
[`symphony-dev.service`](../../symphony-dev.service) unit, while the production-style start path
can use [`symphony.service`](../../symphony.service).

Install either unit as a user service so `%h` resolves to the operator home directory:

```bash
mkdir -p ~/.config/systemd/user
cp symphony-dev.service ~/.config/systemd/user/
cp symphony.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now symphony-dev.service
```

If the service should survive logout, enable linger for the operator account:

```bash
loginctl enable-linger "$USER"
```

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

- Symphony installs repo dependencies before `bootstrap` when the manifest does not already do it
- `bootstrap` prepares repo-local runtime assumptions
- `migrate` applies deterministic repo-owned setup against declared services
- `verify` proves the environment is usable with a narrow, deterministic proof
- `runtime:doctor` validates the contract in redacted, non-dispatch form

The platform is not responsible for making repo-internal code quality perfect. It is responsible
for making the isolated environment explicit, valid, and usable.

The Docker workspace runtime also applies a conservative default `NODE_OPTIONS` heap cap when the
repo or operator does not provide one. This keeps bootstrap/build flows stable on resource-limited
local Docker setups without forcing each admitted repo to rediscover the same memory ceiling.

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
