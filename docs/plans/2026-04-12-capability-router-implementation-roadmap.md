# Capability Router Implementation Roadmap

Date: 2026-04-12

## Purpose

Define the exact implementation path from Symphony's current workflow router foundation to the
first shippable capability-router system.

This document is intentionally concrete.

The goal is to remove ambiguity before implementation starts.

It should answer:

- what already exists and remains useful
- what the new capability layer is responsible for
- where explicit policy ends and LLM planning begins
- what must be built in what order
- what is explicitly out of scope for the first implementation
- what completion looks like before GitHub and Linear integration work resumes

## Scope

This roadmap covers:

- `packages/router` capability planning contracts
- capability-aware projection and policy resolution
- deterministic capability planning
- capability execution contracts
- Symphony's first capability preset
- API-side ticket contract intake, persistence, and planning integration
- test harnesses and proof suites for the new model

This roadmap does **not** cover:

- hosted GitHub integration
- hosted Linear integration
- browser capability execution
- user-authored marketplace presets
- public multi-tenant product packaging
- replacing the current execution substrate with Workflow DevKit

## Core Thesis

Symphony should keep the current router substrate and add a capability-planning layer above it.

The current router already gives us:

- durable workflow history
- replayable projection
- explicit signals
- explicit commands
- command settlement
- hydration and restart semantics
- preset registration
- lifecycle authority

That work remains foundational.

The new layer should add:

- ticket execution contracts
- routing directives
- policy resolution
- capability registries
- model profile registries
- candidate building
- route strategy selection
- completion gate evaluation

The result is:

- explicit control-plane authority
- strict route shaping
- optional LLM-assisted selection
- replayable and testable planning behavior

## Architecture Decisions Already Locked

These decisions are treated as settled unless a real implementation contradiction appears.

### 1. Durable workflow phases remain coarse

The workflow phase is not the same thing as an executable node.

Initial phase set:

- `queued`
- `implementing`
- `verifying`
- `waiting_input`
- `blocked`
- `complete`

### 2. Capabilities are executable units

Initial capability set:

- `implement.spec`
- `critic.code_review`
- `critic.adversarial_tests`
- `critic.browser_test`

`critic.browser_test` should be registered early but remain stubbed and non-admissible by default.

### 3. Internal phases stay internal

Tickets should not name internal workflow phases directly.

Tickets influence the route by expressing:

- required capabilities
- preferred capabilities
- forbidden capabilities
- required evidence
- merge/completion policy
- clarification policy
- profile constraints

### 4. The LLM does not invent capabilities

The LLM may choose from admissible candidates only.

It does not:

- invent new capability ids
- mutate lifecycle semantics
- bypass hard routing policy

### 5. Completion is not a capability

Completion is a gate evaluation plus a workflow transition.

It is not modeled as executable work.

### 6. Clarification is a structured artifact

Clarification must be a durable, typed request with explicit questions.

It is not just conversational prose in a prompt.

### 7. The capability layer reuses the existing journal

We do not create a second authority or a second event store.

Capability-specific decisions, signals, and artifacts extend the current workflow journal model.

### 8. Adversarial tests are strongly encouraged for backend-oriented work

This should be expressed as policy or intake guidance, not as a hard-coded agent permission model
such as `backend` versus `frontend`.

### 9. Code review precedes adversarial testing

V1 verification sequence is:

1. `critic.code_review`
2. `critic.adversarial_tests`
3. `critic.browser_test` when later enabled

### 10. Browser capability is a later verifier

Browser testing is a verifier capability, not a workflow phase.

## Separation Of Responsibilities

This boundary is critical.

### Explicit flow dictation

Explicit policy owns:

- admissible capabilities
- required evidence
- required capabilities
- forbidden capabilities
- allowed model profiles
- completion policy
- clarification policy
- review strictness
- retry ceilings

This is deterministic and fail-fast.

### LLM planner

The LLM planner owns:

- choosing among admissible candidates
- selecting an allowed model profile
- explaining why one candidate is better than another

