# Router Product Roadmap

## Purpose

This document captures the near-term and medium-term roadmap for the product
we are building around the workflow router.

The goal is not merely to finish a routing package.
The goal is to make Symphony into a control plane for autonomous software
development where:

- lifecycle state is explicit
- routing decisions are durable
- different development styles can be compared
- the system can be hardened against adversarial pressure
- the product can eventually be used by connecting a repository, Linear, and
  GitHub rather than by hardcoding application logic into `apps/api`

This roadmap is intentionally broken into three phases:

1. finish the router
2. clean and harden the application around the router
3. reach the product state where the user connects Linear and GitHub and gains
   access to the platform

The order matters.
We should not optimize for broad customization or a marketplace before the
first two flows are durable, observable, and adversarially tested.

## Product Thesis

The router is the control-plane core of the product.

Before the router buildout, Symphony is primarily an orchestration
application with one dominant lifecycle encoded into the host app.
After the router buildout and cleanup, Symphony becomes a workflow host:

- tickets enter the system
- a router preset defines the lifecycle
- workflow history becomes the authority
- runtime, tracker, review, and merge operations become effects of routing
- different development styles can be run, measured, and compared

The router is therefore not the entire product.
It is the kernel the rest of the product must orbit around.

## Phase 1: Finish The Router

### Goal

Complete the router as a durable, restart-safe, preset-aware control-plane
core.

This phase ends when the system can run at least two flows through the same
host seam and resume them deterministically from persisted state.

### What Already Exists

The current foundation is already strong:

- workflow router definitions, sessions, projection, and rehydration exist
  in `packages/router`
- workflow history, decisions, and snapshots are persisted in `packages/db`
- the API already uses route workflows as lifecycle authority
- the orchestrator and runtime already consume one cohesive
  `workflowRoutingAdapter`
- `current-flow` already exists as a real routed lifecycle

What is still missing is productized preset identity and productized preset
ingestion.

### Scope

This phase should focus on the following slices.

#### 1. Preset Registry And Selection

Introduce an explicit preset registry and explicit preset selection rather than
constructing `current-flow` directly inside the host.

This gives the system one place to answer:

- which presets exist
- how a preset is selected
- how unknown preset ids fail fast

#### 2. Persist `routerPresetId`

Persist preset identity on route workflows in addition to `routerName` and
`routerVersion`.

We should treat:

- `routerPresetId` as control-plane identity
- `routerName` as graph identity
- `routerVersion` as graph revision identity

This lets resume and compatibility checks use the actual preset/module choice
 instead of inferring it from the router definition alone.

#### 3. Resume By Preset Identity

On rehydration:

1. load the stored workflow row
2. read the stored `routerPresetId`
3. resolve the preset/module from the registry
4. rebuild router and policy
5. assert preset id, router name, and router version all match
6. fail fast if anything does not line up

This is required for deterministic restart behavior.

#### 4. Define The Runtime Preset Module Contract

Define one narrow host-facing preset contract that owns:

- router creation
- policy creation
- tracker contract assertion
- lifecycle binding creation

This is the line where a preset stops being "just a graph" and becomes a real
product module.

#### 5. Move `current-flow` Behind The Preset Module Contract

The first dogfood target should be the current-flow lifecycle.

Today, parts of current-flow lifecycle handling still live directly under
`apps/api/src/core/runtime-*.ts`.
That logic should move behind the preset/module boundary so the host no longer
contains hidden current-flow authority.

#### 6. Build A Second Flow Through The Same Seam

Do not expand the module surface broadly yet.
First prove that a second flow can run through the same host seam.

This second flow does not need to be radically different.
It only needs to prove:

- the preset boundary is real
- the host can load two different lifecycle modules
- replay and comparison across flows is possible

#### 7. Add Replay And Comparison Foundations

Once two flows exist, the next slice is replay and comparison.

We should be able to compare:

- node progression
- emitted commands
- terminal outcome
- command settlement behavior
- convergence behavior across different flows

### Exit Criteria

Phase 1 is complete when all of the following are true:

- `routerPresetId` is persisted and required
- resume uses stored preset identity
- `current-flow` is hosted through a real preset/module seam
- a second preset exists through the same seam
- the host app no longer contains hidden one-off lifecycle truth for
  `current-flow`
- route histories are sufficient to replay and explain decisions

### Non-Goals

Phase 1 should explicitly avoid:

- user-authored marketplace flows
- broad UI work for preset creation
- arbitrary graph ingestion without runtime bindings
- broad plugin architecture for external authors

The goal is not ecosystem breadth.
The goal is one strong host and two strong internal flows.

## Phase 2: Clean And Harden The Product

### Goal

Once the router is complete enough to host two flows, the next step is not
feature expansion.
The next step is product cleanup and adversarial hardening.

This phase is where we make the rest of the codebase submit to the router as
the source of lifecycle truth.

### Core Principle

Treat this as product hardening, not incremental polish.

We want:

- fewer hidden authorities
- fewer compatibility shims
- fewer optional fields
- stronger fail-fast contracts
- stronger restart and replay guarantees

### Scope

#### 1. Delete Legacy Lifecycle Authority

Make workflow history the only lifecycle authority.

That means removing:

- lingering direct lifecycle writes that bypass workflow history
- stale projections or timeline writes that still carry routing truth
- old app-level lifecycle assumptions outside the preset/module boundary

