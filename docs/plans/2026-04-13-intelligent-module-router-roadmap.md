# Intelligent Module Router Roadmap

Date: 2026-04-13

Status: Draft

Audience:

- Symphony maintainers
- Symphony control-plane implementers
- Symphony UI/read-model implementers
- Future contributors trying to understand why the current-flow model is being demoted

Related documents:

- [`docs/plans/2026-04-13-router-hardening-and-e2e-stabilization-plan.md`](2026-04-13-router-hardening-and-e2e-stabilization-plan.md)
- [`docs/plans/2026-04-12-capability-router-implementation-roadmap.md`](2026-04-12-capability-router-implementation-roadmap.md)
- [`docs/architecture/2026-04-09-workflow-router-architecture.md`](../architecture/2026-04-09-workflow-router-architecture.md)
- [`docs/architecture/2026-04-10-router-authority-and-ingress.md`](../architecture/2026-04-10-router-authority-and-ingress.md)
- [`docs/architecture/2026-04-11-lifecycle-authority-matrix.md`](../architecture/2026-04-11-lifecycle-authority-matrix.md)
- [`docs/adr/2026-04-08-run-mode-and-issue-state-contract.md`](../adr/2026-04-08-run-mode-and-issue-state-contract.md)
- [`docs/adr/2026-04-08-runtime-result-command-contract.md`](../adr/2026-04-08-runtime-result-command-contract.md)

## Purpose

This document defines the next major direction for Symphony's router program.

The prior stabilization plan established that:

- the router concept is correct
- durable workflow history is the right control-plane substrate
- capability-managed execution is the right direction
- the current implementation sequence introduced overlap and ambiguity

This document goes one step further.

It proposes a sharper product and implementation target:

- reduce the coarse workflow state machine to a thin lifecycle shell
- promote module routing to the primary execution model
- add an intelligent routing preset that allows an LLM to choose the next admissible module
- record each module attempt as a readable run narrative
- reshape the UI and test strategy around module execution rather than legacy pipeline steps

This is intentionally not a minimal note.

It is a working roadmap intended to support implementation slice by slice.

## Executive Summary

The current system has an architectural split:

- the top-level `current-flow` router owns lifecycle state
- the capability planner owns the next bounded step within implementation or rework

That split is technically coherent enough to function.

It is not product-coherent enough to explain cleanly.

The result is:

- the backend has two different routing vocabularies
- the UI has to explain both at once
- the tests risk hardening the wrong mental model
- the system feels more procedural than intelligent even though the long-term goal is a router that chooses the next best step

The right next move is not to delete the current-flow router immediately.

The right next move is to demote it.

We should introduce a new `intelligent-flow` preset whose purpose is:

- keep a minimal deterministic lifecycle shell for claiming, active execution, waiting, blocking, pausing, failure, and completion
- treat execution modules as the primary unit of work
- allow the router to compute admissible next modules
- allow an LLM to choose among those admissible modules with persisted rationale
- record each chosen module attempt as a run narrative
- drive the UI and tests from that module-centric story

The central thesis of this document is:

- lifecycle should be thin
- modules should be explicit
- admissibility should be deterministic
- selection can be intelligent
- execution should be bounded
- each module attempt should read like a run
- the UI should show the current module and the router's reasoning plainly

## Why This Exists

The current implementation did not fail because the router idea was wrong.

It became hard to reason about because we effectively built two orchestration layers:

- a coarse issue lifecycle router
- a finer capability planner

We can continue down that path and keep explaining the distinction forever.

Or we can acknowledge that the finer layer is closer to the real product.

This roadmap chooses the second path.

It exists to answer:

- what we should keep from the current-flow system
- what we should demote
- what the intelligent module router should actually be
- how much freedom the LLM should have
- how to persist and replay router decisions
- how to structure the next E2E suite
- how to converge the UI onto a more legible model
- how to sequence implementation so we can cut code instead of layering more compensating logic

## Current State Assessment

We should be precise about what the code does today.

