# Router Hardening And E2E Stabilization Plan

Date: 2026-04-13

Status: Draft

Audience:

- Symphony maintainers
- Symphony control-plane implementers
- Symphony UI/read-model maintainers
- Future contributors trying to understand why the router program is being reordered

Related documents:

- [`docs/architecture/2026-04-09-workflow-router-architecture.md`](../architecture/2026-04-09-workflow-router-architecture.md)
- [`docs/architecture/2026-04-10-router-authority-and-ingress.md`](../architecture/2026-04-10-router-authority-and-ingress.md)
- [`docs/architecture/2026-04-11-lifecycle-authority-matrix.md`](../architecture/2026-04-11-lifecycle-authority-matrix.md)
- [`docs/adr/2026-04-08-run-mode-and-issue-state-contract.md`](../adr/2026-04-08-run-mode-and-issue-state-contract.md)
- [`docs/adr/2026-04-08-runtime-result-command-contract.md`](../adr/2026-04-08-runtime-result-command-contract.md)
- [`docs/plans/2026-04-12-capability-router-implementation-roadmap.md`](2026-04-12-capability-router-implementation-roadmap.md)

## Purpose

This document defines the recovery and hardening plan for Symphony's router-first execution model.

The central thesis is unchanged:

- the router idea is correct
- durable route history is the right substrate
- a single routing authority choosing the next best step is the right product direction

The implementation sequence, however, needs to be corrected.

This document answers:

- what we built correctly
- where we introduced ambiguity
- why the current system feels unstable
- how to reorder the remaining work
- what deterministic golden-path `.e2e.test.ts` coverage we need
- how to use mocked Pi outputs and exported DB artifacts to validate the system
- what code we expect to cut after the system stabilizes
- what contracts must be frozen before more UI or feature work resumes

This document is intentionally detailed.

It is not a source-of-truth runtime contract.

It is a working plan intended to remove ambiguity before the next stabilization pass.

## Executive Summary

The current system is not failing because the router concept is wrong.

The current system is unstable because we introduced a new control-plane authority while older completion, prompt, CLI, and UI assumptions were still alive.

That produced a split-brain system in a few critical places:

- the prompt still says implementation and rework runs complete through `symphony tool finish`
- the runtime tools package still treats `finish --status completed` as a PR-backed delivery transition to `In Review`
- the capability-managed router path now allows some implementation and rework runs to end implicitly and continue planning without explicit `finish`
- the UI started expanding before the underlying run narrative and workflow read model were stable
- live tickets were used to exercise flows that should first have been replayed in deterministic transcript-driven tests

The corrective strategy is not to abandon the router.

The corrective strategy is:

1. freeze the lifecycle and completion contract
2. codify transcript-driven golden-path `.e2e.test.ts` scenarios
3. align prompt, CLI, runtime, router, and tracker semantics to those scenarios
4. cut duplicate or contradictory code paths
5. simplify the UI so it presents stable data plainly
6. only then resume broader product/UI work

## Why This Document Exists

There are two different questions hiding inside the current situation.

The first question is:

- is the router direction correct?

The answer is:

- yes

The second question is:

- did we integrate the router into the existing system in the safest order?

The answer is:

- not fully

We effectively changed authority before we finished hardening the execution contract.

That is recoverable.

It is also normal.

But it must now be addressed directly.

This document exists so that the next pass is:

- explicit
- test-first
- contract-first
- deletion-friendly
- honest about what we keep and what we intend to throw away

## Core Position

The router is the future.

The control plane should converge toward:

- durable workflow history as authority
- router-owned next-step planning
- capability-oriented execution
- route journal backed recovery and replay
- simple read models and simple UI

The system should move away from:

- implicit completion rules hidden in prompts
- CLI commands being used as universal lifecycle gates
- duplicated notions of "done"
- UI-specific logic compensating for unstable backend semantics
- live ticket behavior being the primary integration test

## The Short Diagnosis

We did several valuable things.

We also did them in a sequence that increased risk.

### What We Did Right

- we identified the router as the right control-plane concept
- we invested in durable route history
- we created replayable workflow projection
- we created explicit route signals and command settlement
- we introduced capability planning and capability-managed continuation
- we recognized that "node" and "run" need a clearer mental model
- we started exposing workflow observability through APIs
- we surfaced enough runtime artifacts to reconstruct failures after the fact

### What We Did Out Of Order

- we allowed new router-owned completion behavior to land while prompt/CLI text still described the old completion model
- we expanded UI surface area before finalizing the shape of the read model
- we relied on live Linear tickets to validate flows that should first have been replayed deterministically
- we treated the current implementation as closer to product-complete than it really was
- we did not build the golden-path Pi transcript replay suite before wiring live orchestration to it
- we tolerated temporary contract disagreement across layers for too long

### Why It Feels Like Hot Water

The system now contains several partially overlapping truths:

- Linear state truth
- route workflow truth
- run-store truth
- delivery-report truth
- prompt-instruction truth
- UI interpretation truth

A stable system can project one truth into many views.

An unstable system lets several of those views act like partial authorities.

That is the state we are currently exiting.

## The Main Insight

The right system is not:

- "the agent decides everything"

The right system is:

- the router decides the next admissible step
- the agent executes one bounded step
- the system persists enough narrative to explain what happened
- the next step is chosen from journaled state, not from fresh improvised prompting

That means the most valuable tests are not generic unit tests.

The most valuable tests are transcript-driven lifecycle scenarios that prove the whole control-plane loop.

## The Order We Should Follow Now

We should reorder the remaining implementation into this sequence:

1. contract freeze
2. transcript fixture strategy
3. golden-path `.e2e.test.ts` suite
4. prompt and runtime completion alignment
5. router-first simplification pass
6. UI simplification and read-model cleanup
7. broad deletion pass

Everything else should be judged against whether it helps one of those seven steps.

## Non-Goals For This Stabilization Pass

This plan does not aim to:

- maximize dashboard polish
- design the final visual language
- optimize operator delight in the UI
- add new user-facing workflow capabilities beyond what is needed to stabilize the current router model
- generalize the router for broad marketplace or multi-tenant packaging
- introduce another event store or another lifecycle authority
- redesign the whole data model from scratch

This plan does aim to:

- make the current router model coherent
- prove it deterministically
- clarify which contracts survive
- delete code that only exists because the contracts were previously ambiguous

## Glossary

The terms below are used consistently in this document.

### Router

The deterministic workflow-routing system that consumes signals, projects state, and emits commands.

### Workflow

The durable record of issue lifecycle progression backed by route history and projection snapshots.

### Node

A conceptual workflow phase or step in route projection.

Nodes are not automatically user-facing.

Nodes are not automatically the same thing as capabilities.

### Capability

A bounded executable unit such as `implement.spec` or `critic.code_review`.

### Capability-managed run

An implementation or rework run that is governed by an execution contract and capability planning, so it may complete without an explicit `finish` tool call and continue to the next router-selected capability.

### Explicit-completion run

A run that still requires an explicit runtime command such as `symphony tool finish` or `symphony tool merge-result` to cross the completion boundary.

### Delivery report

A persisted result record produced by `symphony tool finish`.

### Merge result

A persisted merge outcome produced by `symphony tool merge-result`.

### Tracker state

The current Linear issue state, such as `Todo`, `Bootstrapping`, `In Progress`, `In Review`, `Blocked`, `Paused`, or `Done`.

### Workflow tracker state

The tracker state as projected by the route workflow.

### Observed tracker state

The tracker state as freshly read from Linear.

### Run

A durable execution attempt recorded in Symphony's run store.

### Turn

A lower-level interaction sequence within a run.

### Run narrative

The operator-readable reconstruction of what happened during a run, including reasoning, messages, commands, tool calls, file changes, and terminal outcome.

### Transcript fixture

