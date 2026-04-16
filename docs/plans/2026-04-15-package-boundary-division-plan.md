# Package Boundary Division Plan

Date: 2026-04-15

Status: Draft

Audience:

- Symphony maintainers
- Runtime and router implementers
- Future contributors working on the OpenAI Agents-style runtime adoption

Related documents:

- [`docs/plans/2026-04-14-pi-sdk-runtime-migration-plan.md`](./2026-04-14-pi-sdk-runtime-migration-plan.md)
- [`docs/adr/2026-04-14-pi-runner-contract.md`](../adr/2026-04-14-pi-runner-contract.md)
- [`docs/architecture/2026-04-14-intelligent-flow-golden-truth.md`](../architecture/2026-04-14-intelligent-flow-golden-truth.md)
- [`TODO.md`](../../TODO.md)

## Purpose

This plan defines how to divide Symphony's packages and oversized files so the repository is ready for the next major runtime refactor.

The point of this document is not to redesign the whole product.

The point is to make ownership explicit before we adopt a more session-centered runtime model inspired by the OpenAI Agents SDK.

If we do not split the boundaries first, the next runtime refactor will land inside the same concentrated files that already mix:

- router semantics
- Linear/ticket semantics
- runtime supervision
- session mechanics
- Docker concerns
- persistence
- observability projection

That would recreate the current problem in a new shape.

## Summary

The repository should be organized around five clear layers:

1. Product surfaces
2. Control-plane workflow logic
3. Runtime execution and sandbox mechanics
4. Persistence and read models
5. Shared infrastructure and test support

The immediate goal is not package renaming.

The immediate goal is to make each package mean one thing and to split the largest files so the next runtime change has a stable place to live.

## Architectural Rules

These rules govern every split in this document.

### Rule 1: Router is routing authority only

The router chooses the next module and defines the workflow semantics.

The router should not own:

- Docker process management
- Pi session mechanics
- tracker comment text
- DB projection shaping

### Rule 2: Orchestrator is ticket-lifecycle side-effect authority only

The orchestrator owns ticket progression, tracker state moves, operator comments, and cleanup policy.

The orchestrator should not own:

- runtime transport parsing
- low-level sandbox session state
- route selection logic

### Rule 3: Workspace is sandbox authority only

The workspace package owns Docker lifecycle, filesystem mounts, runtime image requirements, and workspace persistence.

The workspace package should not know:

- which router module ran
- which tracker state maps to which runtime outcome
- how operator comments are worded

### Rule 4: Agent harnesses own runner/session mechanics only

The harness layer owns Pi runner startup, event transport, stream normalization, turn/session behavior, and terminal result translation.

The harness layer should not know:

- Linear issue state
- router module policy
- workflow retry semantics

### Rule 5: API is the composition root and operator surface

`apps/api` should compose the runtime, persist canonical facts, expose read models, and coordinate the orchestrator.

It should not be the long-term home for large blocks of runtime internals that could live in the owning package.

## Current Boundary Problems

These are the main concentrations worth addressing before broader runtime adoption.

### 1. `apps/api/src/core/agent-harness-runtime.ts`

This file is currently the highest-value split point.

It mixes:

- harness session startup
- execution supervision
- terminal result acceptance
- timeout classification
- repo snapshot capture
- worker session updates
- canonical runtime lifecycle log emission

This is too much authority in one place.

Target split:

- `runtime-session-coordinator.ts`
- `runtime-outcome-classifier.ts`
- `runtime-lifecycle-recorder.ts`
- `runtime-repo-snapshot-policy.ts`
- `runtime-worker-session-updater.ts`

The top-level file should become a shallow composition module only.

### 2. `apps/api/src/core/runtime-services.ts`

This file is functioning as both:

- the application composition root
- runtime policy assembler
- Docker env shaper
- workspace payload builder
- read-model wiring hub

That is acceptable only at very small scale.

Target split:

- `runtime-service-composition.ts`
- `runtime-bootstrap-config.ts`
- `runtime-workspace-policy.ts`
- `runtime-observability-wiring.ts`

`runtime-services.ts` should remain as the entrypoint that wires those pieces together.

### 3. `packages/agent-harnesses/src/pi/runner-client.ts`

This file mixes:

- bootstrap handshake
- process lifecycle
- stream consumption
- thread item accumulation
- event normalization
- terminal result translation
- timeout mapping

Target split:

- `client/bootstrap-client.ts`
- `client/event-normalizer.ts`
- `client/transcript-assembler.ts`
- `client/terminal-result-translator.ts`
- `client/transport-failure-mapper.ts`

### 4. `packages/agent-harnesses/src/pi/runner-entrypoint.ts`

This file mixes:

- command protocol host
- Pi session startup
- timeout supervision
- event emission
- result construction