### What Exists Today

At the top level, Symphony defaults to the `current-flow` preset.

That router:

- is deterministic
- owns coarse states like `idle`, `bootstrapping`, `implementation`, `review`, `approved_merge`, `blocked`, `paused`, `failed`, and `done`
- reacts to route signals and emits route commands

Inside implementation and rework, Symphony now also has capability planning.

That planner:

- is deterministic today
- reads the persisted execution contract
- resolves the preset policy plus ticket directives
- computes admissible capability candidates
- picks the next one using a deterministic route strategy

The runtime currently treats implementation or rework as capability-managed if a persisted execution contract exists for the workflow.

That means the current product is already halfway toward a module-router system.

### What Is Good About This

- durable history exists
- the system can be replayed
- execution contracts exist
- clarification loops exist
- blocked and failure outcomes exist
- run continuation no longer relies entirely on explicit `finish`

### What Is Bad About This

- top-level lifecycle still carries too much product meaning
- module execution is hidden inside implementation or rework instead of being the primary story
- the UI has to explain lifecycle state, capability planning state, runs, and route decisions all at once
- the system still reads as if implementation is the module and code review is a post-step, rather than both being first-class modules chosen by the router
- the current naming still implies an older pipeline mindset

### The Real Product Tension

What users want to know is usually:

- what is the system doing right now
- why did it choose that
- what happened in the last step
- what does it need from me
- what will it likely do next

The current-flow model answers:

- what lifecycle bucket is the ticket in

The capability model answers:

- what bounded work unit is next

The second answer is more valuable to operators.

That is why the center of gravity should shift.

## Core Position

We should keep a workflow shell.

We should stop making that shell do product storytelling.

The product story should become:

- the issue is active
- the router selected module `X`
- module `X` is running as run `R`
- here is the reason it was selected
- here are the logs
- here is the outcome
- here is the next admissible set

That implies several principles.

## Guiding Principles

### Principle 1

The lifecycle shell should be small.

### Principle 2

Modules should be the primary execution unit.

### Principle 3

The LLM should not have unconstrained routing authority.

### Principle 4

Admissibility should remain deterministic and testable.

### Principle 5

Selection among admissible modules can be intelligent.

### Principle 6

Each module attempt should be recorded as a run narrative.

### Principle 7

The UI should show the current module and router reasoning before anything more sophisticated.

### Principle 8

We should migrate by adding a new preset, not by mutating the current one into ambiguity.

## Terminology

This roadmap introduces a stricter vocabulary.

### Lifecycle Shell

The minimal workflow authority that tracks whether an issue is:

- queued
- claimed
- active
- awaiting input
- blocked
- paused
- failed
- done

### Module

A bounded unit of work the router can ask the runtime to execute.

Examples:

- `implement.spec`
- `critic.code_review`
- `critic.browser_test`
- `critic.adversarial_tests`
- `clarification.request`
- `blocked.report`
- `merge.execute`

### Admissible Module

A module that is allowed as the next step given:

- the ticket contract
- the module registry
- current workflow projection
- prior evidence
- pending clarification
- blocked state
- runtime support

### Router Decision

A persisted selection of one admissible module, plus the reason it was selected.

### Module Attempt

A single execution of one selected module for one work epoch.

### Run Narrative

The persisted story of a module attempt, including:

- prompt context
- execution logs
- observations
- outcome
- evidence produced
- failure or clarification details

## Target Architecture

The target architecture has four layers.

### Layer 1: Lifecycle Shell

The lifecycle shell is still durable and authoritative.

It owns:

- queue claiming
- active run ownership
- pause
- block
- fail
- completion

It does not own rich work semantics like:

- implementation versus review as a top-level product identity
- whether browser verification should happen next
- whether a clarification request should retry the same module or move to another one

Those semantics belong lower.

### Layer 2: Module Routing

The module router owns:

- module admissibility
- module candidate generation
- LLM-assisted selection among admissible candidates
- retry rules
- evidence progression
- clarification and blocked semantics at the execution level