A deterministic stored sequence of mocked Pi/runtime events exported from a real run or hand-authored to drive golden-path tests.

### Golden path

A high-value, expected production flow that the system must perform cleanly and repeatedly.

### Replay

Feeding recorded or synthetic events into the control plane in a deterministic order and asserting the resulting state transitions and persisted artifacts.

### Projection

The computed workflow state produced by replaying route history through a router session.

### Authority

The component or data source that is allowed to determine truth for a particular field or lifecycle decision.

## What We Keep

The next pass is not a rewrite from zero.

We should keep the parts that already align with the correct architecture.

### Durable Route Journal

Keep:

- `route_workflows`
- `route_history_events`
- `route_projection_snapshots`
- command settlement
- hydration and resume logic
- preset registration and selection

Why:

- this is the right control-plane substrate
- it is replayable
- it is inspectable
- it enables restart recovery

### Capability Planning Concepts

Keep:

- execution contracts
- policy resolution
- capability registry
- model profile registry
- candidate building
- completion gating

Why:

- these make the router idea useful
- they let the router choose the next best bounded step instead of just shuttling between coarse states

### Run Store And Agent Event Capture

Keep:

- run store
- turn store
- agent event log
- command execution profiles
- file change capture
- runtime logs

Why:

- the UI and forensics layer still need a run narrative
- router authority does not replace execution evidence
- node-level clarity improves when every execution step still yields a readable run artifact

### Runtime Tools Package

Keep:

- `finish`
- `merge-result`
- `spike-result`
- `cancel`

Why:

- explicit operator/runtime result commands are still needed
- but their valid usage scope needs to be narrowed and clarified

### Existing Integration Harnesses

Keep:

- fake Pi binary support
- runtime route lifecycle integration harnesses
- route replay fixtures
- current-flow router unit proofs

Why:

- these are the exact seams we should now elevate into transcript-driven `.e2e.test.ts` coverage

## What We Reconsider

The following areas need deliberate correction, not just incremental tweaking.

### Universal Completion Through `finish`

Reconsider:

- any prompt text that says all implementation and rework runs complete through `finish`

Why:

- capability-managed implementation and rework runs now have a valid implicit continuation path
- therefore a universal explicit-completion statement is false

### UI Scope

Reconsider:

- any UI expansion that assumes read-model semantics are settled
- any component trying to "explain" unstable backend state through custom view logic

Why:

- the backend contract is still being hardened
- legibility matters more than novelty

### Mixed Authority On Completion

Reconsider:

- any place where the agent runtime, CLI command, router, and tracker all appear to own completion in different ways

Why:

- this is the most dangerous ambiguity in the system right now

### Live Ticket First Validation

Reconsider:

- using real Linear tickets as the primary way to learn whether orchestration is coherent

Why:

- live tickets are for smoke validation
- not for first proof

## The Correct Authority Model

We need a hard, explicit authority model.

Without it, the code will keep accreting compensating behavior.

### Canonical Control-Plane Authority

The route workflow is the authority for:

- workflow node
- workflow projection
- pending commands
- route decisions
- replayable causation
- capability progression
- whether the next step is implementation, review, rework, merge, blocked, awaiting input, or manual completion

### Tracker As External Surface

Linear is the authority for:

- actual current issue state in the tracker
- external operator-facing ticket status
- comment timeline outside Symphony storage
- project membership
- issue assignment

Linear is not the authority for:

- how the next step is chosen
- what capability should run next
- what command settlement has occurred
- whether a workflow is internally ready for completion

### Run Store Authority

The run store is the authority for:

- persisted run identities
- turns
- runtime event sequences
- command executions
- raw execution evidence
- run outcomes after they are finalized

The run store is not the authority for:

- workflow phase
- next best step
- lifecycle transitions by itself

### Runtime Tools Authority

Runtime tool commands are the authority for:

- explicit operator/agent-reported delivery result records
- explicit merge result records
- explicit spike or cancellation results

Runtime tool commands are not the universal completion authority for every run.

They are one kind of completion boundary.

### UI Authority

The UI is authority for:

- presentation
- grouping
- filtering
- framing

The UI is not authority for:

- repairing lifecycle contradictions
- inferring missing delivery semantics
- inventing workflow statuses from weak signals

## The Current Split-Brain Problem

The main split-brain today is completion.

### Old Completion Story

The old story was:

- implementation or rework finishes
- the agent calls `symphony tool finish`
- Symphony records delivery
- the issue moves to `In Review`
- the run ends

### New Capability-Managed Story

The new story is:

- implementation or rework capability completes
- Symphony records capability completion
- the planner evaluates the next admissible capability
- Symphony either dispatches the next step or routes to completion only when the plan says the workflow is ready

### What Exists Right Now

Right now the codebase contains both stories.

That creates situations where:

- the prompt says one thing
- the runtime allows another
- the CLI validates a third
- the router assumes a fourth

We must end that.

## The Contract We Need To Freeze

Before adding more features, we need one explicit lifecycle contract.

### Rule 1

The route workflow owns progression.

### Rule 2

A capability-managed implementation or rework run does not require `finish` just because the agent has completed one execution step.

### Rule 3

`finish` remains valid for explicit-completion flows only.

### Rule 4

If a capability-managed workflow reaches a planner state of `ready_for_manual_completion` or `ready_for_auto_completion`, the router drives the transition.

### Rule 5

Prompt text must not instruct the agent to cross a completion boundary that is invalid for the current run kind.

### Rule 6

A failed completion command must fail loudly and coherently.

It must not degrade into a later ambiguous stall if the system can detect the failure immediately.

### Rule 7

UI components must render what the read model actually says.

They must not compensate for undefined lifecycle semantics.

## The Safer Implementation Sequence We Should Have Followed

This section is deliberately explicit.

It is the sequence we should approximate now.

### Step A

Freeze the lifecycle and completion contract.

Outputs:

- one written contract
- one matrix of valid run types and completion boundaries
- prompt text aligned to that matrix
- runtime tools aligned to that matrix

### Step B

Build deterministic transcript-driven tests.

Outputs:

- mocked Pi transcript fixtures
- replay harness
- golden-path `.e2e.test.ts` suite

### Step C

Wire live orchestration to those paths.

Outputs:

- runtime lifecycle integration using already-proven paths
- low ambiguity when real tickets run

### Step D

Build read models and UI.

Outputs:

- simple stable projections
- low-risk UI components

### Step E

Delete old assumptions.

Outputs:

- smaller system
- less ambiguity

## The Sequence We Should Follow Now

We cannot go back in time.

We can still impose a safe order from this point forward.

### Phase 0

Write and accept the lifecycle freeze.

### Phase 1

Define transcript fixture shape.

### Phase 2

Build three mandatory golden-path `.e2e.test.ts` files first.

### Phase 3

Align prompt, runtime, CLI, and route completion behavior to the tests.

### Phase 4

Add additional golden paths and regression scenarios.

### Phase 5

Simplify UI and read models around the stabilized contracts.

### Phase 6

Cut or rewrite code paths that only existed to support pre-router assumptions.

## Golden Path Philosophy

The next pass should revolve around a short list of extremely high-value scenarios.

A golden path is not:

- a random edge case
- a narrow unit behavior
- a branch that only occurs once in a month of operator use

A golden path is:

- expected
- common
- core to the product promise
- expensive when broken
- ideal for deterministic replay

## Why Mocked Pi Outputs Are The Right Test Surface

Mocked Pi transcript replay is the right seam because it validates the contract at the boundary where we are actually unstable.

It lets us prove:

- what the runtime sees
- what gets persisted
- how the route workflow reacts
- what tracker transition is emitted
- whether the run ends, continues, pauses, or blocks

It avoids:

- dependence on real providers
- flaky CLI/provider behavior
- cost
- nondeterministic prompt variation

It also maps closely to real incidents.

When a live run fails, we can export the transcript and turn it into a replay fixture.