The LLM planner does **not** own:

- safety rails
- capability invention
- phase transitions
- completion authority
- policy weakening

This means:

- policy constrains the search space
- the LLM optimizes within the constrained search space

That is the separation we want to preserve.

## Final Product Shape For This Slice

Before external GitHub and Linear wiring resumes, the capability-router feature should provide:

- a strict ticket execution contract
- a routing directive merge model
- a capability registry
- a model profile registry
- a capability-aware projection
- a deterministic capability planner
- one Symphony capability preset
- one API-side path to plan the next capability for a workflow
- one execution command contract
- one result signal vocabulary
- one completion gate
- one top-level proof harness covering restart, replay, planning, and progression

## Required Public Concepts

The implementation should formalize these concepts in code:

- `WorkflowTicketExecutionContract`
- `WorkflowRoutingDirectives`
- `WorkflowResolvedRoutingPolicy`
- `WorkflowCapabilityDefinition`
- `WorkflowModelProfileDefinition`
- `WorkflowCapabilityCandidate`
- `WorkflowCapabilityDecision`
- `WorkflowCapabilityExecutionCommand`
- `WorkflowCapabilityExecutionResult`
- `WorkflowCapabilityProjection`
- `WorkflowCompletionGateEvaluation`
- `WorkflowCapabilityPreset`
- `WorkflowCapabilityPlanner`

## Lifecycle-To-Capability Matrix

This matrix is the clearest mental model for how the first system should behave.

It defines:

- which phase is durable
- which capabilities are admissible in that phase
- which signals are expected to enter that phase
- which outcomes can leave that phase

### `queued`

Purpose:

- the ticket exists
- contract intake is not yet satisfied or planning has not yet begun

Admissible capabilities:

- `implement.spec`

Expected incoming signals:

- ticket contract created
- ticket contract revised
- clarification answered

Exit conditions:

- move to `implementing` when planning emits `implement.spec`
- move to `waiting_input` when intake raises structured clarification
- move to `blocked` when intake or policy fails terminally

### `implementing`

Purpose:

- the current work epoch is being produced or repaired

Admissible capabilities:

- `implement.spec`

Expected incoming signals:

- `capability.started` for `implement.spec`
- `capability.completed` for `implement.spec`
- `capability.changes_requested` from any critic
- retryable implementation failure routed back to implementation
- clarification answered and reevaluated back into implementation

Exit conditions:

- move to `verifying` when `implement.spec` completes and advances the current epoch
- move to `waiting_input` when implementation raises clarification
- move to `blocked` when implementation blocks terminally

### `verifying`

Purpose:

- the current implementation epoch is being challenged

Admissible capabilities:

- `critic.code_review`
- `critic.adversarial_tests`
- `critic.browser_test` later when enabled

Expected incoming signals:

- `capability.completed` for `implement.spec`
- `capability.started` for critic capabilities
- critic completion and failure signals

Exit conditions:

- remain in `verifying` while critics continue to run on the same epoch
- move to `implementing` when any critic emits `changes_requested`
- move to `waiting_input` when a verifier or critic raises clarification
- move to `blocked` when verification blocks terminally
- move to `complete` only through completion-gate evaluation plus explicit completion transition

### `waiting_input`

Purpose:

- the workflow is paused on a durable clarification boundary

Admissible capabilities:

- none

Expected incoming signals:

- `workflow.clarification_requested`
- `workflow.clarification_answered`

Exit conditions:

- reevaluate from current projection when clarification is answered
- do not hardcode resume target into history

### `blocked`

Purpose:

- the workflow cannot make normal progress

Admissible capabilities:

- none by default in V1

Expected incoming signals:

- `capability.blocked`
- explicit unblock or operator intervention in later work

Exit conditions:

- no automatic forward progress
- future unblock path must be explicit

### `complete`

Purpose:

- the workflow has satisfied the completion gate and finalized

Admissible capabilities:

- none

Expected incoming signals:

- explicit completion transition