### Layer 3: Module Execution

The runtime owns:

- running the selected module
- collecting logs
- collecting runtime observations
- recording the module attempt narrative
- returning a structured outcome

### Layer 4: Read Models

The read model owns:

- current lifecycle shell state
- current module state
- latest router decision
- active module run
- recent module runs
- pending clarification
- blocked reason
- evidence progression

The read model should not invent lifecycle meaning.

## Recommended Thin Lifecycle Shell

The current-flow router currently exposes many top-level states.

The intelligent-flow preset should use a reduced shell.

### Proposed Shell States

- `queued`
- `claimed`
- `active`
- `awaiting_input`
- `blocked`
- `paused`
- `failed`
- `done`

### Mapping To Existing Tracker States

We may still need to map to Linear states that already exist.

That mapping should be treated as an integration concern, not the primary product model.

Likely mapping:

- `queued` -> `Todo`
- `claimed` -> `Bootstrapping`
- `active` -> `In Progress`
- `awaiting_input` -> `Paused` or a dedicated future state if we add one
- `blocked` -> `Blocked`
- `paused` -> `Paused`
- `failed` -> `Failed`
- `done` -> `Done`

### What This Removes

The shell no longer needs top-level nodes for:

- `implementation`
- `rework`
- `review`
- `approved_merge`

Those become module concerns or terminalization concerns.

### Why This Is Better

It separates:

- lifecycle authority
- execution semantics

That is the exact cut the system currently lacks.

## Intelligent Module Router

The intelligent module router should be introduced as a new preset:

- `intelligent-flow`

Possible alternate names:

- `auto-flow`
- `module-flow`
- `adaptive-flow`

Recommendation:

- use `intelligent-flow`

Reason:

- it is descriptive without sounding magical
- it distinguishes this preset from both `current-flow` and `auto-merge`
- it leaves room for future variants like `intelligent-flow-strict`

## What The LLM Should Choose

The LLM should choose:

- one next admissible module from a bounded candidate set

The LLM should not choose:

- arbitrary raw lifecycle states
- tracker state transitions directly
- command settlement behavior
- impossible modules
- unsupported runtime features

This is the key guardrail.

### Deterministic Responsibilities

The deterministic layer must still own:

- admissibility filtering
- impossible-state rejection
- disabled module filtering
- evidence prerequisite enforcement
- clarification gate enforcement
- max retry enforcement
- terminal-state legality

### Intelligent Responsibilities

The LLM can own:

- choosing the best next module among admissible options
- prioritizing deeper verification when several are admissible
- preferring clarification over speculative execution when ambiguity is high
- choosing when to escalate from implementation to verifier modules when policy allows more than one path

### Why This Split Matters

If the LLM chooses from unconstrained state labels, we get brittle and hard-to-debug behavior.

If the LLM chooses from a constrained candidate set, we get:

- explainability
- replayability
- good negative testing
- graceful fallback

## Module Registry

The module registry becomes the real catalog of router behavior.

Each module definition should contain at least:

- `id`
- `phase`
- `summary`
- `description`
- `enabledByDefault`
- `executionKind`
- `supportedModelProfileIds`
- `producesEvidenceIds`
- `requiresEvidenceIds`
- `requiresNoPendingClarification`
- `canRunWhenBlocked`
- `retryPolicy`
- `outcomeSchema`
- `uiLabel`

### Example Modules

Initial target modules:

- `implement.spec`
- `critic.code_review`
- `critic.adversarial_tests`
- `critic.browser_test`
- `merge.execute`
- `clarification.request`
- `blocked.report`

Potential future modules:

- `critic.contract_validation`
- `critic.repo_policy`
- `critic.smoke_test`
- `operator.wait_for_input`
- `merge.reconcile`

### Important Constraint

Do not create module definitions that merely mirror legacy states.

For example:

- `review` should not exist as a module if it is only an alias for `critic.code_review`

One concept should have one meaning.

## Module Outcomes

Every module should return one of a small set of structured outcomes.