That is the right feedback loop.

## How To Use Real DB Data Safely

We should use production-like data from `symphony.db`, but not directly in tests.

The correct pattern is:

1. identify a real run worth preserving
2. export its run-store and agent event records
3. normalize unstable identifiers
4. strip irrelevant noise
5. store the result as a curated fixture
6. replay it through the harness in CI

This preserves realism without introducing hidden state or non-determinism.

## Transcript Fixture Design

Transcript fixtures should be human-auditable.

They should not be opaque blobs.

### Fixture Requirements

- stable file format
- stable IDs after normalization
- readable structure
- explicit terminal expectation
- explicit expected route effect
- explicit expected tracker effect
- explicit expected run outcome

### Fixture Should Not Contain

- live secrets
- raw provider auth material
- irrelevant giant outputs
- unstable timestamps unless normalized
- arbitrary event noise with no impact on assertions

### Fixture Should Contain

- run mode
- initial tracker state
- initial workflow projection assumptions
- ordered event sequence
- expected runtime terminal completion
- expected route decisions
- expected issue state after routing
- expected next dispatch behavior if any

## Proposed Transcript Fixture Format

The shape below is a proposal, not yet an accepted contract.

```json
{
  "name": "implementation_capability_continues_to_review",
  "description": "Implementation capability completes, code review is planned next.",
  "initial": {
    "issueIdentifier": "SYM-900",
    "trackerIssueId": "tracker-900",
    "trackerState": "In Progress",
    "runMode": "implementation",
    "workflowPresetId": "current-flow",
    "capabilityManaged": true,
    "contractFixture": "strict-implementation-with-review"
  },
  "events": [
    {
      "type": "session.started",
      "payload": {
        "thread_id": "thread_001",
        "turn_id": "turn_001",
        "model": "mock-model"
      }
    },
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "reasoning_001",
          "type": "reasoning",
          "text": "Working through the requested change."
        }
      }
    },
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "file_change_001",
          "type": "file_change",
          "path": "/workspace/apps/web/src/features/issues/components/issue-detail-view.tsx"
        }
      }
    },
    {
      "type": "turn_end",
      "payload": {
        "message": {
          "usage": {
            "input": 1200,
            "cacheRead": 0,
            "output": 450
          }
        }
      }
    }
  ],
  "expect": {
    "runtimeCompletion": {
      "kind": "delivered"
    },
    "workflow": {
      "currentNode": "implementation",
      "nextPlanningKind": "execute",
      "nextCapabilityId": "critic.code_review"
    },
    "tracker": {
      "state": "In Progress"
    },
    "dispatch": {
      "continueWithRunMode": "implementation"
    }
  }
}
```

## Transcript Normalization Rules

Every exported transcript fixture should normalize:

- run IDs
- thread IDs
- turn IDs
- command item IDs
- event timestamps
- repo-specific temp paths
- process IDs
- auth-related env keys

Suggested normalization strategy:

- map issue identifiers to stable synthetic identifiers
- map run IDs to `run_001`
- map thread IDs to `thread_001`
- map turn IDs to `turn_001`
- map command item IDs to semantic names when useful
- convert timestamps to an ordered synthetic timeline
- replace real workspace roots with `/workspace`

## Transcript Export Tooling

We should build small tooling for fixture extraction.

This tooling does not need to be production-grade.

It should:

- query `symphony_runs`
- query `symphony_events`
- query `symphony_agent_event_log`
- query `symphony_agent_command_executions`
- optionally query `symphony_issue_delivery_reports`
- optionally query route history for the same issue
- emit normalized JSON

Suggested location:

- `apps/api/src/test-support/export-runtime-transcript.ts`

This should not become part of runtime behavior.

It is a developer aid.

## Golden Path Suite Overview

The first stabilization milestone should be a small set of mandatory `.e2e.test.ts` scenarios.

These should be intentionally opinionated.

They should not try to cover the whole world.

They should cover the flows that prove the architecture.

## Golden Path 1

### Name

Capability-managed implementation continues without explicit `finish`

### Why It Matters

This is the clearest proof that the router, not the old delivery-report boundary, is now selecting the next best step.

### Setup

- issue starts in `Todo`
- route workflow claims into `Bootstrapping`
- run activates into `In Progress`
- execution contract requires:
  - `implement.spec`
  - `critic.code_review`

### Transcript

- Pi does meaningful work
- Pi emits file changes
- Pi emits token usage
- Pi ends the turn cleanly
- Pi does not call `symphony tool finish`

### Assertions

- run completion is `delivered`
- capability completion signal is recorded
- planner selects `critic.code_review`
- tracker state remains `In Progress`
- router requests another run instead of moving to `In Review`

### Failure This Catches

- prompt/runtime disagreement on completion boundary
- capability completion not feeding planner
- accidental forced delivery-report requirement

## Golden Path 2

### Name

Capability-managed workflow reaches router-owned completion

### Why It Matters

This proves the router can end a workflow when policy and evidence gates say the work is complete.

### Setup

- capability-managed issue
- minimal contract where one implementation capability satisfies completion

### Transcript

- Pi performs meaningful work
- Pi ends cleanly
- no `finish` call

### Assertions

- run completion is `delivered`
- planner returns a completion-ready state
- route completion transitions workflow appropriately
- tracker reaches the expected completion-facing external state

### Failure This Catches

- inability to distinguish "step delivered" from "workflow delivered"
- missing planner completion handoff

## Golden Path 3

### Name

Explicit-completion implementation run uses valid `finish`

### Why It Matters

We still need the non-capability-managed path to work for legacy or manual flows.

### Setup

- implementation run
- no execution contract
- explicit-completion semantics apply

### Transcript

- Pi performs work
- Pi calls `pnpm exec symphony tool finish --status completed --pr-url ...`
- runtime-tools API records delivery

### Assertions

- delivery report is persisted
- tracker moves to `In Review`
- run completes cleanly
- no continuation is scheduled

### Failure This Catches

- broken CLI/runtime-tools path
- broken delivery routing
- prompt drift for legacy/manual flows

## Golden Path 4

### Name

Clarification requested and later resumed

### Why It Matters

Clarification is a normal workflow behavior in a capability-driven system.

It must not dead-end the workflow.

### Setup

- capability-managed implementation run
- active execution contract

### Transcript

- run ends in `clarification_requested`

### Follow-up

- clarification answer is recorded through ingress
- planner re-evaluates the same work epoch

### Assertions

- pending clarification clears
- the capability is no longer treated as permanently active
- a new attempt is created for the same capability/work epoch
- the next run is dispatchable

### Failure This Catches

- clarification status treated as terminally active
- inability to resume after answer

## Golden Path 5

### Name

Review rework loop

### Why It Matters

This is a core product loop.

Work is rarely accepted on first pass.

### Setup

- implementation capability completes
- review capability runs next

### Transcript Sequence

- implementation transcript
- review transcript that emits rework-required completion
- follow-up implementation transcript

### Assertions

- workflow moves to review
- rework request routes back to bootstrapping or rework as designed
- new implementation run is dispatched
- route history remains coherent across the loop

### Failure This Catches

- broken review handoff semantics
- broken router re-entry
- stale active-attempt logic

## Golden Path 6

### Name

Approved merge run records merged result

### Why It Matters

A pipeline without a clean merge path is incomplete.

### Setup

- issue reaches merge-ready state
- approved merge run dispatched

### Transcript

- merge automation runs
- agent calls `symphony tool merge-result --status merged ...`

### Assertions

- merge result is persisted
- workflow routes to merge completion
- tracker reaches `Done`
- workspace cleanup mode is correct

### Failure This Catches

- merge-result path drift
- mismatch between route completion and tracker state

## Golden Path 7

### Name

Approved merge run records blocked result

### Why It Matters

Blocked merge outcomes are normal.

