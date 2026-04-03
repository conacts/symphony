# Repo Integration Handoff

Date: 2026-04-02

## Purpose

This document summarizes the current Symphony platform direction so an integrating repository can
adopt the correct contract and avoid implementing against legacy assumptions.

## Product Shape

Symphony is a single-host control plane for Linear-driven sub-agent orchestration.

The platform:

- polls Linear and manages issue lifecycle transitions
- creates one isolated Docker-backed environment per active Linear issue
- prepares the environment so the sub-agent can work without needing to understand platform
  internals
- provides observability into orchestration, setup, refusal, and run history

The sub-agent's job is to complete the ticket inside the isolated environment. The platform's job
is to make that environment and its orchestration explicit, reliable, and observable.

## Hard Boundaries

### Canonical Unit Of Execution

The Linear issue is the canonical unit of execution.

- one issue maps to one isolated issue environment
- one issue may produce a PR, but the PR is an artifact of the issue
- there may be only one active run per issue across the whole system

### Terminal States

Terminal states are hard stops.

When an issue reaches a terminal state such as `Done` or `Canceled`, the issue environment must be
treated as terminal and unrecoverable. Symphony should not silently recreate the environment and
resume work because of a mistaken human state transition.

### Approved

`Approved` remains an active state only for merge execution.

## Execution Model

Docker-backed execution is mandatory.

The platform is intentionally deleting:

- local host-path workspace execution
- worktree-era compatibility paths
- mixed backend selection as a product concept
- legacy execution stories that conflict with Docker isolation

The desired model is one explicit execution story, not multiple fallbacks.

## Repo Contract

A repository is admitted only if it satisfies the Symphony repo contract.

Minimum required files:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

The platform will validate the repo contract:

1. before the repository is admitted for use
2. again at runtime before dispatch

If the repository does not meet the contract, Symphony should fail immediately and fail closed.

No best-effort repo conventions should be inferred.

## Platform-Owned Authoring Surface

The visible repo contract stays tiny at the root:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

The integrating repository should not depend on Symphony's internal package layout.

`.symphony/runtime.ts` must default export `defineSymphonyRuntime(...)` from
`@symphony/runtime-contract`.

Do not build the contract edge around:

- repo-local contract helper packages
- copied Symphony internals such as `packages/runtime-contract`
- alternate constructors such as `defineRuntimeContract(...)`

Symphony is currently strict about the live authoring API and live schema. Future contract
evolution should happen in Symphony first, then in admitted repositories.

## `.symphony/runtime.ts`

`.symphony/runtime.ts` is the repo-local runtime contract.

It defines the repo-specific lifecycle required for the isolated environment to become usable,
including setup and verification expectations such as:

- bootstrap
- migrate
- verify

The lifecycle should stay disciplined:

- Symphony installs repo dependencies from `workspace.packageManager` before `bootstrap` when the
  manifest does not already make install explicit
- `bootstrap` prepares repo-local runtime assumptions
- lifecycle steps consume already-injected env/material
- lifecycle steps fail fast when required inputs are missing
- lifecycle steps do not fetch platform-owned secrets
- lifecycle steps do not render prompt templates

`runtime.ts` should prefer stable repo commands such as:

- `pnpm bootstrap`
- `pnpm migrate`
- `pnpm verify`

rather than embedding large amounts of inline shell logic.

Those commands should be runnable by both humans and Symphony with identical semantics.

The contract should stay declarative. `.symphony/runtime.ts` should define lifecycle using stable
repo commands, not large inline shell pipelines or orchestration logic.

The current live authoring shape is:

- `schemaVersion`
- `workspace`
- `services`
- `env.host.required`
- `env.host.optional`
- `env.inject`
- `lifecycle`

Runtime context is expressed through `env.inject` using `kind: "runtime"` bindings.

Do not export richer manifest buckets such as:

- `env.repo`
- `env.context`

Current preferred command shape:

- `pnpm bootstrap`
- `pnpm migrate`
- `pnpm verify`
- optional `pnpm runtime:doctor`

`.symphony/runtime.ts` should also carry an explicit schema version so the platform can fail on
incompatible contract revisions instead of guessing.

The platform validates contract compliance and setup prerequisites. It does not assume responsibility
for the quality of repo-internal application code.

