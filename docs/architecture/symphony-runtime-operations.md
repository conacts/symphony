# Symphony Runtime Operations

Date: 2026-04-03

## Purpose

Describe the active runtime and operator setup for this repository's Symphony control plane.

This document replaces the older evaluation/parity setup story.

## Current Product Contract

- Docker-only issue execution
- admitted repos must provide `.symphony/runtime.ts` and `.symphony/prompt.md`
- admitted repos must declare `repositoryKey` in `.symphony/runtime.ts`
- one runtime process may admit multiple repositories
- one active run per Linear issue
- one durable workspace per Linear issue
- prompt rendering happens in memory
- agent turns run through the Pi harness and Symphony runtime projection layer
- typed turn artifacts are captured from projected Pi/runtime events instead of raw transport blobs
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

To admit more than one repo into the same process:

```bash
export SYMPHONY_SOURCE_REPOS=/absolute/path/to/repo-a,/absolute/path/to/repo-b
export SYMPHONY_GITHUB_WEBHOOK_SECRETS=owner-a/repo-a=secret-a,owner-b/repo-b=secret-b
pnpm --filter @symphony/api dev
```

For self-host development on this repository with hot reload enabled for both the API and the
dashboard:

```bash
pnpm install
pnpm docker:workspace-image:build
mkdir -p ~/.config/symphony
cp symphony.env.example ~/.config/symphony/symphony.env
pnpm dev:host
```

`pnpm dev:host` reads the local Symphony env file, sets the dashboard runtime base URL to the local
API, and keeps the runtime DB at `./symphony.db`. Use it instead of bare `pnpm dev` when the goal
is to have Symphony improve this repository directly. It also fails fast on missing required env
and auto-builds the local Docker runner image if it has not been built yet.

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

- `repositoryKey` is required and must use `<owner>/<repo>` format
- lifecycle commands are stable repo commands
- lifecycle consumes injected process env only
- required secret-bearing values are not written into repo files by default
- `.symphony/` contains static contract artifacts, not generated secret-bearing state

## Team Mapping

The preferred operating model is one Linear workspace with one team per admitted repository.

Current intended mapping:

- `conacts/symphony` -> `SYM`
- `conacts/coldets-v2` -> `COL`

Use the repo manifest to bind a repo to its team:

```ts
linear: {
  teamKey: "SYM"
}
```

Use `SYMPHONY_SOURCE_REPO` when running Symphony only against itself locally.
Use `SYMPHONY_SOURCE_REPOS` only when you explicitly want one runtime process to admit multiple repositories.

## Repo Routing Convention

Use this routing model consistently:

- `repositoryKey` is the canonical identity for an admitted repo
- GitHub webhook routing uses the webhook payload repository slug, which must match an admitted `repositoryKey`
- webhook secrets remain environment-owned, not repo-owned
- use `SYMPHONY_GITHUB_WEBHOOK_SECRETS` for per-repo secrets when one process admits many repos
- use a Linear label in the form `repo:<owner>/<repo>` to route an issue to a non-default admitted repo
- if no `repo:` label is present, Symphony dispatches from the repo's Linear binding
- the UI repo picker is repository-only; Linear project is not part of routing identity

Example:

- admitted repos: `conacts/symphony`, `conacts/coldets-v2`
- default admitted repo: `conacts/symphony`
- team mapping: `SYM -> conacts/symphony`, `COL -> conacts/coldets-v2`
- issue label `repo:conacts/coldets-v2` routes the issue into the Coldets repo
- GitHub webhook repository `conacts/coldets-v2` verifies against that repo's secret and rework flow
  stays attached to that repo's runs and timeline entries

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