They should be legible, not exceptional.

### Setup

- approved merge run active

### Transcript

- merge automation cannot complete safely
- agent calls `symphony tool merge-result --status blocked ...`

### Assertions

- merge result persisted
- issue moves to `Blocked`
- run ends with the correct blocked outcome

### Failure This Catches

- merge-result validation drift
- blocked merge path incorrectly treated as generic failure

## Golden Path 8

### Name

Paused provider failure resumes through external queueing

### Why It Matters

Provider interruptions should remain operable.

### Setup

- normal implementation run

### Transcript

- provider or runtime failure occurs

### Assertions

- issue moves to `Paused`
- router/workflow state remains coherent
- re-queueing via `Todo` or configured path works correctly

### Failure This Catches

- pause semantics accidentally conflicting with workflow authority

## Golden Path 9

### Name

Run emits final completion message and does not stall

### Why It Matters

This is the exact category of bug we observed.

### Setup

- run reaches what is effectively terminal completion
- there is no legitimate next command that should leave the run active

### Transcript

- agent outputs completion-style message
- optional valid completion command succeeds
- no further useful activity occurs

### Assertions

- run finalizes promptly
- no later stall timeout occurs
- route completion path executes exactly once

### Failure This Catches

- the `SYM-17` style incident class

## Golden Path 10

### Name

Invalid completion command fails explicitly and coherently

### Why It Matters

A contract violation should not become an ambiguous lifecycle story.

### Setup

- implementation or explicit-completion run

### Transcript

- agent calls invalid `finish` payload

### Assertions

- tool call failure is captured
- run is finalized into an explicit failure state or explicit blocked state according to policy
- the system does not simply drift into `stalled` after the invalid command unless a subsequent long-running command independently justifies that outcome

### Failure This Catches

- command contract errors degrading into misleading stall outcomes

## The First Three Tests We Should Build Immediately

If we only build three transcript-driven `.e2e.test.ts` cases first, they should be:

1. capability-managed implementation continues without `finish`
2. explicit-completion implementation uses valid `finish`
3. clarification requested then resumed

Why these three:

- they force us to clarify completion semantics
- they exercise both the new and old completion paths
- they harden the most likely control-plane disagreement

## Proposed `.e2e.test.ts` File Set

The file names below are deliberate.

They should map cleanly to product stories, not internal helper names.

### File 1

`apps/api/src/core/symphony-capability-progression.e2e.test.ts`

Responsibilities:

- capability-managed implementation continues
- capability-managed implementation reaches completion-ready state
- next capability dispatch behavior

### File 2

`apps/api/src/core/symphony-explicit-completion.e2e.test.ts`

Responsibilities:

- valid `finish` flow
- invalid `finish` flow
- delivery report persistence
- explicit `In Review` transitions

### File 3

`apps/api/src/core/symphony-clarification-loop.e2e.test.ts`

Responsibilities:

- clarification requested
- clarification answered
- attempt resumption
- pending clarification clearing

### File 4

`apps/api/src/core/symphony-review-rework-loop.e2e.test.ts`

Responsibilities:

- implementation to review
- review rework requested
- re-dispatch into rework or bootstrapping
- follow-up capability progression

### File 5

`apps/api/src/core/symphony-approved-merge.e2e.test.ts`

Responsibilities:

- merged merge-result flow
- blocked merge-result flow
- `Done` versus `Blocked`

### File 6

`apps/api/src/core/symphony-runtime-terminalization.e2e.test.ts`

Responsibilities:

- no false stalls after real completion
- stall only when command inactivity genuinely leaves the run hanging
- final command failure semantics

## Proposed Fixture Support Files

### File A

`apps/api/src/test-support/pi-transcript-fixtures.ts`

Responsibilities:

- load transcript JSON fixtures
- normalize event shape into runtime harness input
- expose helper builders

### File B

`apps/api/src/test-support/pi-transcript-replay.ts`

Responsibilities:

- feed transcript events into a fake Pi harness
- drive `createSymphonyAgentRuntime`
- surface completion and updates

### File C

`apps/api/src/test-support/export-runtime-transcript.ts`

Responsibilities:

- export selected real runs from `symphony.db`
- normalize IDs and timestamps
- write fixtures for review

### File D

`apps/api/src/test-support/pi-transcripts/`

Responsibilities:

- checked-in curated transcript fixtures

## Proposed Transcript Fixture Naming Convention

Use names that describe both lifecycle position and intended effect.

Examples:

- `implementation-capability-continues.json`
- `implementation-explicit-finish-completed.json`
- `implementation-explicit-finish-invalid-no-pr-url.json`
- `implementation-clarification-requested.json`
- `review-code-review-requests-changes.json`
- `approved-merge-merged.json`
- `approved-merge-blocked.json`
- `implementation-terminal-message-no-stall.json`

## Proposed Scenario IDs

Assign stable test IDs for future dashboards or export tooling.

Examples:

- `GP-001`
- `GP-002`
- `GP-003`
- `GP-004`
- `GP-005`
- `GP-006`
- `GP-007`
- `RG-001`
- `RG-002`

Where:

- `GP` means golden path
- `RG` means regression guard

## Phase 0: Freeze The Contract

Before writing new execution logic, we need to write down exactly what is true.

### Phase 0 Outputs

- accepted statement on when `finish` is valid
- accepted statement on capability-managed completion
- accepted statement on whether each router node should be reflected as a run narrative
- accepted statement on tracker state transitions for each lifecycle step
- accepted statement on what counts as a stall versus a coherent terminal failure

### Phase 0 Decisions To Make

- does capability-managed implementation ever call `finish`?
- if yes, under what exact planner states?
- if no, should prompt text stop mentioning `finish` for capability-managed runs entirely?
- should `finish` remain available only for non-capability-managed flows?
- if the agent invokes invalid `finish`, should the run fail immediately?
- should router node changes always create a new run record?

### My Recommendation For Phase 0

- capability-managed implementation and rework should not call `finish` unless the planner is explicitly in a completion-ready state
- prompt sections should be conditional on run type and workflow management mode
- invalid completion commands should become explicit failures, not silent precursors to later stalls
- each executed node-capability attempt should still surface as a readable run narrative

## Phase 1: Build The Transcript Fixture Layer

This phase creates the deterministic foundation.

### Phase 1 Goals

- make it easy to turn real incidents into replay fixtures
- make mocked Pi output replay a first-class testing surface
- remove the excuse to validate lifecycle semantics only with live tickets

### Phase 1 Tasks

- define transcript JSON schema
- build replay helper
- build export helper
- normalize event categories
- document fixture authoring rules

### Phase 1 Acceptance Criteria

- a real run can be exported into a normalized fixture
- the fixture can be replayed through a fake Pi runtime
- replay results are deterministic locally and in CI

## Phase 2: Implement The First Three Golden Paths

### Goal

Prove the most important lifecycle seams before more changes land.

### Test 1

Capability-managed implementation continues.

### Test 2

Explicit `finish` succeeds.

### Test 3

Clarification resumes.

### Phase 2 Acceptance Criteria

- all three tests pass locally
- all three tests fail when the corresponding contract is violated
- at least one test uses a fixture exported from a real run

## Phase 3: Align Prompt, Runtime, CLI, And Router

This phase removes split-brain behavior.

### Prompt Changes

Prompt text should become conditional.

It should say:

- for capability-managed implementation/rework:
  - complete the bounded step
  - do not assume `finish` is the completion boundary
  - the router will decide the next step
- for explicit-completion implementation/rework:
  - use `finish` with the correct payload
- for approved merge:
  - use `merge-result`

### Runtime Changes

Runtime completion logic should:

- treat capability-managed runs as planner-governed
- treat explicit-completion runs as command-governed
- fail invalid completion commands coherently

### CLI Changes

CLI behavior should:

- remain strict
- remain explicit
- present clear help text that `completed` requires `prUrl`
- not be described as universally required if that is no longer true

### Router Changes

Router behavior should:

- own the transition into review-ready completion for capability-managed flows
- continue dispatching the next capability when the workflow is not complete

## Phase 4: Add Remaining Golden Paths And Regressions

Once the first three tests are green, we should add:

- review rework loop
- approved merge merged
- approved merge blocked
- paused provider failure
- no false stall after valid completion
- invalid completion command terminalization

## Phase 5: Simplify Read Models And UI

Only after the control-plane contract is stable should we simplify the UI.

### UI Principle 1

Prefer plain, legible components over ambitious composite views.

### UI Principle 2

Use the run narrative as the main execution surface.

### UI Principle 3

Treat workflow observability as a simple explanation of:

- current node
- last route decision
- next expected step
- active run if any
- recent run narratives

### UI Principle 4

Do not ask the UI to repair backend ambiguity.

### UI Principle 5

Expose logs in structured grouped components, not giant blended panes.

## Phase 6: Delete Contradictory Code

This phase is critical.

We should plan for deletion, not just coexistence.

### Delete Or Rewrite Candidate Areas

- prompt instructions that universally require `finish`
- legacy assumptions that every implementation run ends in `In Review`
- UI logic that assumes route nodes and runs are unrelated
- defensive read-model logic that exists only because completion semantics are split
- helper code that duplicates route-completion reasoning outside the route workflow

### Delete Criteria

A code path is a deletion candidate if:

- it encodes a lifecycle truth contradicted by the frozen contract
- its only purpose is compatibility with pre-router assumptions
- its behavior is not exercised by the golden-path suite

## Detailed Lifecycle Contract Matrix

This matrix is the heart of the stabilization program.

It must become consistent across prompt, CLI, runtime, router, and UI.

### Run Kind Matrix

| Run kind | Capability-managed | Explicit command required | Expected explicit command |
| --- | --- | --- | --- |
| implementation with contract | yes | no by default | none unless planner-ready completion requires it |
| rework with contract | yes | no by default | none unless planner-ready completion requires it |
| implementation without contract | no | yes | `finish` |
| rework without contract | no | yes | `finish` |
| approved merge | no | yes | `merge-result` |
| spike/investigation | no | maybe | `spike-result` when parking outcome is explicit |

### Tracker Transition Matrix

| Event | Old assumption | Proposed authority | Proposed result |
| --- | --- | --- | --- |
| `Todo` observed | tracker queue | router | claim to `Bootstrapping` and dispatch |
| run started for implementation | runtime | router | move to `In Progress` |
| capability-managed implementation delivered | runtime/finish | router | either continue next capability or route to review-ready completion |
| explicit completion reported | `finish` | runtime-tools plus router | move to `In Review` |
| review requests rework | tracker or GitHub comment | router | move to `Rework` then `Bootstrapping` and dispatch |
| approved merge merged | merge command | router | move to `Done` |
| approved merge blocked | merge command | router | move to `Blocked` |
| provider interruption | runtime | orchestrator with router-aware observation | move to `Paused` |

## The `finish` Question

This deserves its own section.

### Is `finish` still valid?

Yes.

### Is it universally valid as the completion boundary for all implementation and rework runs?

No.

### What should `finish` mean after stabilization?

It should mean:

- an explicit reported delivery boundary for flows that still use explicit delivery reporting

It should not implicitly mean:

- every implementation or rework run must call this command before it can end

### Why This Matters

Because if the command remains described as universal while the runtime treats it as conditional, the agent will keep making invalid calls.

### The `SYM-17` Lesson

The exact failure sequence observed on `SYM-17` was:

- the agent finished the code and tests
- the agent attempted `finish --status completed` without `prUrl`
- the command failed validation
- no delivery report was recorded
- the run later stalled during a follow-up commit command

This incident demonstrates:

- the command is still active
- the command is still strict
- the prompt did not guide the agent correctly for that context
- the runtime did not cohere the failure into the clearest possible terminal story

## The Stall Question

Stalls should remain a real concept.

But they need clearer boundaries.

### A Stall Is

- a run that remains active without meaningful agent activity beyond the timeout

### A Stall Is Not

- an invalid completion command by itself
- a coherent delivery path that has already terminalized
- a valid run that has been explicitly completed but has not yet been projected correctly in the UI

### We Need To Distinguish

- explicit command validation failure
- provider transient interruption
- terminal failure
- true inactivity stall

### Recommended Rule

If the system can identify a concrete explicit failure that explains the broken run, prefer that explicit failure over later generic stall classification.

## The Node-As-Run Question

The product mental model is improved if each meaningful node execution is visible as a run narrative.

The router can still own the workflow graph.

The run store can still own the execution narrative.

These are compatible.

### Recommended Position

- keep node-level execution visible as runs
- treat each capability attempt as a run narrative
- do not collapse everything into one unreadable mega-run

### Why

- operators need a clean story
- users understand "this step ran"
- logs become legible
- history stays inspectable

### What Not To Do

- do not create a separate authority just because a node is a run
- do not let run narratives redefine workflow truth

## Read Model Strategy

The read model should project from stable control-plane records.

It should not invent lifecycle meaning.

### Read Model Responsibilities

- current workflow node
- current tracker state
- last route decision
- active run summary
- recent run narratives
- capability progression summary
- pending clarification if any
- next expected step if planner has one

### Read Model Should Avoid

- guessing whether `finish` should have been called
- inventing "completed" when only an agent message sounded complete
- hiding route inconsistencies
- merging unrelated logs into one pane just to look advanced

## UI Simplification Strategy

When UI work resumes after stabilization, it should follow these rules.

### Rule A

Default to small readable cards.

### Rule B

One card should answer one question.

### Rule C

Prefer sequence and grouping over novelty.

### Rule D

Keep the workflow graph and run narrative visually distinct.

### Rule E

Use the old run/turn mental model where it helps readability.

### Rule F

If data is empty, render a direct empty state.

### Rule G

Do not turn the issue detail page into one huge dashboard.

### Recommended Issue Detail Sections

- Issue header and current state
- Workflow summary
- Current step
- Recent route decisions
- Active run
- Recent runs
- Clarifications and blockers
- Failure signals when relevant

## Proposed E2E Harness Architecture

The `.e2e.test.ts` layer should not spin up the whole web UI.

It should focus on the control-plane loop.

### Inputs

- fake tracker issue
- route workflow store
- run store
- delivery report store
- fake Pi transcript
- runtime policy fixture

### Execution

- drive dispatch bootstrap
- activate run start
- replay transcript through fake Pi harness
- capture runtime completion
- route completion
- inspect resulting stores and tracker state

### Outputs

- run outcome
- tracker state
- route projection
- next dispatch behavior
- persisted artifacts

## Recommended Harness Layers

### Layer 1

Transcript fixture loader

### Layer 2

Fake Pi session client

### Layer 3

Runtime harness wrapper

### Layer 4

Workflow lifecycle harness

### Layer 5

Assertions over stores and tracker state

## Specific Paths To Reuse

We already have useful seams.

Reuse:

- fake Pi binary helpers in `agent-harness-runtime.int.test.ts`
- route lifecycle harnesses in `runtime-route-lifecycle-service.int.test.ts`
- route replay fixture concepts in `packages/router`

Do not reinvent those seams from scratch unless the current helpers are actively misleading.

## Proposed Test Naming Style

Use complete lifecycle statements.

Examples:

- `it("continues capability-managed implementation into code review without requiring finish", ...)`
- `it("moves non-capability-managed implementation into In Review after valid finish", ...)`
- `it("resumes the same capability after clarification is answered", ...)`
- `it("routes review-requested rework back into bootstrapping and redispatches implementation", ...)`
- `it("records an invalid finish attempt as explicit failure instead of drifting into ambiguous stall", ...)`