### Lifecycle Semantics

`bootstrap` should mean: make the repo environment materially ready for repo-owned lifecycle work.

It should include:

- validating injected env needed at bootstrap time
- preparing non-secret repo-local assumptions
- generating non-secret derived artifacts the repo needs
- building required outputs when later lifecycle steps depend on built artifacts

It should not include:

- database-dependent schema setup
- starting long-lived services
- fetching secrets
- rendering prompts
- writing secret-bearing env files

`bootstrap` should be required to succeed without database access. If a step needs database access,
that step belongs in `migrate`.

`bootstrap` should build only the subset required by `migrate` and `verify` when that split is
practical and reliable. If selective builds add fragility, building the required workspace more
broadly is acceptable. Reliability matters more than shaving build scope.

`migrate` should mean: apply deterministic repo-owned setup against the services declared by the
runtime contract.

It should include:

- schema migrations
- tightly coupled generated artifacts required by those migrations, if any
- deterministic service setup required before verification

It should not include:

- service provisioning
- broad app boot logic
- secret fetching

`verify` should mean: prove the isolated environment is usable for repo work.

It should include:

- deterministic readiness checks
- schema/bootstrap invariants
- one high-signal smoke or replay path when needed to prove usability

It should not default to:

- full CI semantics
- flaky external dependency checks
- “the whole codebase is perfect” assertions

`verify` may mutate state only minimally and deterministically. Any writes performed by verification
must be intentional, repeatable, and compatible with reruns.

The preferred first-cut admission proof is one narrow deterministic replay or harness scenario that
proves:

- the declared service setup works
- repo bootstrap completed successfully
- one meaningful repo workflow can execute end to end

The goal is to prove “usable environment,” not to run the repo's full CI suite by default.

### Services

`.symphony/runtime.ts` should declare only the minimum services truly required for `bootstrap`,
`migrate`, and `verify`.

If a service is not required for repo admission, it should not be part of the initial contract
surface. For now, that means declaring only necessary services such as Postgres when the repo truly
depends on it.

## `.symphony/prompt.md`

`.symphony/prompt.md` is the repo-owned prompt template contract.

It is:

- a template only
- rendered in memory by the platform
- populated with platform-provided variables for the current issue/run/workspace

It is not:

- runtime configuration
- a mutable generated file written by Symphony during dispatch

The platform should store the rendered prompt in forensics/logs for auditability.

### Guaranteed Prompt Variables

The current guaranteed render surface is:

- `issue.id`
- `issue.identifier`
- `issue.title`
- `issue.description`
- `issue.state`
- `issue.labels`
- `issue.url`
- `issue.branch_name`
- `repo.default_branch`
- `repo.name`
- `run.id`
- `workspace.path`
- `workspace.branch`

Prompt rendering should fail immediately when:

- the template file is missing
- template syntax is invalid
- a referenced variable is missing
- the rendered output is empty

Symphony is responsible for renderability, not for judging the quality of the repository's prompt
content.

Missing `.symphony/prompt.md` or an invalid template is a platform failure and should move the
issue to `Failed` with a structured operator comment before any agent dispatch occurs.

## Snapshot Semantics

`.symphony/runtime.ts` and `.symphony/prompt.md` are snapshotted at dispatch.

The agent may edit those files during a run, but those edits do not change the current run's
behavior. They only affect a later run.

This preserves determinism while still allowing contract evolution as part of repository changes.

## Auth And Secrets Boundary

Repository-specific environment projection is not owned by Symphony.

The platform does not orchestrate repo-local environment-variable behavior beyond its strict
contract responsibilities.

The preferred runtime input model is process env injection only.

The repo contract should not require a projected secret-bearing file under `.symphony/` for normal
runtime inputs.

### Injected Env Surface

Lifecycle commands should consume only declared injected env.

The contract surface is:

- `env.host.required` for required repo env
- `env.host.optional` for optional repo env
- `env.inject` for service bindings, static bindings, and runtime bindings

Runtime context bindings such as issue/workspace/run identifiers belong in `env.inject` with
`kind: "runtime"`.

Platform-owned env may exist for platform operation and auth, but the repository must not depend on
undeclared platform env directly.