Exit conditions:

- terminal

## Signal And Command Matrix

This is the minimum V1 execution vocabulary.

### Commands

#### `capability.execute`

Producer:

- capability planner

Consumer:

- execution adapter

Required fields:

- `id`
- `workflowId`
- `capabilityId`
- `modelProfileId`
- `contract`
- `executionInput`
- `dedupeKey`

Invariants:

- planner emits exactly one executable capability command per planning pass
- command payload must be fully serializable
- command id remains globally unique within the workflow journal

Terminal:

- no

### Signals

#### `capability.started`

Producer:

- execution adapter

Consumer:

- workflow journal and capability projection

Required fields:

- `workflowId`
- `executionId`
- `capabilityId`
- `modelProfileId`
- `workEpoch`
- `attempt`
- `summary`

Invariants:

- every execution attempt must emit exactly one `capability.started`

Terminal:

- no

#### `capability.completed`

Producer:

- execution adapter

Consumer:

- capability projection
- completion gate
- planner on replay

Required fields:

- all `capability.started` identity fields
- `evidenceProduced`
- `summary`

Invariants:

- terminal result for one `executionId`
- may produce multiple evidence types from a declared capability definition only
- `implement.spec` completion is the only capability result allowed to advance `workEpoch`

Terminal:

- yes

#### `capability.changes_requested`

Producer:

- critic or verifier execution adapter

Consumer:

- capability projection
- lifecycle transition logic

Required fields:

- all `capability.started` identity fields
- `findings`
- `summary`

Invariants:

- terminal result for one `executionId`
- always invalidates current completion readiness
- always routes back to `implementing`

Terminal:

- yes

#### `capability.failed`

Producer:

- execution adapter

Consumer:

- capability projection
- retry policy logic

Required fields:

- all `capability.started` identity fields
- `retryable`
- `reasonCode`
- `failureKind`
- `summary`

Invariants:

- terminal result for one `executionId`
- retryable failure preserves current epoch
- terminal failure cannot silently complete the workflow

Terminal:

- yes

#### `capability.blocked`

Producer:

- execution adapter

Consumer:

- capability projection
- lifecycle transition logic

Required fields:

- all `capability.started` identity fields
- `reasonCode`
- `summary`

Invariants:

- terminal result for one `executionId`
- pushes the workflow into `blocked`

Terminal:

- yes

#### `workflow.clarification_requested`

Producer:

- intake normalization
- execution adapter

Consumer:

- capability projection
- planner

Required fields:

- `workflowId`
- `requestId`
- `raisedByCapability`
- `workEpoch`
- `summary`
- structured `questions`

Invariants:

- structured questions are required
- clarification becomes durable product state, not transient chat text
- counts as a terminal result for the execution that raised it

Terminal:

- yes for the originating execution

#### `workflow.clarification_answered`

Producer:

- API-side operator or ticket response boundary

Consumer:

- capability projection
- planner

Required fields:

- `workflowId`
- `requestId`
- `answeredAt`
- `answers`

Invariants:

- request id must resolve to an open pending clarification request
- answering does not force a hardcoded next phase

Terminal:

- yes for the clarification wait

#### `workflow.completion_gate_evaluated`

Producer:

- completion gate evaluator

Consumer:

- workflow journal
- operator visibility
- finalization path

Required fields:

- `workflowId`
- `workEpoch`
- `result`
- `satisfiedEvidence`
- `missingEvidence`
- `reasons`

Invariants:

- recorded at completion boundaries
- manual completion still requires a recorded completion-gate evaluation

Terminal:

- no

## Persistence And Authority Sketch

This section exists to prevent future drift between control-plane truth and raw execution artifacts.

### Control-plane authority

These artifacts are authoritative and must be durably persisted in canonical storage:

- workflow history
- capability decisions
- emitted commands
- command settlements
- ticket execution contract
- resolved routing policy snapshots when needed for replay correctness
- clarification requests and answers
- completion-gate evaluations

### Derived projection state

