# ADR: Intelligent-Flow Contract

Date: 2026-04-13

Status: Accepted

## Context

Symphony currently has a router-owned workflow lifecycle plus a bounded module-selection layer.

The contract needs to freeze what intelligent-flow means after the implementation-first cleanup.

Before treating the preset as the operational default, we need a frozen contract for:

- the thin lifecycle shell
- intelligent-flow modules
- admissibility snapshots
- router decisions

## Decision

We standardize the intelligent-flow contract in the router package.

This contract freezes the live intelligent-flow model.

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

The contract deliberately does not include:

- `merge.execute`
- an `approved_merge` lifecycle phase
- review-rework lifecycle loops

## Consequences

### Positive

- the active product model is explicit
- runtime and read models can align around one lifecycle shell
- tests can freeze invariants around structured module routing
- merge/rework-era semantics stop leaking into intelligent-flow by default

### Negative

- verifier modules still exist in the contract even though the golden path remains implementation-first
- browser testing remains disabled by default until runtime support is explicit

### Neutral

- the lifecycle shell remains thinner than historical tracker workflows
- this ADR is implemented by the live intelligent-flow preset

## Follow-Up

The next slices should:

1. harden deterministic and LLM-selected module choice against real replay fixtures
2. keep observability centered on module attempts as first-class runs
3. continue deleting legacy current-flow and CLI-era compatibility surface