Recommended baseline outcomes:

- `completed`
- `changes_requested`
- `clarification_requested`
- `blocked`
- `failed`
- `paused`

For merge-oriented modules:

- `merged`
- `merge_blocked`

### Why Outcome Shape Matters

The router should not parse free-form text to determine what happened.

Module outcomes must be typed enough to support:

- deterministic replay
- exact read-model projection
- clear UI rendering
- robust E2E assertions

## Router Decision Contract

A router decision should be persisted as a first-class record.

It should include:

- `decisionId`
- `workflowId`
- `policyId`
- `recordedAt`
- `candidateSet`
- `selectedModuleId`
- `selectionMode`
- `selectionSummary`
- `selectionRationale`
- `fallbackReason` when deterministic fallback is used
- `inputProjectionHash` or equivalent state fingerprint

### Selection Modes

Recommended values:

- `deterministic`
- `llm_selected`
- `fallback_default`
- `reused_cached_decision`

### Why Persist The Candidate Set

This matters for observability.

Operators should be able to see:

- what could have been chosen
- what was chosen
- why

Without that, an intelligent router feels arbitrary.

## Admissibility Contract

Admissibility should be deterministic and enforced before the LLM sees choices.

### Inputs To Admissibility

- workflow projection
- execution contract
- routing policy
- module registry
- available model profiles
- runtime capability support
- evidence already produced
- blocked state
- clarification state
- retry counters

### Admissibility Rules

At minimum:

- do not emit modules that are disabled
- do not emit modules forbidden by policy
- do not emit modules requiring unsupported evidence prerequisites
- do not emit modules while pending clarification blocks forward progress
- do not emit modules beyond max retry count
- do not emit modules unsupported by the runtime substrate
- do not emit merge modules before completion gates are satisfied

### Output

The admissibility engine should produce:

- ordered admissible candidates
- rejection reasons for non-admissible modules when needed for observability

### Why Rejection Reasons Matter

They are useful for:

- UI explanation
- debugging why a module never appears
- future operator tools

## Intelligent Selection Prompt

The LLM selection prompt should be narrow and structured.

It should not say:

- "Choose anything that seems best."

It should say:

- here is the ticket objective
- here is the done definition
- here is the current workflow summary
- here is the current evidence state
- here is the pending clarification state if any
- here are the admissible modules
- choose exactly one admissible module
- provide a short rationale
- return structured JSON

### Required Output

At minimum:

- `selectedModuleId`
- `reason`
- `confidence`
- `deferToDeterministicFallback` false by default

### Hard Validation

If the model returns:

- a non-admissible module
- invalid JSON
- a missing reason

then the system should:

- reject the response
- record the failure
- use deterministic fallback

The router must remain reliable when the selection model is wrong.

## Deterministic Fallback

The intelligent-flow preset must have a deterministic fallback path.

Fallback should choose:

- the first admissible candidate by stable rank

This keeps the system operational when:

- provider calls fail
- selection output is malformed
- the selection model is unavailable

### Why This Is Required

The intelligent layer should improve routing quality.

It should not become a new availability dependency for the core workflow shell.

## Module Attempts As Runs

This is the most important product-facing change in the roadmap.

Each module attempt should be recorded as a run narrative.

### Why

Users and operators understand:

- "the system ran implementation"
- "then it ran browser verification"
- "then it got blocked"

They do not naturally understand:

- "the issue stayed in implementation while an internal capability sub-attempt completed and advanced the planner"

The first model is legible.

The second is technically accurate but product-hostile.

### Recommended Rule

Every selected module execution creates:

- one run record
- one main narrative
- one terminal outcome

Retries create new attempts under the same module lineage.

### Important Non-Goal

Do not let run narratives become the lifecycle authority.

The workflow shell still owns authoritative lifecycle state.

## Read Model Strategy

The read model should be rewritten around the module story.

### Required Read Model Fields

