# Post-Slice Cleanup And Package Separation Plan

Date: 2026-04-02

## Goal

Finish the runtime-contract migration by removing residual legacy surface area first, then split
`@symphony/core` into smaller packages with hard boundaries.

This plan is intentionally sequential:

1. Slice 1 removes stale `WORKFLOW.md`, local-backend, `.coldets`, and ambient-env assumptions that
   still leak through active code and tests.
2. Slice 2 starts only after Slice 1 is complete, so package extraction happens on a clean runtime
   story instead of preserving more legacy compatibility through new package seams.

## Slice 1: Removal

### Objective

Delete the remaining active references to the pre-migration architecture.

### Scope

In scope:

- remove local workspace backend exports and local-only public surface
- remove `WORKFLOW.md` and `WORKFLOW_PATH` from active runtime wiring
- remove stale operator messaging that points at `WORKFLOW.md`
- remove `.coldets/*` assumptions from runtime contract tests and live docker tests
- remove ambient env-file loading from the main API startup path
- remove duplicated runtime-contract ownership from `@symphony/core`
- update harnesses and test builders to match `.symphony/runtime.ts` plus `.symphony/prompt.md`

Out of scope:

- package extraction
- renaming broad internal module trees for style only
- adding new runtime features

### Acceptance Criteria

- `@symphony/core` no longer exports `createLocalWorkspaceBackend` or `workspace/local`.
- active API runtime config no longer accepts `WORKFLOW_PATH`.
- active API startup no longer calls `loadEnv()` by default.
- active code and tests no longer model `.coldets/local/resolved.env` as required contract input.
- operator-facing runtime errors no longer reference `WORKFLOW.md`.
- runtime-manifest and prompt contract ownership flows through `@symphony/runtime-contract`, not
  parallel `@symphony/core` exports.
- verification passes on the narrowed orchestration-core task surface.

### Primary Targets

- `packages/core/src/index.ts`
- `packages/core/src/public/index.ts`
- `packages/core/src/workspace/workspace-backend.ts`
- `packages/core/src/workspace/local.ts`
- `packages/core/src/workflow/**`
- `apps/api/src/core/env.ts`
- `apps/api/src/main.ts`
- `apps/api/src/core/codex-linear-graphql-tool.ts`
- `apps/api/src/test-support/**`
- `packages/test-support/src/runtime-builders.ts`
- `packages/core/src/runtime-manifest/runtime-manifest-env.test.ts`
- `apps/api/src/core/codex-agent-runtime.live-docker.test.ts`

### Risks

- deleting the workflow package too early while runtime wiring still imports its types
- deleting local backend exports before tests and harnesses are migrated
- broad env-loading changes accidentally breaking non-Symphony local tooling

## Slice 2: Package Separation

### Objective

Break `@symphony/core` into smaller top-level packages with clear dependency direction and a thin
composition surface.

### Scope

In scope:

- define target package boundaries
- move code out of `@symphony/core` by responsibility, not by file count
- update imports across `apps/api` and internal packages
- reduce `@symphony/core` to a temporary facade or remove it entirely if little value remains

Out of scope:

- changing runtime behavior for product reasons
- broad API redesign for external consumers beyond package movement

### Target Package Boundaries

- `@symphony/runtime-contract`
  contract parsing, prompt rendering, runtime doctor, manifest schema/versioning
- `@symphony/workspace`
  docker backend, workspace contracts, runner image, metadata, materialization
- `@symphony/tracker`
  issue model, state matching, linear adapter, tracker operations
- `@symphony/review`
  review provider/publisher abstractions and GitHub review processing
- `@symphony/run-journal`
  run journal contracts and persistence-facing types
- `@symphony/forensics`
  read models over run-journal data
- `@symphony/orchestrator`
  dispatch, retries, lifecycle, monitoring, state machine
- optional `@symphony/runtime`
  thin composition facade only, if keeping an assembly package remains useful

### Boundary Rules

- `orchestrator` may depend on `tracker`, `workspace`, `run-journal`, and `review`.
- `workspace` must not depend on tracker semantics.
- `tracker` must not depend on workspace mechanics.
- `forensics` should depend only on journal contracts.
- `apps/api` should remain the composition root for platform runtime wiring.
- no new package should preserve local-backend compatibility as a “temporary bridge”.

### Acceptance Criteria

- `@symphony/core` is no longer the primary import target for unrelated domains.
- workspace, tracker, review, journal, forensics, and orchestration each have explicit package
  ownership.
- import paths reflect one dependency direction instead of a convenience barrel.
- tests continue to pass after package extraction.

## Execution Order

1. Complete Slice 1 removal.
2. Re-run repo-wide verification on the orchestration-core path.
3. Freeze the post-removal package map.
4. Execute Slice 2 extraction in bounded packages, starting with the lowest-level domains first:
   `workspace`, `tracker`, `review`, `run-journal`, `forensics`, `orchestrator`.

## Deliverables

- one bounded removal slice
- one bounded package-separation slice
- a cleaned platform surface that tells one runtime story
- a package layout with stronger top-level boundaries than `@symphony/core`