This is the hard-cut bucket.

#### 2. Consolidate Ownership Around Preset Modules

After Phase 1, each flow should have one obvious ownership boundary.

Cleanup means:

- reduce current-flow-specific imports in the host app
- move lifecycle binding code behind the preset/module boundary
- make file ownership explicit
- keep the host small and product-shaped

#### 3. Tighten Contracts Aggressively

This phase should apply the same strictness ideology that has been driving the
router work:

- require ids and timestamps
- keep optional fields rare and justified
- use strict parsing where ingress needs it
- fail fast on unsupported commands or malformed state
- push strictness upstream rather than normalizing bad data downstream

This is also where broader package sweeps align with the product:

- `packages/router`
- `packages/db`
- `apps/api`
- `packages/orchestrator`
- `packages/tracker`
- `packages/runtime-contract`

#### 4. Simplify The Public Surfaces

The system should feel smaller after cleanup, not larger.

That means:

- collapse temporary adapter seams
- remove duplicated helper layers
- standardize naming around preset, workflow, signal, command, settlement, and
  replay
- keep host integration obvious

#### 5. Run Adversarial Development Against The Product

This is the most important hardening step.
It comes before broader module expansion.

The product should be attacked through tests and replay scenarios, not just
happy-path coverage.

We should explicitly try to break:

- restart and resume
- duplicate signal ingestion
- duplicate command settlement
- mismatched preset identity or router version
- out-of-order tracker observations
- invalid terminal transitions
- false approvals
- merge without sufficient evidence
- non-converging rework loops
- flows that appear done while control-plane state is inconsistent

#### 6. Strengthen Determinism Proof

We should expect the same history to rehydrate to the same projection and the
same signal sequence to produce the same routing behavior.

This means adding:

- replay tests
- restart tests
- preset mismatch tests
- route comparison tests
- negative tests for malformed or missing state

### Exit Criteria

Phase 2 is complete when:

- workflow history is the only lifecycle authority
- the host app is preset/module-driven instead of flow-specific
- contracts are strict and fail fast
- restart and replay tests are strong
- the first two flows are adversarially tested
- we trust the platform enough to start running it on real tickets as a
  bounded development system

### Why This Phase Comes Before Broad Module Expansion

Without this phase, specialized modules would just add more surface area and
more hidden state.

With this phase complete, specialized modules become force multipliers because
they plug into a strong, explicit core rather than a soft, app-shaped control
plane.

## Phase 3: Reach The Product State

### Goal

Reach the product state where the user:

1. connects GitHub
2. connects Linear
3. configures repository/runtime credentials
4. chooses a preset
5. creates tickets
6. lets the platform run the workflow

This is the point where Symphony stops feeling like a custom internal app and
starts feeling like a product.

### Desired User Experience

The long-term user experience should feel roughly like this:

- connect Linear
- connect GitHub
- connect repository runtime credentials
- choose a workflow preset
- create or sync tickets
- watch the system route work through the selected lifecycle
- inspect route history, evidence, critics, and terminal outcomes

The important product promise is not "AI writes code."
The promise is:

"connect your repo and ticket system, choose a development flow, and let the
platform execute that flow through a durable, inspectable control plane."

### What The Product Looks Like At This Stage

By this point the stack should be clear:

- a stable control plane owns workflow history, preset identity, and replay
- a host runtime loads one preset/module and executes its effects
- preset modules define lifecycle style
- capability modules add critics, evidence, and enforcement
- evaluation tooling compares outcomes across flows

### Specialized Modules Come After The Core

This is the point where we begin building specialized modules more broadly.

But the order matters.
We should first build:

- the first preset module
- the second preset module
- the core evaluation harness

Only then should we broaden the capability surface.

The first specialized modules should likely be:

- code-review critic
- merge gate
- replay/comparison tool
- test/evidence pressure module

### Product Outcome

At the end of this phase, Symphony should be able to act as a bounded
autonomous development platform:

- tickets enter
- the selected preset defines the flow
- workflow history records every signal, decision, and settlement
- evidence and critics pressure the result
- the system can converge on a terminal state
- the platform can eventually improve itself through its own ticketing system
  within a constrained proof-oriented harness

That is the product state where the platform becomes genuinely valuable.

## Summary Of The Three-Phase Plan

### Phase 1: Finish The Router

Build the durable preset-aware routing core:

- explicit preset registration
- preset persistence
- resume by preset identity
- current-flow as a true preset/module
- second flow through the same seam
- replay/comparison foundations

### Phase 2: Clean And Harden The Product

Make the rest of the application submit to the router:

- delete legacy lifecycle authority
- consolidate ownership around preset modules
- tighten contracts and optionality
- simplify the host surfaces
- run adversarial development against the product
- prove deterministic replay and restart

### Phase 3: Reach The Product State

Ship the platform experience:

- connect Linear
- connect GitHub
- choose a preset
- run tickets through the selected flow
- inspect route history and evidence
- expand into specialized modules only after the first two flows are strong

## Ordering Principle

The most important ordering rule is:

do not optimize for broad customization before the first two flows are durable,
observable, replayable, and adversarially tested.

If we follow that rule:

- the router becomes the real control-plane kernel
- cleanup makes the host trustworthy
- specialization becomes a multiplier instead of a distraction

That is the path from the current system to a product where connecting Linear
and GitHub gives access to a real autonomous software development platform.
