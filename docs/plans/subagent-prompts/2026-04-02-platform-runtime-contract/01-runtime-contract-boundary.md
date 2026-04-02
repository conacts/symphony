# Subagent Prompt 01: Runtime-Contract Boundary

You are implementing the `@symphony/runtime-contract` boundary for this repository’s replacement cut.

You are not alone in the codebase. Other workers may be editing nearby areas. Do not revert their
changes. Adjust to them.

## Objective

Make `packages/runtime-contract` the clear, deep home for repository contract logic:

- runtime contract parsing and normalization
- schema/version compatibility
- env/service validation
- prompt renderability checks

This slice should deepen the existing package rather than inventing a parallel abstraction.

## Ownership

You own:

- `packages/runtime-contract/**`

You may make minimal compatibility edits outside your area only if absolutely necessary to keep the
package coherent, but avoid broad adoption changes. Adoption is owned by other workers.

## Expected Outcomes

- the package exposes a coherent public surface for runtime contract and prompt contract behavior
- prompt renderability is represented here, not scattered elsewhere
- schema/version handling is explicit
- the package reads like the single source of truth for contract logic

## Constraints

- keep the contract declarative
- do not add orchestration policy here
- do not add local/worktree compatibility
- do not broaden service support beyond what the repo already needs for the first cut

## Acceptance Criteria

- `packages/runtime-contract` has clear exports for runtime manifest and prompt-contract logic
- tests in this package cover parsing/validation/failure behavior
- the package does not depend on Coldets-specific or local-backend assumptions
- the package is ready for adoption by the platform runtime without type duplication

## Notes

- The target contract surface is `.symphony/runtime.ts` plus `.symphony/prompt.md`.
- Contract files are snapshotted at dispatch.
- Prompt rendering failures are platform failures.

## Validation

Run the narrowest relevant validation for your slice:

- package tests
- package typecheck
- package lint
