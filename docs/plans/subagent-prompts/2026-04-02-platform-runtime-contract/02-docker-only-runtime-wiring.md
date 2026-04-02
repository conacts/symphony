# Subagent Prompt 02: Docker-Only Runtime Wiring

You are implementing the platform runtime adoption slice for this repository’s replacement cut.

You are not alone in the codebase. Other workers may be editing nearby areas. Do not revert their
changes. Adjust to them.

## Objective

Make the active Symphony runtime story Docker-only and contract-first.

This includes:

- removing local backend selection from the runtime happy path
- wiring the platform toward `@symphony/runtime-contract`
- removing `WORKFLOW.md` from the required orchestration contract story
- making platform failure semantics explicit

## Ownership

You own:

- `apps/api/**`
- `packages/core/src/public/**`
- `packages/core/src/index.ts`
- `packages/core/src/workspace/**`
- `packages/core/src/workflow/**`
- `WORKFLOW.md`

Do not edit docs or root build gating except where unavoidable for compile coherence. Other workers
own those areas.

## Expected Outcomes

- Docker is the only active backend story in runtime wiring
- local backend selection is removed or deprecated out of the active path
- `Failed` and `Blocked` semantics are represented clearly in platform code
- runtime startup and dispatch code point at the new contract surface

## Constraints

- do not preserve dual support just to soften the cut
- do not reintroduce fallback behavior
- keep `Blocked` non-terminal and non-dispatch
- keep `Failed` for platform-owned refusal/setup/render failures only

## Acceptance Criteria

- runtime/backend selection code no longer blesses local execution as a peer mode
- the runtime contract story no longer depends on root `WORKFLOW.md`
- prompt/render failure handling is explicit in platform paths
- code paths align with the ADRs and handoff document
- tests are updated to reflect the new active runtime story

## Notes

- `packages/runtime-contract` already exists and should be adopted, not replaced.
- Contract files are `.symphony/runtime.ts` and `.symphony/prompt.md`.
- Prompt templates are rendered in memory and snapshotted at dispatch.

## Validation

Run the narrowest relevant validation for your slice:

- `@symphony/api` tests/typecheck/lint
- affected `@symphony/core` tests/typecheck/lint