Platform-owned credentials currently include:

- Linear API access
- Codex auth material
- GitHub token access for CLI usage

Those are platform concerns. Repository prompt templates must not directly reference platform
secret material.

The platform should avoid persisting secret-bearing values such as `DATABASE_URL` into repo files by
default. The cleaner model is:

- platform injects runtime env
- `.symphony/runtime.ts` declares lifecycle
- repo commands consume injected env
- observability stores only redacted summaries when needed

`.symphony/` should stay small and intentional. It is not a general-purpose generated-state
directory.

`runtime:doctor` should follow the same injected-env-only rules when run in Symphony mode. If the
repo later adds a separate human convenience mode, that mode must remain explicitly outside the
required Symphony lifecycle contract.

In Symphony mode, `runtime:doctor` should validate the full repo contract in redacted, non-dispatch
form. That means:

- runtime contract parsing and validation
- service/env readiness inspection
- prompt template renderability against a mock contract payload

It should not require agent dispatch to prove that the repo contract is shaped correctly.

Ambient env-file loading should not remain the default behavior for normal Symphony lifecycle
execution. The platform direction is to push startup and lifecycle behavior toward explicit runtime
config rather than allowing the old env-file contract to leak back in.

## Branching

Branching should be deterministic per issue.

The intended model is one canonical issue branch, reused for that issue over time. Alternate branch
strategies are not part of the current v1 direction.

## Failure Semantics

Symphony should use explicit platform states rather than flattening every interruption into a retry.

The intended split is:

- `Failed` for pre-agent platform/bootstrap failures
- `Paused` for provider/orchestration interruptions after or around runtime execution
- `Blocked` for agent/repo-owned stops after work has started

Examples:

- Docker preflight failure
- missing `.symphony/runtime.ts`
- invalid runtime contract
- missing `.symphony/prompt.md`
- prompt render failure
- missing required platform-owned auth/setup prerequisites

For every `Paused` or `Failed` transition, Symphony should also leave a structured Linear comment
that makes the failure obvious to the operator.

That comment should include:

- the failure class
- the failed prerequisite or contract check
- whether the workspace was preserved
- the exact next operator action

Repository-internal build/test/smoke failures are not platform failures. Those belong to the repo's
normal implementation workflow and should not be collapsed into the platform `Failed` state.

`Blocked` should be an explicit non-dispatch, non-terminal state for repo-internal failures that
require human intervention. Symphony should not invent that state implicitly; it should be part of
the declared workflow contract before repos build against it.

There should be no hidden retries. Requeueing should happen only when an operator deliberately moves
the ticket back to `Todo`.

## Migration Shape

The preferred migration shape is replacement, not prolonged dual support.

That means:

- land the new contract surface
- move shared logic into the neutral runtime-contract boundary
- rewrite lifecycle around `bootstrap`, `migrate`, `verify`, and optional `runtime:doctor`
- delete local/worktree orchestration assumptions in the same cut

Legacy platform artifacts that exist only for the old orchestration model should be removed in the
same replacement cut or immediately after. That includes remaining local/worktree orchestration
machinery and any legacy runtime implementations that are no longer part of the target platform
shape.

Dual support should be avoided where possible. It is how architecture drift and fallback behavior
become sticky.

## What The Integrating Repo Should Do

The integrating repository should:

1. create `.symphony/runtime.ts`
2. create `.symphony/prompt.md`
3. ensure bootstrap/migrate/verify lifecycle steps are explicit and deterministic
4. expose stable repo commands for lifecycle execution rather than embedding complex shell programs inline
5. assume Docker-backed isolated execution
6. avoid relying on host-local or worktree-era assumptions
7. keep the repo contract strict and explicit rather than convention-based
8. use process env injection rather than requiring persistent generated secret files
9. optionally expose one redacted diagnostic command such as `pnpm runtime:doctor` or `pnpm contract:doctor`

## What Not To Build Against

Do not build against:

- local workspace fallback assumptions
- legacy Elixir-era assumptions
- worktree-era setup behavior
- `.coldets/*` as a required Symphony contract surface
- dashboard-driven requirements
- best-effort contract inference

The dashboard is explicitly not the priority right now. The orchestration platform and repo
contract are the priority.
