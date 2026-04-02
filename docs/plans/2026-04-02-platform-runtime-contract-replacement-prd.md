## Problem Statement

The Symphony repository is still carrying multiple architectural stories at once: a Docker-backed
future path, a local/worktree compatibility path, a legacy Elixir lineage, a `WORKFLOW.md`-driven
runtime contract, and a dashboard that is currently ahead of the product priorities. That split
makes the platform harder to reason about, harder to validate, and harder to evolve.

From the maintainer and operator perspective, the platform needs to become explicit again:

- Docker must be the only execution model.
- The repo contract must be `.symphony/runtime.ts` plus `.symphony/prompt.md`.
- The neutral shared implementation should live in `@symphony/runtime-contract`.
- Platform-owned failures must be distinct from repo-owned lifecycle failures.
- Legacy local/worktree/Elixir paths must stop shaping the product surface.

## Solution

Replace the current mixed-contract runtime with a single repository-scoped replacement cut inside
this repo.

That cut will:

- adopt `packages/runtime-contract` as the shared contract boundary
- make Docker the only supported workspace backend
- remove `WORKFLOW.md` from the required orchestration contract
- shift prompt/template ownership to `.symphony/prompt.md`
- preserve `.symphony/runtime.ts` as the repo-owned runtime contract surface
- encode `Failed` and `Blocked` semantics clearly in platform code and docs
- sideline dashboard concerns from the critical path
- delete legacy local/worktree/Elixir assumptions from the active platform story

## User Stories

1. As a Symphony maintainer, I want one execution model, so that platform behavior is explicit and predictable.
2. As a Symphony maintainer, I want the runtime contract implemented behind a neutral boundary, so that contract logic is not scattered across unrelated packages.
3. As a Symphony maintainer, I want `@symphony/runtime-contract` to be the single source of truth for repo contract parsing and validation, so that contract behavior does not drift.
4. As a Symphony operator, I want platform-owned setup failures to be clearly distinguishable from repo-owned lifecycle failures, so that I can route issues correctly.
5. As a Symphony operator, I want Docker to be mandatory, so that I am not debugging two workspace models.
6. As a Symphony operator, I want the platform to refuse unsupported repo shapes immediately, so that bad tickets are not silently dispatched.
7. As a Symphony maintainer, I want `WORKFLOW.md` removed from the required orchestration contract, so that runtime config and prompt content are no longer muddled together.
8. As a Symphony maintainer, I want `.symphony/prompt.md` treated as a template-only contract input, so that prompt source and rendered artifact stay distinct.
9. As a Symphony maintainer, I want prompt rendering failures to be explicit platform failures, so that missing templates and bad variables fail closed before dispatch.
10. As a Symphony maintainer, I want contract files snapshotted at dispatch, so that mid-run edits do not change active behavior.
11. As a Symphony maintainer, I want the platform public surface to stop advertising local backends, so that consumers see the correct product shape.
12. As a Symphony maintainer, I want workspace/backend code to converge on Docker-only assumptions, so that cleanup and observability logic become simpler.
13. As a Symphony maintainer, I want legacy local/worktree tests and docs removed, so that the repo no longer blesses unsupported paths.
14. As a Symphony maintainer, I want legacy Elixir artifacts removed from the active platform story, so that the repo no longer presents an oracle/comparison model that we are no longer following.
15. As a Symphony maintainer, I want build/dev/verify gates to stop being held hostage by the dashboard, so that core orchestration work can move independently.
16. As a Symphony maintainer, I want dashboard participation in default scripts to become explicit rather than automatic, so that the platform core can harden first.
17. As a Symphony maintainer, I want env-loading behavior on Symphony contract paths to move toward explicit runtime config, so that the old env-file model stops leaking back in.
18. As a Symphony maintainer, I want migration work to land as one replacement cut, so that dual support does not create another long-lived ambiguity layer.
19. As a future consumer of Symphony, I want the repo contract story to be small and obvious, so that integrating repositories know exactly what the platform expects.
20. As a future implementer working in this repo, I want a concrete execution plan with bounded ownership, so that multiple workers can make progress without colliding.

## Implementation Decisions

- `@symphony/runtime-contract` is the neutral shared implementation boundary for contract parsing, validation, schema/version compatibility, prompt renderability, and env/service normalization.
- Docker-only execution is the product contract. Local/worktree execution is deletion scope, not an alternative mode to preserve.
- The root repo contract for admitted repositories is `.symphony/runtime.ts` plus `.symphony/prompt.md`.
- `WORKFLOW.md` is no longer part of the required orchestration contract.
- Prompt templates are rendered in memory; the rendered prompt is stored in observability/forensics, not written back into the repository as a generated file.
- Contract files are snapshotted at dispatch and do not mutate active run behavior.
- Platform-owned refusal/setup/render failures map to `Failed`.
- Repo-owned lifecycle failures map to `Blocked`, which must be non-terminal and non-dispatch.
- The platform should keep dashboard concerns off the critical path for this migration.
- This repo’s migration should be delivered as one replacement cut rather than a prolonged dual-support bridge.

## Testing Decisions

- Good tests should validate external behavior and contract outcomes rather than implementation details.
- The contract boundary should be tested through parsing, validation, normalization, and failure-mode tests.
- Docker-only runtime wiring should be tested through selection/preflight/failure semantics, not just unit-level helper assertions.
- Legacy deletion work should be tested by removing or replacing tests that currently bless unsupported local/worktree behavior.
- Script/build-gate changes should be tested by verifying the default repository workflows align with the new architecture and no longer require sidelined surfaces.
- Prior art includes the existing runtime-manifest tests, workspace backend tests, runtime service tests, and public API tests already present in this repository.

## Out of Scope

- Coldets-v2 implementation work
- Integrating repository-specific `.symphony/runtime.ts` and `.symphony/prompt.md` content
- General dashboard redesign or product polish
- Broader multi-repo rollout work
- Future service declarations beyond the minimum first-cut Postgres surface

## Further Notes

- `packages/runtime-contract` already exists in this repo and should be deepened rather than replaced.
- The plan should assume multiple workers may execute in parallel; ownership boundaries must stay explicit.
- The migration should leave the repo telling one story, not multiple partial stories.