## Proposed Assertion Strategy

Every golden path should assert at least five categories:

1. runtime completion kind
2. tracker state
3. workflow projection
4. persisted artifact state
5. next dispatch behavior

Optional sixth category:

6. readable run narrative summary

## Proposed Store Assertions

Golden-path tests should query and assert:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- `symphony_agent_event_log`
- `symphony_issue_delivery_reports` when relevant
- `route_history_events`
- `route_projection_snapshots`

## Proposed Negative Assertions

Every golden path should also assert at least one thing that must not happen.

Examples:

- no delivery report should exist
- tracker should not reach `In Review`
- no pause comment should be created
- no additional dispatch should occur
- no terminal failure should be recorded

## Proposed Failure-First Regression Coverage

The following regressions should be encoded quickly:

- invalid completed `finish` without `prUrl`
- missing `merge-result` for approved merge
- clarification answer does not resume planning
- review rework request does not redispatch
- explicit completion succeeds but later stall still triggers
- project-less Linear issue remains invisible to the queue

## Proposed Incident-To-Fixture Process

When a live issue exposes a bug:

1. identify the run ID
2. export the runtime transcript
3. export associated route history
4. normalize into a fixture
5. add a regression `.e2e.test.ts`
6. reproduce the failure
7. implement the fix
8. keep the fixture forever unless the contract intentionally changes

This should become standard operating procedure.

## Proposed Work Breakdown

Below is the recommended implementation program.

### Track 1: Contract Hardening

- write contract addendum or ADR for capability-managed completion
- update prompt contract docs
- update runtime-tools README
- align route lifecycle docs

### Track 2: Test Infrastructure

- add transcript schema
- add export helper
- add replay helper
- add first three `.e2e.test.ts` files

### Track 3: Runtime Alignment

- adjust prompt generation
- adjust runtime completion decision boundaries
- adjust invalid completion command terminalization

### Track 4: Router Alignment

- verify capability completion continuation
- verify completion-ready routing
- verify clarification resume semantics

### Track 5: Read Model And UI Simplification

- simplify issue detail sections
- surface current step, recent route decisions, and recent runs plainly
- remove over-ambitious composition

### Track 6: Deletion

- remove contradictory prompt text
- remove contradictory UI logic
- remove stale fallback logic where safe

## Phase-By-Phase Detailed Checklist

### Phase 0 Checklist

- document capability-managed completion rule
- document explicit-completion rule
- document valid `finish` usage
- document valid `merge-result` usage
- document stall classification preference
- document node/run mental model
- document tracker state transitions
- document review rework lifecycle
- document clarification resume semantics
- get agreement before new behavior work

### Phase 1 Checklist

- create transcript fixture directory
- define fixture loader
- define fixture schema
- define normalization helper
- define export helper
- define fake Pi replay adapter
- define test harness glue
- document fixture naming rules
- document fixture authoring rules
- document incident export process

### Phase 2 Checklist

- implement capability continuation golden path
- implement explicit finish golden path
- implement clarification resume golden path
- run locally
- run in CI
- verify failing mutations actually fail

### Phase 3 Checklist

- update prompt sections
- update prompt tests
- update runtime completion logic if needed
- update runtime tool help text if needed
- update relevant docs
- validate against golden paths

### Phase 4 Checklist

- implement review rework loop golden path
- implement approved merge merged golden path
- implement approved merge blocked golden path
- implement invalid finish regression
- implement no-false-stall regression

### Phase 5 Checklist

- reduce issue detail complexity
- group run narrative clearly
- surface workflow current step clearly
- surface recent route decisions clearly
- surface clarification state clearly
- stop mixing all logs into one hard-to-read block

### Phase 6 Checklist

- identify redundant completion logic
- identify stale prompt instructions
- identify obsolete UI components
- identify helper paths unused by golden-path coverage
- delete or rewrite them

## Detailed Proposed Test Matrix

This matrix is intentionally longer than the first milestone.

It helps us see the full test surface.

### Category: Queue And Dispatch

- queue claims `Todo` into `Bootstrapping`
- queue ignores project-less ticket
- queue respects excluded project IDs
- queue respects disabled workflow label
- queue respects worker assignment
- queue reopens paused work from `Todo`
- queue reopens rework from `Todo`
- queue does not redispatch already-claimed issue

### Category: Run Start

- bootstrapping activation moves to `In Progress`
- restart while dispatch settling does not duplicate run start
- stale dispatch settlement does not regress active projection

### Category: Capability Progression

- implementation continues to code review
- implementation continues to adversarial tests after review
- implementation reaches completion-ready planner state
- review blocked state is recorded properly
- review requested changes returns to implementation

### Category: Clarification

- clarification request parks planner in awaiting-input state
- clarification answer clears pending clarification
- clarification answer creates a new attempt
- stale clarification request does not keep capability permanently active

### Category: Explicit Completion

- valid completed finish records delivery and moves to review
- valid blocked finish records blocker and moves to blocked
- valid partial finish records partial without invalid state transition
- invalid completed finish without PR URL fails
- invalid blocked finish without blocking reason fails

### Category: Merge

- valid merged merge-result reaches `Done`
- valid blocked merge-result reaches `Blocked`
- missing merge-result fails merge run coherently

### Category: Failures

- provider transient pauses correctly
- startup failure moves to `Failed`
- explicit runtime failure pauses correctly
- invalid completion command yields explicit failure
- true inactivity stall yields `stalled`
- false stall after already-terminal completion never occurs

### Category: Read Model

- workflow observability shows current node
- workflow observability shows recent decisions
- workflow observability shows empty state when there is no history
- issue detail shows latest runs when runs exist
- issue detail does not synthesize fake workflow progress

## Proposed Fixture Taxonomy

The fixture set should be organized by lifecycle domain.

### `pi-transcripts/implementation/`

- `capability-continues.json`
- `capability-completes-workflow.json`
- `explicit-finish-completed.json`
- `explicit-finish-invalid-no-pr-url.json`
- `clarification-requested.json`

### `pi-transcripts/review/`

- `code-review-completed.json`
- `code-review-requests-changes.json`

### `pi-transcripts/merge/`

- `approved-merge-merged.json`
- `approved-merge-blocked.json`

### `pi-transcripts/failure/`

- `provider-transient.json`
- `true-stall.json`
- `terminal-message-no-stall.json`

## Proposed Fixture Review Rules

Every new fixture should be reviewed for:

- realistic event sequence
- minimal noise
- stable naming
- clear expectation
- clear reason to exist

Reject fixtures that:

- merely duplicate an existing scenario
- depend on irrelevant noisy events
- cannot explain what lifecycle contract they are proving

## Proposed Test Helper API

An eventual helper API could look like this:

```ts
const scenario = await loadPiTranscriptFixture("implementation/capability-continues");

const result = await runSymphonyGoldenPathScenario({
  fixture: scenario,
  issueState: "Todo",
  contractFixture: "strict-implementation-with-review"
});

expect(result.runtimeCompletion).toEqual({ kind: "delivered" });
expect(result.workflow.currentNode).toBe("implementation");
expect(result.nextPlanning.capabilityId).toBe("critic.code_review");
expect(result.tracker.state).toBe("In Progress");
```

## Proposed DB Export Queries

These are illustrative only.

```sql
select *
from symphony_runs
where issue_identifier = 'SYM-17'
order by started_at desc;
```

```sql
select *
from symphony_events
where run_id = 'd2aa9e98-d456-4cfd-895d-980625a5eac3'
order by event_sequence;
```

```sql
select *
from symphony_agent_event_log
where run_id = 'd2aa9e98-d456-4cfd-895d-980625a5eac3'
order by sequence;
```

```sql
select *
from symphony_agent_command_executions
where run_id = 'd2aa9e98-d456-4cfd-895d-980625a5eac3'
order by started_at;
```