These should remain projection-derived, even if we later snapshot them for read performance:

- current workflow phase
- current work epoch
- capability status by epoch
- completion readiness
- pending clarification
- blocked reason

Snapshots are caches.

History remains authority.

### Raw execution artifacts

These are not control-plane truth:

- screenshots
- browser traces
- raw review comment payloads
- raw prompt transcripts
- raw test output
- log blobs

For V1:

- store canonical summaries and references in control-plane records
- keep raw artifact payloads out-of-band
- do not make artifact storage a blocker for the first implementation

### Persistence boundary recommendation

The first implementation should persist:

- the ticket execution contract as a first-class control-plane artifact
- capability decision records as journal-associated records
- capability result signals in the existing workflow history model
- artifact references, not raw blobs

It should **not** attempt:

- full blob storage design
- screenshot storage plumbing
- external artifact warehouse design

## Entry Strategy And Cutover Stance

This section answers the main implementation question:

should the capability planner replace the live system immediately?

Recommended answer:

- no full replacement on day one

Reason:

- the router substrate we already built is valuable
- the capability layer is new enough that it should prove itself before it becomes the only live
  planner authority
- a staged cutover gives us replay and proof opportunities without discarding the current authority
  model

This is not hesitation for its own sake.

It is risk management.

The capability planner should become the authority for "what executable work runs next," but only
after it has passed through an explicit proving phase.

### Cutover stages

#### Stage A: Capability layer exists in isolation

- package types
- policy resolver
- registries
- projection
- planner
- preset

No live planner authority yet.

#### Stage B: Capability planner runs alongside existing lifecycle authority

- planner can compute the next capability from durable state
- planner decisions are persisted
- execution commands can be emitted in a controlled path
- old lifecycle authority still owns production routing

This stage exists to prove:

- projection correctness
- planning correctness
- restart correctness

#### Stage C: Capability planner owns next-work authority

- the old "what runs next" inference paths are deleted
- planner output becomes the only source of next executable work
- workflow history remains lifecycle authority

#### Stage D: Cleanup and hard cut

- remove shadow planning truth
- remove compatibility seams
- make the capability path the obvious primary code path

### What survives from the current system

- workflow journal
- command/signal model
- projection and hydration model
- preset registration
- authority model
- restart and recovery discipline

### What becomes legacy

- old current-flow-specific next-work inference
- direct implicit mapping from tracker state to run mode as planning authority
- preset semantics that encode the old development style too rigidly

## Proof Plan Appendix

The capability router should be treated like a proof system, not a generation system.

This appendix defines the invariants the tests must defend.

### Invariant 1: history is authority

Meaning:

- no projection or read model may become the source of lifecycle truth

Proof boundary:

- projection replay tests
- restart/rehydration tests

Regression scenarios:

- stale snapshot plus tail history
- duplicate signal replay
- late command settlement

### Invariant 2: only `implement.spec` advances work epoch

Meaning:

- critics and verifiers can never silently create a new proof boundary

Proof boundary:

- capability projection unit tests

Regression scenarios:

- code-review completion attempts to advance epoch
- adversarial test completion attempts to advance epoch

### Invariant 3: stale prior-epoch evidence cannot satisfy completion

Meaning:

- every completion proof must apply to the latest implementation

Proof boundary:

- top-level capability proof harness

Regression scenarios:

- implementation epoch 1 passes review
- implementation epoch 2 changes code
- completion must now fail until epoch 2 review passes

### Invariant 4: `changes_requested` always routes back to implementation

Meaning:

- critic failures cannot leave the workflow in a falsely verified state

Proof boundary:

- candidate-builder tests
- proof harness tests

Regression scenarios:

- code review requests changes
- adversarial tests request changes

### Invariant 5: pending clarification stops execution planning

Meaning:

- the planner may not continue guessing once the workflow is waiting on explicit input

Proof boundary:

- planner tests
- proof harness tests

Regression scenarios:

- clarification request exists but planner still emits execution candidate