- lifecycle shell state
- current workflow id
- current router preset
- current module selection
- current module run status
- latest router decision summary
- latest router rationale
- pending clarification
- blocked reason
- recent module runs
- evidence progression summary
- latest failure or pause explanation

### Optional But Valuable Fields

- rejected candidate summaries
- retry counters by module
- last deterministic fallback reason
- module-level token and machine usage summaries

### Read Model Must Not Do

- infer hidden lifecycle transitions
- invent module intent from raw logs
- flatten multiple module attempts into one unreadable blob
- assume that old current-flow states remain the primary story

## UI Direction

The UI needs to get simpler, not more decorative.

### Main Page Questions

The primary issue page should answer:

- what is the issue lifecycle status
- what module is active now
- why did the router choose it
- what happened last
- what does the system need next

### Recommended Components

- lifecycle shell card
- current module card
- router decision card
- recent module runs list
- clarification / blocked input card
- logs panel scoped to a selected module run

### Explicitly Avoid

- giant unified observability surfaces
- mixed workflow and run logs in one unreadable pane
- charts before the module narrative is legible
- novelty UI that obscures the sequencing

### UI Mental Model

The UI should read like:

1. the issue is active
2. the router chose `critic.code_review`
3. here is why
4. here is the run
5. here was the outcome
6. next likely modules are `merge.execute` or `critic.browser_test`

## Test Strategy

The intelligent-flow preset must be developed test-first.

### Test Layers

We need four layers.

#### Layer 1: Module Registry Unit Tests

Prove:

- modules validate correctly
- disabled modules are excluded
- evidence prerequisites work
- retry gating works

#### Layer 2: Admissibility Tests

Prove:

- candidate sets are correct for a given projection
- clarification blocks forward work
- blocked state prevents inadmissible execution
- browser-test module is only admissible when enabled and supported

#### Layer 3: Intelligent Selection Tests

Prove:

- valid LLM output is accepted
- invalid output falls back deterministically
- persisted rationale is recorded
- candidate set and selected module remain coherent

#### Layer 4: Golden Path `.e2e.test.ts`

These are the real product tests.

They should describe module-routing stories, not legacy pipeline stories.

## Initial Golden Path Matrix

The first intelligent-flow golden paths should be:

1. simple implementation path
2. implementation then code review
3. implementation then browser verification
4. clarification request and resume
5. blocked after implementation
6. deterministic fallback after invalid selection output
7. completion-ready then done

### Golden Path 1: Simple Implementation Path

Scenario:

- ticket contract requires only implementation evidence
- admissible set contains `implement.spec`
- router selects `implement.spec`
- module completes
- completion gate opens
- issue reaches `done`

### Golden Path 2: Implementation Then Code Review

Scenario:

- ticket contract requires implementation and code-review evidence
- router selects `implement.spec`
- module completes
- admissible set now contains `critic.code_review`
- router selects `critic.code_review`
- module completes
- completion gate opens

### Golden Path 3: Implementation Then Browser Verification

Scenario:

- browser-test module is enabled in the test preset
- contract requires browser evidence
- router selects `implement.spec`
- router later selects `critic.browser_test`
- both produce evidence
- completion gate opens

### Golden Path 4: Clarification Request And Resume

Scenario:

- router selects `implement.spec`
- module requests clarification
- lifecycle shell enters `awaiting_input`
- clarification answer is recorded
- same module becomes admissible again
- router reselects `implement.spec`

### Golden Path 5: Blocked After Implementation

Scenario:

- implementation runs
- outcome is `blocked`
- lifecycle shell enters `blocked`
- no forward module is emitted

### Golden Path 6: Invalid Selection Output Fallback

Scenario:

- admissible set contains `implement.spec` and `critic.code_review`
- selection model returns invalid JSON or a forbidden module
- deterministic fallback selects the stable top-ranked module
- fallback reason is persisted

### Golden Path 7: Completion Ready Then Done

Scenario:

- all required evidence is present
- no pending clarification
- no blocked reason
- completion gate opens
- lifecycle shell transitions to `done`