Target split:

- `entrypoint/protocol-host.ts`
- `entrypoint/pi-session-factory.ts`
- `entrypoint/timeout-supervisor.ts`
- `entrypoint/event-sink.ts`
- `entrypoint/terminal-result-builder.ts`

### 5. `packages/orchestrator/src/symphony-orchestrator.ts`

This file still blends several distinct ideas:

- issue state progression
- tracker side effects
- retry policy
- workspace cleanup decisions
- routing completion consequences

Target split:

- `orchestrator-lifecycle.ts`
- `orchestrator-tracker-effects.ts`
- `orchestrator-cleanup-policy.ts`
- `orchestrator-completion-routing.ts`

The top-level orchestrator module should coordinate those policies, not implement each one inline.

### 6. `packages/workspace/src/docker-workspace-backend.ts`

This file is too large because it combines:

- Docker command building
- workspace creation
- repo setup
- file transfer
- snapshot behavior
- runtime runner packaging
- container execution helpers

Target split:

- `docker/backend.ts`
- `docker/container-launch.ts`
- `docker/runtime-runner-installation.ts`
- `docker/workspace-files.ts`
- `docker/snapshotting.ts`
- `docker/exec-session.ts`

### 7. `packages/db/src/schema.ts` and `packages/db/src/route-workflow-store.ts`

The database layer is still a concentration point for multiple unrelated read/write concerns.

The schema file is large because it is the single landing place for every table. That is survivable for now, but the stores should become more obviously grouped by product area.

Target store groupings:

- `src/control-plane/`
- `src/runtime/`
- `src/observability/`
- `src/test-support/`

We do not need to split `schema.ts` yet if doing so creates churn. We do need the store modules to stop reading like one long append-only history of features.

### 8. `apps/api/src/core/runtime-workflow-observability.ts`

This file currently mixes:

- workflow loading
- run summarization
- operator-facing read model shaping
- API response composition

Target split:

- `workflow-observability/workflow-reader.ts`
- `workflow-observability/run-summary-builder.ts`
- `workflow-observability/operator-view-builder.ts`
- `workflow-observability/http-projection.ts`

## Package-By-Package Direction

This section defines what each package should mean after the cleanup.

### `apps/api`

Target meaning:

- application entrypoint
- composition root
- runtime supervision
- persistence coordination
- HTTP and realtime operator surfaces

Should own:

- polling and lifecycle entrypoints
- API request handlers
- runtime-to-store coordination
- runtime/operator projections

Should not own:

- deep Pi runner internals
- Docker implementation details
- router module definitions

Recommended internal subdirectories:

- `src/core/runtime-supervision/`
- `src/core/workflow-observability/`
- `src/core/dispatch/`
- `src/core/intake/`
- `src/http/routes/`
- `src/http/serializers/`
- `src/realtime/`
- `src/test-support/`

### `apps/web`

Target meaning:

- operator-facing read model consumer

Should own:

- simple presentation
- data fetching
- issue/workflow screens

Should not own:

- business state inference
- mock/runtime truth duplication beyond test fixtures

### `packages/router`

Target meaning:

- workflow/module registry
- router prompts and deterministic planning helpers
- workflow graph and signal vocabulary

Should own:

- module metadata
- route selection inputs
- allowed transitions
- router result contracts

Should not own:

- Linear comments
- runtime session supervision
- Docker or Pi execution details

Recommended internal subdirectories:

- `src/modules/`
- `src/workflows/`
- `src/planning/`
- `src/contracts/`
- `src/presets/`

### `packages/orchestrator`

Target meaning:

- issue lifecycle policy
- tracker state/comment side effects
- workspace cleanup policy

Should own:

- lifecycle transitions
- paused/failed/completed policy
- operator comment builders

Should not own:

- router decision making
- session stream parsing
- Docker transport details

Recommended internal subdirectories:

- `src/lifecycle/`
- `src/tracker-effects/`
- `src/cleanup/`
- `src/dispatch/`
- `src/failures/`

### `packages/agent-harnesses`

Target meaning:

- Pi runner/session execution mechanics

Should own:

- runner contract implementation
- process lifecycle
- event normalization
- terminal result translation

Should not own:

- tracker or workflow semantics
- DB persistence
- operator comments

Recommended internal subdirectories:

- `src/pi/client/`
- `src/pi/entrypoint/`
- `src/pi/contracts/`
- `src/pi/internal/`
- `src/pi/test-support/`

### `packages/workspace`

Target meaning:

- Docker-backed sandbox lifecycle

Should own:

- container image contract
- file mounts
- repo checkout/prep
- snapshot and restore
- command exec

Should not own:

- module routing
- ticket lifecycle
- run outcome semantics beyond sandbox facts

