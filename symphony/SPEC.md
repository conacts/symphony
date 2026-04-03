# Symphony Service Specification

Status: Draft v1

Purpose: Define the current Symphony product contract for Docker-only, Linear-driven coding-agent
orchestration.

## 1. Product Shape

Symphony is a single-host control plane that watches Linear for eligible issues, prepares an
isolated Docker workspace for each admitted issue, renders a repo-owned prompt template, and
launches a coding-agent run inside that container.

The platform is intentionally strict:

- one execution model: Docker
- one execution unit: Linear issue
- one active run per issue
- one admitted repo contract
- one fail-fast path when the contract is not met

## 2. Goals

- fail closed when the repo contract, runtime setup, or platform prerequisites are invalid
- make repo admission explicit instead of relying on conventions
- keep the contract surface small and inspectable
- isolate agent execution per issue
- separate platform-owned failures from repo-owned lifecycle failures
- keep enough observability to debug orchestration and prompt/render behavior after the fact

## 3. Non-Goals

- local/worktree execution as a supported alternative backend
- best-effort repo auto-discovery
- repo-specific environment-file generation as part of the platform contract
- multi-tenant orchestration
- a dashboard-first product story

## 4. Repo Contract

Every admitted repository must provide exactly two required orchestration artifacts:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

The `.symphony/` directory is intentionally small. It is not a general-purpose repo tooling
bucket.

### 4.1 `.symphony/runtime.ts`

The runtime file is a declarative TypeScript contract authored through
`@symphony/runtime-contract`.

It defines:

- schema version
- workspace package-manager context
- required and optional host env
- runtime/service env injection
- lifecycle command surface
- declared service dependencies

It does not define:

- backend selection
- branch strategy
- local/worktree fallback behavior
- inline shell pipelines as orchestration policy

Lifecycle is declared via stable repo commands such as:

- `pnpm bootstrap`
- `pnpm migrate`
- `pnpm verify`
- `pnpm runtime:doctor`

### 4.2 `.symphony/prompt.md`

The prompt file is a static repo-owned template.

Rules:

- Symphony renders it in memory with platform-provided variables
- missing variables or invalid template syntax are hard failures
- the rendered prompt is stored in observability/forensics
- Symphony does not rewrite the template on disk during a run
- agent edits to the file affect later runs only, not the current dispatch

## 5. Shared Contract Boundary

Reusable contract parsing and validation logic lives in `packages/runtime-contract`.

That package owns:

- runtime manifest authoring and validation
- prompt contract loading and render validation
- schema version compatibility
- runtime-doctor helpers

The visible repo contract stays at the repo root under `.symphony/`, while the shared
implementation stays inside the package boundary.

## 6. Execution Model

### 6.1 Issue Identity

The Linear issue is the canonical execution unit.

- PRs are downstream artifacts of issue work
- one issue maps to one workspace identity
- one issue may have at most one active run at a time

### 6.2 Workspace

Execution is Docker-only.

Each active issue gets:

- one deterministic workspace identity
- one deterministic workspace container
- declared service sidecars only when required by the repo contract

The first-cut required service surface is intentionally minimal. Postgres is the expected initial
declared service when a repo truly needs a database for `migrate` or `verify`.

### 6.3 Snapshot Semantics

At dispatch time Symphony snapshots the repo contract:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

Those snapshots define the current run. Contract edits made during the run do not alter the active
session.

### 6.4 Env And Auth

Symphony provides runtime inputs through injected process env and mounted auth material.

The repo contract may declare:

- required host env
- optional host env
- service-injected env such as `DATABASE_URL`
- runtime identifiers such as issue/run/workspace metadata

The platform owns credentials needed to operate the orchestration environment, such as:

- Linear auth
- Codex auth material
- GitHub auth for repo operations

Secret-bearing values are not written into required repo files by default.

## 7. Lifecycle Semantics

Lifecycle commands must be stable repo commands with identical semantics for humans and Symphony.

### 7.1 `bootstrap`

`bootstrap` prepares the repo for lifecycle execution.

It may:

- install locked dependencies
- validate bootstrap-time env
- prepare non-secret repo-local assumptions
- build required artifacts when later lifecycle steps depend on them

It must not:

- fetch platform-owned secrets
- write persistent secret-bearing env files
- render prompts
- start long-lived services

### 7.2 `migrate`

`migrate` applies deterministic repo-owned setup against declared services.

Typical responsibilities:

- schema migrations
- generated clients tightly coupled to schema/runtime setup
- deterministic one-time setup against declared services

### 7.3 `verify`

`verify` proves the isolated environment is usable.

It should stay narrow and deterministic:

- readiness checks
- schema/bootstrap invariants
- one high-signal replay or smoke scenario when that is part of repo usability

It is not the full CI contract by default.

### 7.4 `runtime:doctor`

`runtime:doctor` is a non-dispatch diagnostic path.

It validates the repo contract in redacted form:

- runtime manifest parse/validation
- prompt renderability against mock payload
- env/service readiness inspection

## 8. Linear State Contract

### 8.1 Active Dispatch States

- `Todo`
- `In Progress`
- `Rework`
- `Approved`

`Approved` is active only for merge execution.

### 8.2 Non-Dispatch States

- `Backlog`
- `In Review`
- `Blocked`
- `Failed`

`Blocked` is repo-owned failure: the platform worked, but the repo lifecycle failed and needs human
intervention.

`Failed` is platform-owned failure: admission, render, dispatch, or startup setup failed before the
repo lifecycle was allowed to proceed normally.

### 8.3 Terminal States

- `Done`
- `Canceled`

Terminal states are hard stops. Once an issue reaches a terminal state, Symphony does not create a
fresh workspace for that issue again.

## 9. Failure Semantics

Symphony leaves structured Linear comments for platform-owned failures and dispatch refusals.

Those comments should include:

- failure class
- failed contract check
- whether retry is automatic or blocked
- concrete next operator action

Failure classes:

- prompt render failure
- missing `.symphony/runtime.ts`
- missing `.symphony/prompt.md`
- invalid schema version
- missing required env/auth
- Docker/image/shell preflight failure
- repo admission validation failure

Repo-owned build/test/migration failures are not platform failures. Those belong in `Blocked`.

## 10. Observability

The platform owns orchestration and observability.

Minimum retained artifacts include:

- rendered prompt snapshot
- runtime contract summary
- issue/run/workspace identifiers
- structured lifecycle events
- failure/refusal reason
- redacted env/service summaries

Observability exists to explain what Symphony decided, what contract it saw, and why a run was
refused, blocked, or completed.