## What We Should Stop Testing As Primary Value

We should stop treating these as the main product stories:

- `review -> rework -> bootstrapping` as the central golden path
- `approved_merge` as the primary expression of router intelligence
- legacy `finish` behavior as the main implementation completion story

These still matter.

They should not define the direction of the new system.

## Data Model Adjustments

This roadmap does not necessarily require a brand-new authority store.

It does require stronger modeling.

### Likely Additions

- persisted intelligent router decision details
- module run summaries in the read model
- candidate-set snapshots for observability
- explicit module-attempt lineage ids

### Likely Reuse

- route workflow history
- execution contracts
- planner decisions
- runtime run store

### Important Constraint

Do not create a parallel state authority just to make the intelligent-flow preset easier to prototype.

The route workflow remains the control-plane authority.

## Migration Strategy

We should migrate by addition and then deletion.

### Step A

Keep `current-flow` intact as the stable fallback preset.

### Step B

Add `intelligent-flow` in parallel.

### Step C

Build tests and read-model support for `intelligent-flow`.

### Step D

Run tickets against `intelligent-flow` deliberately.

### Step E

Once stable, cut overlapping current-flow-specific UI assumptions and old completion assumptions.

### Step F

Only after that should we decide whether `current-flow` gets:

- fully deleted
- retained as compatibility mode
- reduced to a testing/reference preset

## What Stays Deterministic

This should be explicit.

The following should remain deterministic even in intelligent-flow:

- queue claiming
- issue identity binding
- admissibility filtering
- clarification gate enforcement
- blocked-state enforcement
- completion gate enforcement
- tracker terminal state mapping
- merge legality
- fallback routing

## What Becomes Intelligent

Also explicit.

The following can become intelligent:

- selecting among admissible modules
- preferring deeper verification when optional
- preferring clarification when ambiguity is high
- choosing between multiple safe verification paths
- choosing whether to continue implementation versus verify, when both are admissible by contract and policy

## What Must Never Become Intelligent

- inventing new module ids
- skipping required evidence
- ignoring blocked or clarification gates
- forcing tracker state transitions directly
- choosing modules disabled by runtime support

## Open Questions

These questions should be answered during implementation, not ignored.

### Question 1

Should `rework` exist at all in intelligent-flow as a first-class concept, or is it just a new implementation epoch after verifier findings?

Recommendation:

- treat rework as a new implementation epoch, not a separate top-level shell state

### Question 2

Should browser verification remain disabled until the substrate is truly ready?

Recommendation:

- yes in production presets
- no in test-only presets so the module path can be proven now

### Question 3

Should clarification be a module or an execution outcome?

Recommendation:

- keep it as an execution outcome
- represent waiting in the lifecycle shell

### Question 4

Should completion be selected by the LLM?

Recommendation:

- no
- completion should remain gate-driven and deterministic

### Question 5

Should module runs reuse the existing run store or create a new table?

Recommendation:

- reuse the existing run store if it can cleanly represent module-attempt runs
- avoid a new narrative authority

## Risks

### Risk 1

We build intelligent-flow but keep the old UI mental model.

Result:

- operators remain confused

### Risk 2

We let the LLM choose from an unconstrained set.

Result:

- non-replayable chaos

### Risk 3

We keep too many current-flow-specific abstractions alive.

Result:

- permanent dual-model complexity

### Risk 4

We build the intelligent preset without the golden-path tests first.

Result:

- live tickets become the integration harness again

## Deletion Targets

Once intelligent-flow stabilizes, likely deletion candidates include:

- UI assumptions that top-level lifecycle nodes are the main story
- prompt text that universally treats `finish` as the implementation boundary
- helper logic that duplicates module selection semantics outside the router
- compensating read-model glue that exists only because current-flow and capability planning overlap awkwardly

## Implementation Slices

This roadmap should be executed in explicit slices.

### Slice 1: Freeze The Target Model

Deliverables:

- ADR or contract note for intelligent-flow
- lifecycle shell definition
- module registry contract
- admissibility contract

