# Platform Runtime-Contract Replacement Plan

Date: 2026-04-02

## Goal

Deliver a one-cut migration inside this repository that makes the Symphony platform Docker-only,
contracts-first, and free of the local/worktree/`WORKFLOW.md`/Elixir split-brain architecture.

## Scope

In scope:

- deepen and adopt `packages/runtime-contract`
- move platform wiring toward `.symphony/runtime.ts` and `.symphony/prompt.md`
- remove local backend selection from the active runtime story
- encode `Failed` and `Blocked` semantics clearly
- delete legacy local/worktree/Elixir assumptions and docs
- sideline dashboard participation from default build/dev/verify paths

Out of scope:

- coldets-v2 integration work
- target-repo lifecycle command implementation
- broad UI/dashboard feature work

## Execution Order

1. Worker 1: runtime-contract boundary
2. Worker 2: Docker-only runtime wiring and failure semantics
3. Worker 3: legacy deletion and docs cleanup
4. Worker 4: build/dev/verify gate cleanup and dashboard sidelining

Recommended integration order:

1. Merge Worker 1 first.
2. Rebase Worker 2 onto Worker 1.
3. Rebase Worker 3 onto Worker 2.
4. Land Worker 4 last, once the core runtime story is stable.

## Cross-Cutting Acceptance Criteria

- The repo’s active platform story is Docker-only.
- The required orchestration contract no longer depends on `WORKFLOW.md`.
- The repo’s active contract story points at `.symphony/runtime.ts` and `.symphony/prompt.md`.
- `@symphony/runtime-contract` is the authoritative shared contract boundary.
- `Failed` and `Blocked` semantics are explicit in code and docs.
- Local/worktree/Elixir assumptions are no longer part of the active platform surface.
- Default scripts no longer treat the dashboard as part of the critical path.

## Risk Areas

- hidden re-exports or startup wiring that still bless local backends
- tests that encode worktree/local assumptions
- env-loading paths that keep the old contract alive by accident
- docs that still describe parity/oracle/evaluation-era behavior
- deleting the dashboard from critical paths without accidentally breaking unrelated packages

## Deliverables

- one repo-scoped PRD
- four bounded implementation slices
- updated ADR-aligned documentation
- a repository that tells one consistent orchestration story