### Invariant 6: completion requires explicit proof

Meaning:

- completion is never inferred from the absence of more work alone

Proof boundary:

- completion-gate tests
- proof harness tests

Regression scenarios:

- all candidates exhausted but required evidence missing
- manual completion attempted without gate evaluation

### Invariant 7: planner chooses from admissible candidates only

Meaning:

- deterministic and LLM-assisted planning both remain policy-bounded

Proof boundary:

- route-strategy tests

Regression scenarios:

- required capability omitted
- forbidden capability selected
- unsupported profile selected

### Invariant 8: retries do not corrupt authority

Meaning:

- retryable failure is visible and does not create false success state

Proof boundary:

- execution-result tests
- proof harness tests

Regression scenarios:

- retryable failure increments wrong epoch
- retryable failure marks capability completed

### Invariant 9: blocked is durable

Meaning:

- blocked work must stay blocked until an explicit unblock path exists

Proof boundary:

- projection tests
- planner tests

Regression scenarios:

- blocked workflow still emits execution candidates

### Invariant 10: manual completion bypasses merge, not proof

Meaning:

- manual policy changes finalization behavior, not readiness semantics

Proof boundary:

- completion-gate tests

Regression scenarios:

- manual completion accepted with missing evidence

### Recommended proof structure

#### Unit layer

- policy resolver
- registries
- projection rules
- completion gate
- candidate builder
- route strategy

#### Integration layer

- planner from persisted contract plus history
- API-side intake and persistence
- command emission plus result signal recording

#### Top-level proof harness

- full route from contract intake to completion gate
- review loop regression
- adversarial loop regression
- clarification interruption
- restart mid-flight
- stale evidence invalidation

## Mental Transfer Notes

These are the implementation instincts that should carry through every slice.

### 1. Protect the separation between policy and planner

If a piece of logic changes admissibility, completion, retry ceilings, or safety rules, it belongs
to explicit policy, not to the LLM planner.

If a piece of logic chooses among already admissible options, it belongs to the planner.

Do not blur that line.

### 2. Keep the router substrate

Do not throw away the router work because the product model evolved.

The substrate is still the hard part we needed:

- journal
- replay
- settlement
- hydration
- authority

The capability layer is an additional planning model on top of it.

### 3. Prefer one-way hardening

It is easy to loosen a contract later.

It is difficult to tighten a weak contract once many call sites exist.

Favor strict ids, strict timestamps, explicit result kinds, and required payload shapes now.

### 4. Build the smallest real route first

The first route should be:

1. `implement.spec`
2. `critic.code_review`
3. `critic.adversarial_tests`
4. completion gate

Do not introduce browser execution, public customization, or external workflow substrates before
that route is closed and proven.

### 5. Treat every slice as deleting uncertainty

The purpose of each slice is not just to add code.

The purpose is to remove ambiguity about:

- what the planner owns
- what the runtime owns
- what the journal owns
- what proves the workflow is truly complete

## Implementation Order

The slices below are ordered intentionally.

Each slice should be independently verifiable.

The instruction for each slice is:

- implement the strict contract
- add targeted tests
- verify with the narrowest meaningful proof first
- only then move outward

## Slice 0: Freeze The Vocabulary

Goal:

- lock the names and meanings before code spreads

Tasks:

- create one architecture document for the capability router model
- codify durable phase names
- codify capability ids
- codify model profile ids
- codify clarification vocabulary
- codify completion-gate vocabulary
- codify routing-directive vocabulary

Exit criteria:

- there is one authoritative design document
- names are explicit and stable enough to implement against

## Slice 1: Add Capability Types To `packages/router`

Goal:

- formalize the first public capability-layer surface without changing live routing behavior

Tasks:

- add `types/capability.ts`
- add `types/profile.ts`
- add `types/evidence.ts`
- add `symphony-capability-contract.ts`
- export the new capability-layer types from `packages/router/src/index.ts`
- keep the surface additive to the existing router

Tests:

- type-level compilation checks
- unit tests for strict parsing and fail-fast validation

Exit criteria:

- all core capability-layer types exist
- all required ids and timestamps remain strict
- the exported API is coherent and minimal

## Slice 2: Implement Routing Policy Resolution

Goal:

- merge preset defaults, user defaults, and ticket directives into one authoritative resolved policy

Tasks:

- implement `routing-policy-resolver.ts`
- define merge precedence
- define strictness ordering for:
  - completion policy
  - clarification policy
  - review strictness
- enforce:
  - required capability unions
  - forbidden capability unions
  - required evidence unions
  - profile intersections
- fail fast on contradictions

Tests:

- required plus forbidden capability conflict
- empty profile intersection
- impossible evidence requirement
- ticket cannot weaken preset hard requirements
- valid merge with strict override

Exit criteria:

- one resolved policy object exists
- invalid tickets fail before planning begins

## Slice 3: Implement Capability Registry And Model Profile Registry

Goal:

- make capability and profile identity first-class

Tasks:

- implement `capability-registry.ts`
- implement `model-profile-registry.ts`
- fail fast on:
  - duplicate ids
  - blank ids
  - empty registries
  - unsupported profile references in capabilities

Tests:

- duplicate capability registration
- duplicate profile registration
- capability references unknown profile
- successful registry construction

Exit criteria:

- the planner can rely on strict registries instead of loose arrays

## Slice 4: Implement Capability Projection

Goal:

- derive current capability truth from workflow history

Tasks:

- implement `capability-projection.ts`
- derive:
  - current `workEpoch`
  - pending clarification
  - latest capability attempts
  - capability status by epoch
  - evidence by epoch
  - blocked reason
  - completion readiness skeleton
- define how `implement.spec` advances the epoch
- define how stale evidence remains visible but no longer satisfies completion

Tests:

- implementation completion advances epoch
- verification evidence from prior epoch becomes stale
- clarification request enters pending state
- clarification answer clears pending state
- blocked state projects correctly
- `changes_requested` invalidates readiness

Exit criteria:

- capability projection is deterministic and replayable
- candidate building no longer needs raw-history reasoning

## Slice 5: Implement Completion Gate Evaluation

Goal:

- turn completion into a deterministic proof check instead of a loose judgment

Tasks:

- implement `completion-gate.ts`
- evaluate:
  - required evidence satisfied
  - required capabilities satisfied
  - no pending clarification
  - no blocking state
  - completion policy
- return:
  - `not_ready`
  - `ready_for_manual_completion`
  - `ready_for_auto_completion`

Tests:

- missing required evidence
- required capability unmet
- pending clarification blocks completion
- manual policy yields manual readiness
- auto policy yields auto readiness

Exit criteria:

- completion is explicit and policy-owned

## Slice 6: Implement Deterministic Candidate Building

Goal:

- compute the admissible capability set from projection plus resolved policy

Tasks:

- implement `capability-candidate-builder.ts`
- define strict sequencing:
  - `implement.spec`
  - `critic.code_review`
  - `critic.adversarial_tests`
  - `critic.browser_test` later
- stop planning when clarification is pending
- stop planning when blocked
- require code review to pass before adversarial testing
- keep browser testing stubbed and non-admissible by default
- let preference shape ordering, not authority

Tests:

- fresh workflow yields `implement.spec`
- completed implementation yields `critic.code_review`
- code-review pass enables adversarial tests when policy requires it
- code-review changes requested returns to implementation
- pending clarification yields no execution candidates
- blocked yields no execution candidates

Exit criteria:

- deterministic planning works without any LLM strategy

## Slice 7: Implement Capability Route Strategy

Goal:

- choose exactly one candidate and one allowed profile

Tasks:

- implement deterministic strategy first
- define stable selection rules:
  - required capability before preferred capability
  - higher priority first
  - preferred profile bias within allowed profiles
- formalize decision records

Tests:

- deterministic tie-breaking
- preferred profile bias
- cannot choose forbidden candidate
- cannot choose unsupported profile