```sql
select *
from route_history_events
where workflow_id = ?
order by sequence;
```

## Proposed Fixture Normalization Checklist

- remove real run IDs
- remove real issue identifiers unless they are intentionally part of the scenario
- remove machine-specific paths
- remove process IDs
- remove unrelated commands
- keep commands that explain terminal behavior
- keep tool-call failures that matter
- keep reasoning summaries when they explain the scenario
- trim huge command outputs unless the output content is under assertion

## Immediate Fixes That Should Follow The First E2E Tests

These are likely, though the tests should prove them first.

### Fix Candidate 1

Prompt sections should branch on capability-managed versus explicit-completion mode.

### Fix Candidate 2

Invalid `finish` attempts should be terminalized more coherently.

### Fix Candidate 3

The UI should stop trying to collapse multiple distinct concepts into one panel.

### Fix Candidate 4

The issue detail workflow view should lead with:

- current step
- next expected step
- recent step history

and only then show deep logs.

### Fix Candidate 5

The run narrative should remain the primary execution artifact for each capability attempt.

## What We Expect To Cut Later

This section is intentionally forward-looking.

We should expect deletion after stabilization.

### Likely Deletion Area 1

Prompt text and tests that encode universal `finish` assumptions.

### Likely Deletion Area 2

Fallback logic that assumes implementation always transitions directly to review on delivery.

### Likely Deletion Area 3

UI composition created before the route/read-model contract settled.

### Likely Deletion Area 4

Ad hoc helper code created to bridge disagreement between route lifecycle and runtime completion.

### Likely Deletion Area 5

Documentation written from the old universal explicit-completion model.

## The Chopping Block Principle

After the router is proven by golden-path tests, anything that does not cleanly fit the router-first authority model should be considered expendable.

This is not optional cleanup.

This is how the system gets smaller and saner.

## Open Questions We Need To Resolve Deliberately

### Question 1

Should capability-managed implementation ever invoke `finish` directly?

### Question 2

If yes, is that only when the planner is in a completion-ready state?

### Question 3

Should `partial` delivery stay valid for capability-managed runs?

### Question 4

Should invalid completion command usage immediately finalize the run as failed?

### Question 5

Should every capability attempt create a new run ID?

### Question 6

Should a route node always correspond one-to-one with a run?

### Question 7

Should the tracker state ever jump to `In Review` without a persisted delivery or planner-owned completion event?

### Question 8

Should the UI show planner state directly, or only a simplified projection of it?

### Question 9

Do we want separate operator pages for:

- workflow
- runs
- logs

rather than one giant issue detail?

### Question 10

Should a failed `finish` command itself be reflected as a structured failure artifact in the run narrative read model?

## My Recommended Answers To The Open Questions

### Recommended Answer 1

Capability-managed implementation and rework should not invoke `finish` by default.

### Recommended Answer 2

If `finish` remains available, it should only be used when the planner or runtime mode says the workflow is at an explicit completion boundary.

### Recommended Answer 3

`partial` should remain an explicit operator/runtime result, not a default capability-managed outcome.

### Recommended Answer 4

Invalid completion commands should be surfaced as explicit failures, not just generic command noise.

### Recommended Answer 5

Each capability attempt should be visible as its own run narrative, whether or not the run ID model stays exactly one-to-one.

### Recommended Answer 6

The route node and run relationship should optimize for operator clarity, not theoretical purity.

### Recommended Answer 7

No tracker transition to `In Review` should happen without a durable control-plane reason.

### Recommended Answer 8

The UI should show a simplified planner projection, not raw planner internals by default.

### Recommended Answer 9

Yes, the interface should eventually split into more focused views.

### Recommended Answer 10

Yes, failed completion commands should become legible structured artifacts.

## Risk Register

### Risk 1

We preserve too much compatibility and never fully freeze the new contract.

Mitigation:

- make golden-path tests the authority
- delete code that disagrees

### Risk 2

We build E2E tests that are too synthetic and not representative.

Mitigation:

- export at least some real fixtures from `symphony.db`

### Risk 3

We overfit to current incidents and miss fundamental contract ambiguity.

Mitigation:

- keep the lifecycle matrix explicit
- review each new fix against the contract, not just the incident

### Risk 4

We keep adding UI while backend semantics are still moving.

Mitigation:

- pause ambitious UI work until the first golden-path suite is green

### Risk 5

We accept large code additions without a planned deletion phase.

Mitigation:

- make deletion a formal phase of the program

## Acceptance Criteria For The Stabilization Program

The stabilization program is successful when all of the following are true.

### Contract Criteria

- one documented completion model exists for each run type
- prompt text agrees with runtime behavior
- CLI help agrees with runtime behavior
- route completion logic agrees with runtime behavior

### Test Criteria

- the first three golden-path `.e2e.test.ts` files pass
- at least six full golden-path/regression scenarios pass
- a real exported incident fixture exists in the suite
- failures are deterministic and easy to interpret

### Runtime Criteria

- capability-managed runs continue correctly
- explicit-completion runs finish correctly
- clarification loops resume correctly
- approved merge flows finalize correctly
- invalid completion commands do not silently drift

### UI Criteria

- issue detail renders current workflow progress legibly
- run narratives are easy to scan
- workflow observability data is present and simple
- no component tries to compensate for backend ambiguity

### Deletion Criteria

- at least one contradictory completion assumption is removed
- at least one UI surface is simplified
- at least one stale compatibility path is deleted

## Recommended Sequencing For Actual Code Work

This is the implementation order I would follow after this document is accepted.

1. add transcript fixture support
2. add `symphony-capability-progression.e2e.test.ts`
3. add `symphony-explicit-completion.e2e.test.ts`
4. add `symphony-clarification-loop.e2e.test.ts`
5. fix prompt/runtime/CLI disagreements until those tests pass
6. add review rework and merge tests
7. simplify UI around the stabilized read model
8. start deleting contradictory code

## Concrete Code Areas Likely To Change

### Prompt

- `packages/runtime-contract/src/prompt-sections.ts`
- `apps/api/src/core/symphony-prompt.ts`
- corresponding tests

### Runtime Completion

- `apps/api/src/core/agent-harness-runtime.ts`
- `apps/api/src/core/symphony-capability-run-completion.ts`
- `apps/api/src/core/runtime-route-lifecycle-service.ts`

### Runtime Tools

- `packages/runtime-tools/src/index.ts`
- `apps/cli/src/commands/tool/finish.ts`
- CLI tests if wording or validation changes

### Orchestrator

- `packages/orchestrator/src/symphony-orchestrator.ts`
- stall and terminalization handling

### Read Model And UI

- runtime observability serializers
- issue detail view components
- workflow observability view components

## Proposed Documentation Follow-Ups

If the stabilization work succeeds, these docs should be updated:

- `docs/architecture/2026-04-11-lifecycle-authority-matrix.md`
- `docs/adr/2026-04-08-runtime-result-command-contract.md`
- `docs/architecture/symphony-runtime-operations.md`
- `packages/runtime-tools/README.md`
- `packages/runtime-contract/README.md` if it references completion instructions directly

## Proposed Developer Workflow Going Forward

### For New Router Work

- write or update a golden-path test first
- then change the code
- then run the local smoke ticket

### For Incidents

- export transcript
- add regression fixture
- prove failure
- fix
- keep fixture

### For UI Changes

- do not invent new semantics
- render existing read model plainly
- request backend changes if data is insufficient

## Appendix A: Example Transcript Export Checklist

- identify issue identifier
- identify run ID
- query run row
- query event rows
- query command execution rows
- query delivery report rows if any
- query route history for same workflow
- copy raw output into temp scratch file
- normalize paths
- normalize IDs
- trim noise
- verify ordering
- annotate expected result
- check in fixture

## Appendix B: Example Real-Incident Conversion Flow

Using `SYM-17` as a template incident:

