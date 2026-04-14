# Symphony Runtime Operations

Date: 2026-04-03

## Purpose

Describe the active operator setup for this repository's Symphony control plane.

This document is intentionally operational. Live contract details live with code in
`packages/runtime-contract`, and durable workflow decisions live in `docs/adr/`.

## Canonical References

- Product shape: [`../../symphony/SPEC.md`](../../symphony/SPEC.md)
- Repo contract authoring: [`../../packages/runtime-contract/README.md`](../../packages/runtime-contract/README.md)
- Accepted decisions: [`../adr`](../adr)

## Current Operating Assumptions

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

The admitted repository contract is defined in
[`../../packages/runtime-contract/README.md`](../../packages/runtime-contract/README.md).

At the operator level, the important constraints are:

- every admitted repo must provide `.symphony/runtime.ts` and `.symphony/prompt.md`
- `repositoryKey` is the canonical admitted-repo identity
- `linear.teamKey` is the repo's default issue-routing binding
- lifecycle commands are repo-owned commands run inside the prepared workspace

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
- GitHub webhook repository `conacts/coldets-v2` verifies against that repo's secret and runtime
  routing stays attached to that repo's runs and timeline entries

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

## Pi Transport

The control plane now treats Pi as the canonical execution surface.

That means:

- Pi runs inside the issue container, not on the host
- Symphony uses the Pi SDK/runtime surfaces to drive turns and resume threads
- event capture is based on typed SDK events such as `reasoning`, `todo_list`,
  `command_execution`, `file_change`, `mcp_tool_call`, and `agent_message`
- the dashboard should prefer these typed artifacts over raw line-oriented transport logs

This is a better fit for the product because the SDK event model is closer to the actual user story
we want to reconstruct: what the agent thought, what it executed, what files it touched, and why it
stopped.

## Run Behavior

- workspaces are preserved across `Blocked`, `Paused`, and `Failed` unless an explicit reset is required
- `Done` and `Canceled` destroy the workspace after final artifact capture
- intelligent-flow runs complete by emitting a structured terminal module result in the run output
- the host derives routed delivery or state-request signals from that terminal result
- there is no approved-merge execution phase in the active intelligent-flow product path

## State Semantics

- `Bootstrapping` is runtime-owned setup before normal work
- `Todo` is the operator queue that requests bootstrapping
- `In Progress` means the run has actually started
- `Paused` is a platform/provider interruption
- `Failed` is a platform-owned refusal or setup failure
- `Blocked` is a repo/agent-owned stop
- `Done` and `Canceled` are terminal
- `In Review`, `Rework`, and `Approved` are legacy tracker states and are not part of the active intelligent-flow path

The active intelligent-flow lifecycle contract lives in:

- [`2026-04-14-intelligent-flow-golden-truth.md`](2026-04-14-intelligent-flow-golden-truth.md)
- [`symphony-linear-ticket-lifecycle.md`](symphony-linear-ticket-lifecycle.md)

## Dashboard Scope

The dashboard is useful for observability and operator drilldowns, but it is not part of the
critical path for orchestration hardening. Runtime contract, dispatch behavior, and Docker
execution remain the priority.
