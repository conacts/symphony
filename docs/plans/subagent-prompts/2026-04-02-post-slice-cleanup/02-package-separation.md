You are implementing the package-separation slice for this repository.

This slice begins only after the residual removal slice is complete.

## Objective

Break `@symphony/core` into smaller top-level packages with stronger boundaries and cleaner
dependency direction.

## End State

`@symphony/core` should stop being the default bucket for unrelated domains.

The target package map is:

- `@symphony/runtime-contract`
- `@symphony/workspace`
- `@symphony/tracker`
- `@symphony/review`
- `@symphony/run-journal`
- `@symphony/forensics`
- `@symphony/orchestrator`
- optional `@symphony/runtime` as a thin composition facade

## Dependency Direction

- `orchestrator` may depend on `tracker`, `workspace`, `run-journal`, and `review`
- `workspace` must not depend on tracker semantics
- `tracker` must not depend on workspace mechanics
- `forensics` should depend only on journal contracts
- `apps/api` remains the composition root

## In Scope

- move code out of `packages/core/src` into clearer package ownership
- update imports across `apps/api`, `packages/db`, `packages/test-support`, and internal tests
- reduce or remove `@symphony/core` exports as packages become first-class

## Out of Scope

- changing runtime behavior for product reasons
- reintroducing compatibility shims for local backend or `WORKFLOW.md`
- broad cleanup unrelated to package ownership

## Recommended Order

1. extract `@symphony/workspace`
2. extract `@symphony/tracker`
3. extract `@symphony/review`
4. extract `@symphony/run-journal`
5. extract `@symphony/forensics`
6. extract `@symphony/orchestrator`
7. decide whether `@symphony/core` should remain as a thin facade or be removed

## Acceptance Criteria

- imports no longer default to `@symphony/core` for unrelated concerns
- new packages have coherent ownership
- dependency direction matches the boundary rules above
- tests pass after the package extraction

## Constraints

- prefer package seams that follow responsibility, not folder symmetry
- avoid giant all-at-once moves if bounded package extractions are practical
- do not let `@symphony/core` remain a second full public surface after extraction

## Validation

- targeted package tests after each extraction
- final `pnpm verify` before handoff

## Handoff

Summarize:

- which packages were extracted
- which imports changed
- whether `@symphony/core` remains and, if so, why