1. locate run row
2. confirm terminal outcome
3. confirm whether a delivery report exists
4. inspect command executions
5. identify the meaningful terminal sequence
6. isolate:
   - successful tests
   - invalid completion command
   - follow-up command
   - later stall
7. decide what contract should have happened
8. convert to regression fixture
9. write `.e2e.test.ts`
10. implement fix

## Appendix C: Example Scenario Documentation Template

```md
## Scenario ID

GP-001

## Scenario Name

Capability-managed implementation continues to review

## Initial State

- tracker state: Todo
- workflow preset: current-flow
- contract: strict implementation with review

## Transcript Source

- synthetic
- or exported from run X

## Expected Runtime Completion

- delivered

## Expected Workflow Projection

- current node: implementation
- next planner kind: execute
- next capability: critic.code_review

## Expected Tracker State

- In Progress

## Expected Next Dispatch

- implementation run requested

## Non-Goals

- does not assert UI rendering
```

## Appendix D: Example Minimal Fake Pi Transcript

```json
{
  "events": [
    {
      "type": "session.started",
      "payload": {
        "thread_id": "thread_001",
        "turn_id": "turn_001"
      }
    },
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "reasoning_001",
          "type": "reasoning",
          "text": "Applying the requested implementation."
        }
      }
    },
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "file_change_001",
          "type": "file_change",
          "path": "/workspace/src/example.ts"
        }
      }
    },
    {
      "type": "turn_end",
      "payload": {
        "message": {
          "usage": {
            "input": 50,
            "cacheRead": 0,
            "output": 20
          }
        }
      }
    }
  ]
}
```

## Appendix E: Example Invalid Finish Transcript Fragment

```json
{
  "events": [
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "agent_message_001",
          "type": "agent_message",
          "text": "All tests pass. Let me record the delivery using the Symphony finish command."
        }
      }
    },
    {
      "type": "item.started",
      "payload": {
        "item": {
          "id": "command_001",
          "type": "command_execution",
          "command": "pnpm exec symphony tool finish --status completed --summary \"Done.\""
        }
      }
    },
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "command_001",
          "type": "command_execution",
          "status": "failed",
          "aggregated_output": "{ \"error\": { \"message\": \"`symphony tool finish` requires `prUrl` when status is `completed`.\" } }"
        }
      }
    }
  ]
}
```

## Appendix F: Example Valid Finish Transcript Fragment

```json
{
  "events": [
    {
      "type": "item.started",
      "payload": {
        "item": {
          "id": "command_finish_valid",
          "type": "command_execution",
          "command": "pnpm exec symphony tool finish --status completed --summary \"Implemented the requested change.\" --pr-url \"https://github.com/openai/symphony/pull/123\""
        }
      }
    },
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "command_finish_valid",
          "type": "command_execution",
          "status": "completed",
          "aggregated_output": "{ \"recorded\": true, \"issueStateTransition\": { \"targetState\": \"In Review\", \"success\": true } }"
        }
      }
    }
  ]
}
```

## Appendix G: Example Clarification Fixture Shape

```json
{
  "name": "implementation-clarification-requested",
  "initial": {
    "trackerState": "In Progress",
    "runMode": "implementation",
    "capabilityManaged": true,
    "contractFixture": "implementation-with-required-clarification"
  },
  "events": [
    {
      "type": "item.completed",
      "payload": {
        "item": {
          "id": "agent_message_clarification",
          "type": "agent_message",
          "text": "I need clarification before I can safely continue."
        }
      }
    },
    {
      "type": "turn_end",
      "payload": {
        "message": {
          "usage": {
            "input": 100,
            "cacheRead": 0,
            "output": 40
          }
        }
      }
    }
  ],
  "expect": {
    "runtimeCompletion": {
      "kind": "clarification_requested"
    },
    "workflow": {
      "plannerKind": "awaiting_input"
    }
  }
}
```

## Appendix H: Example Test Skeleton For Capability Continuation

```ts
import { describe, expect, it } from "vitest";
import { loadPiTranscriptFixture } from "../test-support/pi-transcript-fixtures.js";
import { runSymphonyGoldenPathScenario } from "../test-support/pi-transcript-replay.js";

describe("capability progression golden paths", () => {
  it("continues capability-managed implementation into code review without requiring finish", async () => {
    const fixture = await loadPiTranscriptFixture("implementation/capability-continues");

    const result = await runSymphonyGoldenPathScenario({
      fixture,
      issueState: "Todo",
      contractFixture: "strict-implementation-with-review"
    });

    expect(result.runtimeCompletion).toEqual({ kind: "delivered" });
    expect(result.tracker.state).toBe("In Progress");
    expect(result.workflow.nextPlanningKind).toBe("execute");
    expect(result.workflow.nextCapabilityId).toBe("critic.code_review");
    expect(result.deliveryReports).toHaveLength(0);
  });
});
```

## Appendix I: Example Test Skeleton For Explicit Finish

```ts
describe("explicit completion golden paths", () => {
  it("moves non-capability-managed implementation into In Review after valid finish", async () => {
    const fixture = await loadPiTranscriptFixture("implementation/explicit-finish-completed");

    const result = await runSymphonyGoldenPathScenario({
      fixture,
      issueState: "Todo",
      contractFixture: null
    });

    expect(result.runtimeCompletion).toEqual({ kind: "delivered" });
    expect(result.tracker.state).toBe("In Review");
    expect(result.deliveryReports).toHaveLength(1);
    expect(result.workflow.currentNode).toBe("review");
  });
});
```

## Appendix J: Example Test Skeleton For Invalid Finish Regression

```ts
describe("completion regressions", () => {
  it("does not let invalid completed finish drift into ambiguous completion semantics", async () => {
    const fixture = await loadPiTranscriptFixture("implementation/explicit-finish-invalid-no-pr-url");

    const result = await runSymphonyGoldenPathScenario({
      fixture,
      issueState: "In Progress",
      contractFixture: null
    });

    expect(result.deliveryReports).toHaveLength(0);
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("requires `prUrl`")
      })
    );
  });
});
```

## Appendix K: Example Path Mapping Between Product Stories And Test Files

- "The router picks the next best step after implementation" -> `symphony-capability-progression.e2e.test.ts`
- "Legacy/manual flow still finishes into review" -> `symphony-explicit-completion.e2e.test.ts`
- "Clarification loops work" -> `symphony-clarification-loop.e2e.test.ts`
- "Review feedback loops work" -> `symphony-review-rework-loop.e2e.test.ts`
- "Approved merge works" -> `symphony-approved-merge.e2e.test.ts`
- "Terminalization is coherent" -> `symphony-runtime-terminalization.e2e.test.ts`

## Appendix L: Decision Rules For Deletion After Stabilization

Delete a code path if:

- it is not exercised by the golden-path suite
- it contradicts the frozen lifecycle matrix
- it exists only to support the old universal explicit-completion story
- it exists only because the UI was compensating for backend ambiguity
- it duplicates route workflow authority

Keep a code path if:

- it clearly belongs to the frozen contract
- it is covered by golden-path or regression tests
- it materially improves operator legibility without changing semantics

## Appendix M: What Success Should Feel Like

When this program is complete, we should be able to say:

- we can replay the most important Symphony workflows deterministically
- we know exactly when `finish` is valid and when it is not
- we know exactly when a capability-managed run continues versus completes
- a real incident can be converted into a fixture in under an hour
- the UI tells a simple truthful story instead of a decorative one
- the codebase is smaller because we deleted contradictory paths

## Final Position

The router program should not be abandoned.

It should be hardened.

The right move is not:

- revert to pre-router assumptions

The right move is:

- commit to the router fully
- stabilize it with transcript-driven golden-path `.e2e.test.ts` coverage
- align every completion contract around those tests
- then cut aggressively

That is the path most likely to produce a simpler, saner Symphony.
