# Shared Postgres and Remote Turbo Cache

Date: 2026-04-05

## Purpose

Capture the current recommended direction for increasing Symphony worker density without requiring
aggressive per-container CPU and memory provisioning.

This is a short architecture note, not an ADR. It records the recommended next moves and the
constraints we expect to remain true after those moves land.

## Current Problem

Symphony can run multiple repository workspaces in parallel, but worker density is limited by two
forms of duplicated cost:

- duplicated infrastructure memory when each workspace provisions its own Postgres sidecar
- duplicated build/test CPU when multiple workers execute the same Turborepo tasks from cold state

Docker resource limits make this feel more explicit, but the underlying machine limit is still the
same when processes run directly on the host: concurrent heavy workers are primarily CPU-bound, and
per-workspace Postgres instances consume avoidable RAM.

## Recommended Direction

### 1. Share infra, isolate data

Move from one Postgres instance per workspace to one shared Postgres instance for the host or
worker pool.

Isolation should move from process/container boundaries to database naming:

- one shared Postgres server
- one database per PR, workspace, or worker lane
- per-workspace `DATABASE_URL` derived dynamically from the assigned logical database

This is expected to reduce memory pressure materially while preserving logical isolation.

### 2. Enable remote Turborepo cache

Treat remote Turbo cache as the default optimization layer for repeated PR work across workers.

Expected benefit:

- the first worker that performs new deterministic work pays the full CPU cost
- later workers can often reuse cached outputs instead of rebuilding or rerunning the same task

This is the highest-leverage way to reduce repeated build/test cost across parallel workers without
requiring repository-specific compiler or bundler rewrites first.

### 3. Keep repository smoke optimization repo-owned

Smoke and replay lanes are still a major uncached cost in many repositories.

Symphony should not block platform progress on rewriting repository smoke runners immediately.
Instead, Symphony should document a preferred repository standard:

- PR-critical verification should be exposed as Turbo-addressable tasks where feasible
- deterministic smoke or replay lanes should prefer shardable, cache-aware task boundaries
- shell-only monolithic smoke runners are acceptable short-term, but they reduce cross-worker cache
  reuse and should be migrated over time by the repository that owns them

## Important Caveats

Remote Turbo cache is not a blanket solution for all worker cost.

It helps when work is:

- modeled as Turbo tasks
- deterministic for the same inputs
- declared with correct inputs and outputs

It does not automatically remove the cost of:

- new work that no worker has built yet
- non-Turbo shell orchestration
- integration flows that depend on mutable external state
- long-lived `dev` processes

The platform should assume:

- shared Postgres reduces duplicated infrastructure RAM
- remote Turbo cache reduces duplicated deterministic task CPU
- genuinely new work and non-cacheable integration work still define the remaining heavy phase

## Platform Guidance

Until measured otherwise, Symphony should plan around the following operating model:

- shared Postgres is preferred over per-workspace Postgres sidecars
- remote Turbo cache is preferred for all Turborepo-backed repositories
- worker scheduling should still distinguish heavy execution from lighter review or synthesis work
- repository smoke-task restructuring is a recommended follow-up optimization, not a platform
  prerequisite

## Out of Scope For This Note

This note does not define:

- the concrete shared-Postgres implementation
- the exact scheduler slot model for heavy vs light workers
- remote cache vendor selection or auth flow
- repository-specific smoke-task migrations
- a final ADR-level runtime contract change

Those should be handled in follow-up implementation notes or ADRs once the platform begins landing
the shared-infra and remote-cache changes.