Tests:

- type-level and schema-level validation

### Slice 2: Add The Intelligent Preset Skeleton

Deliverables:

- `intelligent-flow` preset registration
- thin lifecycle shell router
- no LLM routing yet

Tests:

- preset loads
- queue claim and active lifecycle shell transitions work

### Slice 3: Module Registry Refactor

Deliverables:

- explicit module definitions
- evidence prerequisites
- runtime support flags

Tests:

- registry validation
- disabled-module exclusion

### Slice 4: Admissibility Engine

Deliverables:

- admissible candidate computation
- rejection reason support

Tests:

- candidate matrices for implementation, verification, clarification, blocked, completion-ready

### Slice 5: Deterministic Intelligent-Flow Baseline

Deliverables:

- intelligent-flow uses admissibility but still selects deterministically

Tests:

- first module selected correctly
- verifier modules selected when required

### Slice 6: Persisted Router Decision Model

Deliverables:

- decision records with candidate sets and rationale fields

Tests:

- decision persistence
- replay

### Slice 7: LLM Selection Integration

Deliverables:

- structured selection prompt
- validation
- fallback

Tests:

- valid selection accepted
- invalid selection rejected and fallback used

### Slice 8: Module Attempts As Runs

Deliverables:

- module execution creates run narratives
- run lineage support

Tests:

- implementation run narrative
- verifier run narrative
- retry run narrative

### Slice 9: Golden Path `.e2e.test.ts` Suite

Deliverables:

- first seven intelligent-flow golden paths

Tests:

- all seven scenarios green

### Slice 10: Read Model Rewrite

Deliverables:

- issue-level module observability endpoint
- candidate-set and rationale fields
- current module and recent module runs

Tests:

- API contract tests
- read-model projection tests

### Slice 11: UI Simplification

Deliverables:

- current module card
- router decision card
- recent module runs
- per-run logs

Tests:

- component tests
- simple rendering tests

### Slice 12: Cutover Review

Deliverables:

- document what current-flow still owns
- identify deletion list
- choose whether to keep or retire current-flow

Tests:

- regression pass across active presets

## Recommended Immediate Next Step

The first implementation slice after this document should be:

- freeze the intelligent-flow contract
- register the `intelligent-flow` preset
- implement the thin lifecycle shell without LLM selection yet
- add the first deterministic intelligent-flow golden path

Why this first:

- it forces the architecture cut before runtime complexity grows further
- it lets us prove the new lifecycle shell without yet involving model selection variability
- it creates the foundation for the later intelligent selector

## Recommended File And Test Direction

Likely new files or areas:

- `packages/router/src/symphony-intelligent-flow-router.ts`
- `packages/router/src/intelligent-module-admissibility.ts`
- `packages/router/src/intelligent-module-selector.ts`
- `apps/api/src/core/symphony-intelligent-routing.ts`
- `apps/api/src/core/symphony-intelligent-flow.e2e.test.ts`
- `apps/api/src/core/symphony-intelligent-selection.e2e.test.ts`

Likely follow-up UI/read-model files:

- issue workflow observability read-model modules
- issue detail cards focused on current module and router decision

## Success Criteria

We should consider this roadmap successful when:

- `intelligent-flow` exists as a real preset
- lifecycle shell states are reduced and coherent
- admissibility is deterministic and fully test-covered
- module selection is persisted and explainable
- each module attempt is visible as a run
- the UI can answer what module is active and why
- golden-path module-routing tests are the main validation harness
- we can clearly say what current-flow is still for

## Final Position

The right response to the current complexity is not to add more decoration or more compatibility logic.

The right response is to clarify the product model.

That product model should be:

- a thin lifecycle shell
- an intelligent router choosing among admissible modules
- bounded module execution
- one readable run narrative per module attempt
- a UI that explains the current module and the router's reason in plain terms

That is the direction this roadmap recommends.

It is a larger change than another incremental patch.

It is also the clearest way to converge on the product you are describing.
