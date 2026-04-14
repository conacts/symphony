# ADR: Intelligent-Flow Contract

Date: 2026-04-13

Status: Proposed

## Context

Symphony currently has two overlapping orchestration layers:

- a coarse workflow router that owns issue lifecycle transitions
- a capability planner that chooses bounded work inside implementation and rework

That split is operationally useful but product-coherent only up to a point.

The long-term product target is a router that chooses the next bounded module for the ticket while preserving a durable, replayable control plane.

Before implementing that behavior, we need a frozen contract for:

- the thin lifecycle shell
- intelligent-flow modules
- admissibility snapshots
- router decisions

## Decision

We will introduce a new intelligent-flow contract in the router package.

This contract freezes the target model before runtime integration.

### Lifecycle Shell

The intelligent-flow lifecycle shell is:

- `queued`
- `claimed`
- `active`
- `awaiting_input`
- `blocked`
- `paused`
- `failed`
- `done`

This shell is intentionally thinner than the current-flow router.

It should own control-plane status, not rich work semantics.

### Modules

Modules become the primary execution unit.

Initial module ids frozen by the contract are:

- `implement.spec`
- `critic.code_review`
- `critic.adversarial_tests`
- `critic.browser_test`
- `merge.execute`
- `blocked.report`

Modules are defined with strict fields including:

- phase
- execution kind
- supported model profiles
- produced and required evidence
- allowed lifecycle states
- allowed outcomes

### Admissibility

Admissibility remains deterministic.

The contract includes:

- admissible candidate records
- rejected candidate records
- admissibility snapshots

These records are intended to support:

- stable routing
- replay
- operator observability

### Intelligent Selection

The model will not choose arbitrary workflow states.

It will choose one admissible module from a bounded candidate set.

The selection response contract therefore includes:

- `selectedModuleId`
- `reason`
- `confidence`
- `deferToDeterministicFallback`

### Router Decisions

A router decision is persisted and must include:

- candidate set
- selected module
- selection mode
- rationale
- confidence when LLM-selected
- fallback reason when fallback-default

The selected module must appear in the admissible candidate set.

## Consequences

### Positive

- the target product model is explicit
- later implementation slices can build against strong schemas
- tests can freeze invariants before runtime changes land
- the UI and read model can align around modules instead of legacy states

### Negative

- this adds new contract surface before runtime wiring exists
- there will be a temporary period where intelligent-flow contracts exist without a full preset implementation

### Neutral

- current-flow remains intact for now
- this ADR does not change live routing behavior by itself

## Follow-Up

The next slices should:

1. register an `intelligent-flow` preset skeleton
2. implement deterministic admissibility against this contract
3. add persisted router decisions
4. add LLM-backed selection with deterministic fallback
5. represent module attempts as first-class runs