Exit criteria:

- one capability and one profile are chosen per planning pass

## Slice 8: Implement The Capability Planner

Goal:

- expose one public planning surface for the capability layer

Tasks:

- implement `capability-planner.ts`
- wire together:
  - policy resolver
  - capability projection
  - completion gate
  - candidate builder
  - route strategy
- return plan variants:
  - execute
  - awaiting_input
  - blocked
  - ready_for_manual_completion
  - ready_for_auto_completion

Tests:

- end-to-end deterministic planning from contract plus history
- completion-ready plan
- blocked plan
- awaiting-input plan

Exit criteria:

- one planner call produces the next authoritative planning result

## Slice 9: Define Capability Result Signal Vocabulary

Goal:

- make execution outcomes durable, strict, and replayable

Tasks:

- define signal payloads for:
  - `capability.started`
  - `capability.completed`
  - `capability.changes_requested`
  - `capability.failed`
  - `capability.blocked`
  - `workflow.clarification_requested`
  - `workflow.clarification_answered`
  - `workflow.completion_gate_evaluated`
- keep `executionId`, `workEpoch`, `attempt`, `capabilityId`, and `modelProfileId` required

Tests:

- invalid signal payloads fail fast
- completion signal carries evidence
- clarification signal carries structured questions
- retryable failure preserves epoch

Exit criteria:

- the execution boundary is formalized without yet wiring a real runtime

## Slice 10: Define Capability Execution Engine Contract

Goal:

- create the narrow seam for runtime execution without committing to a specific execution substrate

Tasks:

- add `WorkflowCapabilityExecutionEngine` interface
- define one command kind:
  - `capability.execute`
- define one result union:
  - completed
  - changes_requested
  - clarification_requested
  - failed
  - blocked
- keep browser capability support stubbed

Tests:

- contract-level type tests
- minimal fake engine tests proving result conversion assumptions

Exit criteria:

- the runtime can later plug in in-process execution or Workflow DevKit-backed execution

## Slice 11: Build The First Symphony Capability Preset

Goal:

- make the capability layer real for Symphony's initial workflow

Tasks:

- implement `symphony-capability-preset.ts`
- register capabilities:
  - `implement.spec`
  - `critic.code_review`
  - `critic.adversarial_tests`
  - `critic.browser_test`
- mark browser capability non-admissible by default
- register profiles:
  - `builder_fast`
  - `builder_deep`
  - `critic_strict`
  - `critic_adversarial`
  - `critic_browser`
- define default policy

Tests:

- preset wiring
- profile compatibility
- browser capability remains stubbed
- backend-oriented strict policy enables adversarial tests

Exit criteria:

- Symphony has one coherent capability preset ready for API integration

## Slice 12: Add API-Side Ticket Contract Intake

Goal:

- create and validate execution contracts at the API boundary

Tasks:

- define API-side contract creation boundary
- persist contract as a control-plane artifact
- reject underspecified tickets
- store routing directives explicitly
- separate control-plane contract data from raw external payloads

Tests:

- missing objective rejected
- missing done definition rejected
- missing repository context rejected
- missing merge policy rejected
- valid contract persisted

Exit criteria:

- the planner no longer depends on loose ticket prose at runtime

## Slice 13: Integrate Planner Into API Without Replacing Live Routing Yet

Goal:

- introduce capability planning as a parallel planning seam while preserving the current workflow
  authority model

Tasks:

- wire planner into `apps/api`
- load:
  - workflow history
  - lifecycle projection
  - execution contract
- compute next capability plan
- persist decision records
- emit `capability.execute` command records
- do **not** yet rewrite all legacy lifecycle behavior in the same slice

Tests:

- planner computes deterministic next step from persisted state
- decision and command are recorded
- hydration plus replan after restart works

Exit criteria:

- live runtime can ask the capability planner what to do next

## Slice 14: Add First In-Process Execution Adapter

Goal:

- prove the capability loop end-to-end without introducing Workflow DevKit or external systems

