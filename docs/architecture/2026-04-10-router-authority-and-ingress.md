# Router Authority And Explicit Ingress

Date: 2026-04-10

## Purpose

This document captures the next architectural direction for Symphony's workflow router after the
first live cutovers landed.

The goal is no longer "prove the router package can exist."

The goal is:

- make workflow history the first-class control plane
- route every meaningful workflow state change through explicit router signals
- remove the remaining shadow routing authority from legacy runtime surfaces
- prepare the system for user-defined workflow graphs without hidden hardcoded transitions

This document is intentionally opinionated. It records the decisions we want to hold while the next
passes land.

## Core Position

Symphony is moving away from:

- tracker state as implicit workflow authority
- orchestrator-local routing decisions
- ad hoc refresh requests and direct state mutations that bypass the router journal
- projections and logs that partially describe lifecycle truth

Symphony is moving toward:

- an explicit workflow event engine
- router journal history as the lifecycle authority
- durable replay and recovery as a baseline property
- thin adapters that translate real-world changes into first-class router signals

The router is not a helper anymore.

It is becoming the workflow control plane.

## What "First-Class Events Engine" Means

Every meaningful workflow fact should become a durable journal event.

That includes:

- tracker state observations
- runtime run starts
- runtime completions
- startup failures
- router decisions
- emitted commands
- command settlements
- external workflow-driving ingress such as GitHub review requeue signals

The important distinction is:

- the tracker is an external system of record for issue state
- the router journal is Symphony's internal system of record for workflow progression

Tracker state tells us what the external issue currently says.

The router journal tells us why Symphony decided to move work, which commands it emitted, and which
facts it observed on the way there.

That journal is the basis for:

- observability
- replay
- recovery after restart
- comparison across routing strategies
- future user-defined workflow graphs

## Why Dedicated Ingress For Non-Running State Changes Matters

The current runtime routing is already strong while a run is active:

- dispatch/bootstrap is routed
- run start activation is routed
- running issue state changes are routed
- runtime completions are routed

The gap is idle or non-running workflow changes.

Examples:

- a GitHub review moves an issue from `In Review` to `Rework`
- a reviewer moves an issue to `Approved`
- an operator moves an issue to `Paused`, `Blocked`, or `Failed`
- a ticket is reopened into `Todo` or `Rework` while no run is active

If Symphony only notices those changes later during polling, then the router is not the real
authority. It is just reacting after the fact.

Dedicated ingress fixes that.

A dedicated ingress means:

- the state change is recorded immediately as a router signal
- the router decides what the next workflow step is
- emitted commands are persisted and settled explicitly
- observability becomes immediate instead of eventual

This is the difference between:

- "the poller happened to see a changed issue"

and

- "the workflow engine consumed a real event and advanced the state machine intentionally"

The second model is the only one that scales to configurable routers.

## Hard Cut Against Legacy Routing Authority

We should be explicit about this:

the old routing system should not coexist indefinitely with the new one.

Keeping both systems alive creates exactly the failure mode we want to eliminate:

- two sources of truth
- two places where transitions can happen
- two explanations for the same lifecycle move
- growing reconciliation logic

So the direction is a hard cut, not an indefinite compatibility bridge.

That does not mean every old path disappears in one commit.

It means every pass should move authority in one direction only:

1. route the behavior through workflow history
2. prove the new path with tests
3. remove the old authority path

The cleanup target is not only dead code. It is dead authority.

Logs, timeline entries, tracker state, and runtime state may still exist for their own domains, but
they should stop acting as parallel workflow routers.

## Authority Model

This must remain sharp.

### Workflow Authority

`route_history_events`

This is the source of truth for workflow progression.

If there is ever disagreement between:

- route history
- route decisions
- route snapshots
- runtime logs
- timeline projections

history wins.

### Read Models And Caches

- `route_decisions`
- `route_projection_snapshots`
- issue timeline entries
- routing-related runtime log records

These are useful, but they are not allowed to become lifecycle authority.

### External Domain Authorities

- `symphony_issues` remains the canonical issue identity binding
- `symphony_runs` remains the canonical runtime execution record
- the tracker remains the external issue-state authority at the product boundary

