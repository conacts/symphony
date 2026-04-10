# Route Persistence Roadmap

Date: 2026-04-10

## Purpose

Define the remaining implementation steps for Symphony's router persistence work after the first
isolated router package and initial database foundation landed on the feature branch.

This document is intentionally operational. It is not restating the router architecture from
scratch. It answers:

- what is already done
- what still needs to be built
- what must remain authoritative
- what order we should use so we do not create another shadow control plane

The goal is to move from "router package exists" to "router state can be stored, recovered, and
eventually integrated into the runtime cleanly."

## Design Constraints

These constraints should remain true for every slice that follows.

- `packages/router` stays pure and replayable.
- `packages/db` owns durable router persistence contracts.
- `apps/api` should not invent router reconstruction logic.
- snapshots are caches, not authority.
- route history is the authority.
- first integration is additive.
- no hard database cuts until the new router persistence model proves itself.
- no runtime integration until read and rehydration surfaces are explicit.

## What Is Already Done

### Router Package

The isolated `@symphony/router` package now exists and already proves the core workflow model:

- explicit `WorkflowNode` and `WorkflowEdge` building blocks
- class-oriented `WorkflowRouter` and `WorkflowSession` APIs
- durable journal-oriented types
- deterministic routing strategy
- comparison and simulation harnesses
- mock current-Symphony flow router definitions and replay fixtures

This is enough to prove the package shape is coherent without touching the runtime.

### Initial Persistence Foundation

The database layer already has the first route persistence tables:

- `route_workflows`
- `route_history_events`
- `route_decisions`
- `route_projection_snapshots`

The write-side store already supports:

- creating one active workflow per issue
- recording full route results as history and decision rows
- appending later history events such as `command_settled`
- storing the latest projection snapshot as a cache

This means the storage model already exists. The missing work is now mostly on the read and
integration side.

## Authority Model

This must remain explicit as the implementation grows.

### Authoritative

- `route_history_events`

This is the durable event stream for router state. If there is ever a disagreement between a
snapshot, a decision row, and history, history wins.

### Read Models / Caches

- `route_decisions`
- `route_projection_snapshots`

These are intentionally duplicated for explainability and performance. They are useful and
important, but they are not allowed to become lifecycle authority.

### Existing Symphony Tables That Stay Authoritative For Their Own Domains

- `symphony_runs` for runtime execution state
- `symphony_events` for runtime turn history
- `symphony_issues` for issue identity

The router work should not collapse those concepts together.

## The Remaining Plan

The next work should happen in narrow phases.

## Phase 1: Finish The Read Model Boundary

Status: in progress

The first missing piece is a canonical way to load router state for rehydration without teaching
`apps/api` how to reconstruct workflow history itself.

The DB boundary should provide:

- workflow metadata
- latest projection snapshot, if any
- route history after the snapshot sequence
- latest decision, if any

This gives the runtime one canonical shape for "what does the router know right now?"

The important rule here is:

**the read API should express rehydration intent, not expose a bag of unrelated getters that force
callers to reconstruct the model manually.**

Target surface:

- `listHistoryAfter(workflowId, afterEventSequence)`
- `getLatestDecision(workflowId)`
- `loadWorkflowHydrationState(workflowId)`
- `loadWorkflowHydrationStateByIssue(issueIdentifier)`

These are enough for the first integration slice.

## Phase 2: Prove Snapshot Plus Tail Recovery

Status: next after Phase 1 read model

We need tests that prove the rehydration contract, not just the write contract.

The important cases are:

- workflow exists but no history yet
- workflow has a snapshot and no tail events
- workflow has a snapshot and later unsnapshotted tail events
- missing workflow returns `null`
- duplicate or inconsistent writes are still rejected by the DB

This is the point where the DB layer becomes trustworthy enough to use for runtime rehydration.

## Phase 3: Add A Router Rehydration Seam

Status: not started

The runtime should not need full history forever if a projection snapshot already exists.

That means the router package will likely need a small rehydration seam later, such as:

- project from initial history only
- or project from an existing projection plus a history tail

This should live in `packages/router`, not in `apps/api` and not in `packages/db`.

The DB layer should hand back the facts needed for rehydration. The router package should own the
actual projection logic.

This is an important separation:

- DB returns facts
- router derives state

## Phase 4: Thin API Adapter

Status: not started

Only after the read/rehydration surface is clear should `apps/api` grow a thin adapter.

That adapter should:

- load active workflow state for an issue
- hand history or snapshot-plus-tail to the router package
- persist the next route result through the DB store

It should not:

- decide how to reconstruct projection state
- become a second router
- invent reconciliation logic outside the persistence boundary

This is the main reason the read model work comes before integration.

## Phase 5: First Narrow Runtime Cutover

Status: not started

The first live cutover should be small. We should not replace the entire orchestrator state machine
in one shot.

The best first live cutover is likely:

- mirror current run-mode derivation through a router definition
- use router state only for one bounded routing path
- keep the current runtime behavior otherwise intact

The goal of the first cutover is confidence, not maximum surface area.

## Phase 6: Replace Redundant Routing Truth

Status: future cleanup

Once the new router persistence model is actually driving workflow decisions, we should remove
redundant routing truth from older surfaces.

The likely targets are:

- timeline entries carrying routing truth
- runtime log records doubling as route decision storage
- ad hoc state derivation from tracker state alone

This is a cleanup slice, not a prerequisite for the new model.

## What We Should Not Do Yet

To keep the blast radius under control, we should explicitly avoid these changes for now:

- no hard deletions of existing DB tables
- no repo-wide migration to Effect
- no arbitrary user-defined runtime graph execution yet
- no `api` integration that reconstructs projection ad hoc
- no treating snapshots as authority
- no replacing the orchestrator end-to-end in one pass

## Why This Order Matters

If we integrate before the read model is explicit, we will leak router reconstruction logic into the
API layer. That would create exactly the kind of shadow authority we are trying to eliminate.

If we cut old schema too early, we will spend time fixing churn instead of proving the new model.

If we wait too long to add the read model, the persistence layer becomes write-only, which makes
future integration harder and more speculative.

So the correct order is:

1. write model
2. read model
3. rehydration seam
4. thin adapter
5. narrow cutover
6. cleanup

## Immediate Next Slice

The next concrete implementation slice is:

1. finish the route workflow hydration read API in `packages/db`
2. add tests for snapshot-plus-tail loading
3. keep everything additive
4. stop there and reassess before wiring into `apps/api`

That keeps the architecture clean and moves the router work forward without forcing premature
runtime integration.