Tasks:

- implement an in-process capability execution adapter
- support:
  - `implement.spec`
  - `critic.code_review`
  - `critic.adversarial_tests`
- convert execution results into capability result signals
- feed those signals back into workflow history

Tests:

- implementation result produces completion or review signals
- code-review changes requested routes back to implementing
- adversarial-test changes requested routes back to implementing
- retryable failure does not corrupt workflow authority

Exit criteria:

- the capability loop runs end to end in-process

## Slice 15: Top-Level Proof Harness

Goal:

- prove the entire capability-router loop at the highest boundary we can reasonably test

Tasks:

- build one proof harness for:
  - intake contract
  - policy resolution
  - projection
  - planning
  - command emission
  - result signal recording
  - replay
  - restart/rehydration
- test the main route:
  - implement
  - code review
  - adversarial tests
  - completion gate

Tests:

- happy path
- review requests changes
- adversarial tests request changes
- clarification blocks routing
- restart mid-verification
- stale prior-epoch evidence does not satisfy completion

Exit criteria:

- the feature is proven as a closed loop in tests before broad runtime cutover

## Slice 16: Authority Cutover

Goal:

- make the capability planner the authority for what work runs next

Tasks:

- replace old route-next-work inference with planner decisions
- delete shadow planning truth
- keep lifecycle authority in workflow history
- ensure every planner-visible state change is recorded explicitly

Tests:

- no direct side path can bypass planner authority
- replay and recovery remain stable after cutover

Exit criteria:

- the next unit of work is always planner-owned

## Slice 17: Cleanup Pass

Goal:

- simplify the code after the new model is authoritative

Tasks:

- delete superseded planning helpers
- delete obsolete preset-specific indirection
- compress duplicated routing language
- remove temporary compatibility seams
- tighten tests around the final surface

Exit criteria:

- the capability-router implementation is the obvious primary path in code

## Explicit Non-Goals During This Roadmap

Do not fold these into the first implementation:

- hosted auth and org/workspace productization
- browser automation execution details
- screenshot/blob storage plumbing
- Workflow DevKit integration
- GitHub PR and review transport wiring
- Linear ticket creation or synchronization UX
- public configuration marketplace

These may follow later.

They should not destabilize the first implementation.

## Practical Implementation Guidance

### Keep `packages/router` pure

The package should own:

- contracts
- registries
- projection
- policy resolution
- planning
- completion evaluation

It should not own:

- network calls
- provider clients
- GitHub or Linear API calls
- browser automation details

### Keep execution adapters narrow

Execution adapters should:

- consume `capability.execute`
- run the requested capability
- return strict result signals

They should not:

- decide the next capability
- mutate workflow phases directly
- invent routing truth

### Keep the current router substrate

Do not rewrite the durable router core.

Reuse:

- history
- projection/hydration
- command settlement
- preset registration
- authority model

### Prefer one proof harness over scattered tests

Unit tests matter.

But the real protection for this feature is one top-level proof harness that demonstrates:

- planning correctness
- closed-loop progression
- restart safety
- stale-evidence invalidation
- strict completion gating

## Definition Of Done For This Feature

The capability-router feature is complete for this roadmap when all of the following are true:

- the ticket execution contract is strict and persisted
- routing directives merge deterministically
- capability and profile registries exist and are strict
- capability projection is replayable
- completion is gate-driven
- deterministic planning works
- one Symphony capability preset exists
- the API can plan the next capability from durable state
- in-process execution can run the first three capabilities
- capability results feed back into workflow history
- restart and rehydration proofs pass
- the planner is the authority for what work runs next
- browser capability remains safely stubbed
- no GitHub or Linear wiring is required to demonstrate the loop

## Recommended Immediate Next Step

When implementation begins, start with:

1. Slice 1
2. Slice 2
3. Slice 3
4. Slice 4

Do not jump to runtime execution before the type surface, policy resolver, registries, and
projection model are stable.

That is the highest-leverage path.