None of those should replace the router journal as the workflow progression authority.

## What This Enables Long Term

The entire point of this work is not only cleaner internals.

It is to make Symphony capable of supporting custom workflow graphs safely.

Users cannot build meaningful custom state machines if:

- hidden transitions still exist in the orchestrator
- non-running state changes bypass the journal
- router behavior depends on process-local state
- the workflow cannot recover after restart
- projections still carry shadow authority

Custom routers require:

- explicit signals
- explicit decisions
- explicit commands
- explicit settlements
- deterministic replay
- stable persistence

So each next pass should be judged by one question:

does this change move more workflow authority into the journal and out of hidden runtime behavior?

If not, it is probably the wrong pass.

## Remaining Work Categories

## 1. Dedicated Ingress For Non-Running Tracker State Changes

We need one explicit path that can observe workflow-backed issue state changes even when no run is
currently active.

The first target is GitHub review requeue.

Why that path first:

- it already mutates tracker state outside the router
- it is a real product workflow, not a synthetic test path
- it exposes the exact observability gap we want to close
- it is a good proving ground for command settlement behavior outside active runs

The ingress should:

- load or resume the workflow
- emit a `tracker.state_observed` signal
- persist the router decision
- execute supported commands explicitly
- settle those commands back into history

## 2. Route Remaining State-Changing Surfaces Through Workflow History

The following surfaces still need to move fully under router authority:

- delivery handoff to `In Review`
- merge-result transitions
- cancel and stop semantics
- startup-failure / paused / blocked / failed edges that still have nearby direct tracker writes
- non-running approval and rework observations

The bar here is not "the state ended up correct."

The bar is:

- the router decided it
- the journal explains it
- the side effects were settled through workflow history

## 3. Remove Duplicated Routing Truth

Once the routed path is proven, we should delete the remaining legacy routing authority.

That means:

- no old refresh-trigger path if the router command already requested dispatch
- no old direct tracker mutation path if a routed command already performed it
- no legacy projection that runtime readers still treat as authoritative

This should be handled as hard cuts, not permanent compatibility layers.

## 4. Tighten Routing Contracts

The next tightening pass should review:

- repository-scoped workflow lookup
- standardized router signal id generation
- strict unsupported-command failures
- command-settlement reuse across ingress adapters
- current-flow router naming/versioning as an intentional preset contract

These are not polish items. They are the difference between internal infrastructure and a stable
platform surface.

## 5. Add Difficult Recovery Tests

Unit tests are the first wave, but recovery is the real proof.

We should have tests that prove:

- workflow history survives restart
- snapshot plus tail replay reconstructs the same projection
- later signals do not duplicate commands
- repeated observations do not corrupt the workflow
- routed transitions remain deterministic after hydration

Once the shape is stable, we should push harder with more demanding tests:

- restart and recovery flows
- repeated external observations
- random or fuzz-like signal sequences against the current-flow router
- comparison tests across router variants

The point is not novelty. The point is confidence that the state machine is durable and hard to
break.

## Next Implementation Priority

The next code slice should be:

1. add a dedicated tracker-state observation ingress for non-running workflow changes
2. use GitHub review requeue as the first live caller
3. let the router own the emitted transition and dispatch commands for that path
4. remove the old duplicate refresh authority for that same path
5. verify with positive and negative tests

That is the right next move because it:

- increases workflow observability immediately
- removes a real legacy routing seam
- exercises command execution outside active runs
- moves the router closer to full lifecycle authority

## Non-Goals For This Pass

The next pass should not:

- rewrite the whole orchestrator
- expose arbitrary user-defined routing strategies yet
- add more shadow projections
- preserve old routing paths out of caution
- widen command kinds without a concrete need

The correct direction is still:

- explicit flows
- one authority
- fewer hidden behaviors
- stronger tests

## Decision Summary

The working decisions are:

- Symphony should treat workflow routing as a first-class event engine.
- Non-running tracker state changes need explicit router ingress.
- Legacy routing authority should be removed, not preserved.
- Read models and snapshots remain useful but non-authoritative.
- The path to custom state machines runs through stricter router authority, not through looser
  abstractions.

That is the lens for the next implementation passes.