Recommended internal subdirectories:

- `src/docker/`
- `src/session/`
- `src/contracts/`
- `src/test-support/`

### `packages/db`

Target meaning:

- canonical control-plane persistence
- canonical runtime/read-model persistence

Should own:

- stores
- schema
- migrations
- DB-level test harnesses

Should not own:

- route selection logic
- tracker comment semantics
- projection repair logic that hides invalid writes

Recommended internal subdirectories:

- `src/control-plane/`
- `src/runtime/`
- `src/observability/`
- `src/internal/`

### `packages/runtime-contract`

Target meaning:

- runtime manifest and runtime command contracts

Should own:

- manifest schemas
- runtime result contracts
- config validation

Should not own:

- runtime orchestration behavior
- ticket lifecycle meaning

### `packages/runtime-policy`

Target meaning:

- runtime admission and queue policy

Should remain small.

If this package grows, the answer is not "put more runtime behavior here." The answer is to move concrete behavior back to the true owner.

### `packages/runtime`

Target meaning:

- thin public runtime facade

This package should either remain a thin facade over orchestrator + tracker + workspace composition, or be removed later if it proves redundant.

It should not become the dumping ground for "miscellaneous runtime things."

### `packages/tracker`

Target meaning:

- Linear-facing issue and state model boundary

The rename to `linear` is still deferred.

What matters now is that this package remains the only place that directly owns tracker-normalization concepts.

### `packages/contracts`

Target meaning:

- shared operator-facing and API-facing types

This package should not accumulate runtime internals that belong in `runtime-contract`.

### `packages/agent-analytics` and `packages/forensics`

Target meaning:

- observability derivations only

These packages must never become lifecycle authority.

If two modules disagree with runtime truth, runtime truth wins and the derived layer must be repaired.

### `packages/test-support`

Target meaning:

- builders and harnesses shared across package tests

This package is currently useful, but it must stay downstream of the product model.

It should not become the hidden place where product logic is reimplemented.

## Sequence Of Work

This is the recommended order.

### Phase 1: Split the largest runtime concentration points

Focus:

- `apps/api/src/core/agent-harness-runtime.ts`
- `packages/agent-harnesses/src/pi/runner-client.ts`
- `packages/agent-harnesses/src/pi/runner-entrypoint.ts`

Completion bar:

- top-level files become composition surfaces
- timeout/outcome logic lives in named modules
- tests move with the new seams

### Phase 2: Split application composition from policy shaping

Focus:

- `apps/api/src/core/runtime-services.ts`
- workspace env and launch policy helpers

Completion bar:

- composition root is visibly separate from policy/config helpers

### Phase 3: Split workspace backend internals

Focus:

- `packages/workspace/src/docker-workspace-backend.ts`

Completion bar:

- Docker lifecycle, file operations, and runner packaging are not implemented inline in one file

### Phase 4: Split orchestrator into explicit policy modules

Focus:

- `packages/orchestrator/src/symphony-orchestrator.ts`

Completion bar:

- tracker effects, cleanup policy, and lifecycle transition logic can be read independently

### Phase 5: Group DB stores by product area

Focus:

- move store files into grouped subdirectories
- keep exports stable initially

Completion bar:

- a reader can find route workflow persistence, observability persistence, and runtime persistence without hunting across the whole package

### Phase 6: Split workflow observability projection

Focus:

- `apps/api/src/core/runtime-workflow-observability.ts`

Completion bar:

- reading state, summarizing runs, and shaping operator payloads are separate concerns

## Guardrails

The cleanup should not do these things:

- do not rename packages just because the names feel imperfect
- do not merge packages before their boundaries are clean
- do not move logic into shared helpers if doing so hides ownership
- do not introduce compatibility shims for old boundaries we no longer want
- do not let tests keep importing from deprecated deep paths after a split

## Acceptance Criteria

This package-division effort is successful when:

- the biggest runtime and orchestration files become shallow composition modules
- package meanings are easier to explain in one sentence each
- runtime internals no longer need to live in `apps/api` unless they truly coordinate application state
- the repository has a stable place to land the OpenAI Agents-style runtime refactor

## Immediate Recommendation

Before implementing the larger runtime adoption work, complete these three structural slices first:

1. split `agent-harness-runtime.ts`
2. split `runner-client.ts` and `runner-entrypoint.ts`

Status note:

- the public Pi runner surface now uses `runner.ts`, `runner-client.ts`, `runner-entrypoint.ts`, `runner-process.ts`, and `runner-contract.ts`
- the next docs should talk about the stable runner surface, not the historical `sdk-runner-*` filenames
3. split `runtime-services.ts`

That is the smallest set of preparatory work that materially lowers the risk of the next refactor.
