You are implementing the residual removal slice for this repository.

Context:

- The runtime-contract replacement cut has landed.
- The repo now has `.symphony/runtime.ts` and `.symphony/prompt.md`.
- The platform is intended to be Docker-only and injected-env-first.
- Residual code still preserves old `WORKFLOW.md`, local-backend, `.coldets`, and ambient env-file
  assumptions.

Your job is removal, not architecture expansion.

## Objective

Delete the remaining active references to the pre-migration architecture so the repo tells one
runtime story.

## In Scope

- remove local workspace backend exports from public package surfaces
- remove `workspace/local` public surface where it is still exposed for active use
- remove `WORKFLOW.md` and `WORKFLOW_PATH` from active runtime wiring
- remove operator messaging that points at `WORKFLOW.md`
- remove `.coldets/*` assumptions from runtime contract tests and live docker tests
- remove ambient `loadEnv()` startup behavior from the normal API runtime path
- remove duplicated runtime-contract ownership from `@symphony/core`
- update harnesses and test builders to match the new contract shape

## Out of Scope

- extracting new top-level packages
- adding new features
- redesigning APIs for style reasons

## Acceptance Criteria

- `@symphony/core` no longer exports local workspace backend helpers.
- active runtime startup does not accept `WORKFLOW_PATH`.
- active runtime startup does not depend on ambient env-file loading.
- active code and tests no longer rely on `.coldets/local/resolved.env` as contract input.
- runtime-manifest and prompt contract ownership flows through `@symphony/runtime-contract`.
- verification passes on the default orchestration-core task surface.

## Primary Files To Inspect

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

## Constraints

- do not preserve local-backend compatibility “just in case”
- do not leave `WORKFLOW.md` references in active operator-facing paths
- do not replace `.coldets` with a different generated secret-bearing file contract
- keep the scope as deletion plus the minimum rewiring required for the new contract

## Validation

Run the narrowest relevant validation, but finish with the repo’s default orchestration-core
verification path if your changes touch active runtime code:

- targeted package tests first
- `pnpm verify` before handoff if runtime/startup/public exports changed

## Handoff

Summarize:

- what was deleted
- what was rewired
- any residual references intentionally left behind and why
