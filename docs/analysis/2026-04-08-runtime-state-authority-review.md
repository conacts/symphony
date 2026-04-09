# Runtime State Authority Review

Date: 2026-04-08

## Goal

Review the current runtime state machine from the tracker layer down through the orchestrator,
runtime store, analytics store, delivery tools, and forensics model.

The main question is simple:

- which layer owns which state
- which transitions are canonical
- which names still describe legacy mechanics instead of current product meaning

This review is deliberately critical. The current system works, but the state model is spread across
too many vocabularies and a few of the mappings are actively contradictory.

## Intended Model

The docs establish a fairly clear intent:

- issue workflow state should be explicit and operator-readable
- run completion should be defined by an explicit delivery boundary
- blocked work should remain distinct from paused platform failures
- paused, blocked, failed, and in-review work should preserve the durable workspace by default
- merge runs should stay distinct from normal implementation runs

Relevant references:

- `docs/architecture/durable-issue-workspace-state-machine.md`
- `docs/architecture/symphony-linear-ticket-lifecycle.md`
- `docs/architecture/symphony-agent-run-lifecycle-spec.md`

## Actual State Stack Today

Today the runtime uses at least six overlapping state vocabularies:

1. Tracker issue state

- `Todo`
- `Bootstrapping`
- `In Progress`
- `Rework`
- `Approved`
- `In Review`
- `Blocked`
- `Paused`
- `Failed`
- `Done`
- `Canceled`

2. Run mode

- `implementation`
- `rework`
- `approved_merge`

3. Orchestrator completion kind

- `normal`
- `merge_blocked`
- `max_turns_reached`
- `startup_failure`
- `rate_limited`
- `provider_transient`
- `stalled`
- `failure`

4. Persisted runtime run status

- `dispatching`
- `running`
- `finished`
- `paused`
- `failed`
- `startup_failed`
- `rate_limited`
- `stalled`
- `stopped`

5. Persisted runtime run outcome

- `completed_turn_batch`
- `merge_blocked`
- `paused_max_turns`
- `startup_failed`
- `rate_limited`
- `provider_transient`
- `stalled`
- `failed`
- plus shutdown and stop outcomes such as `runtime_shutdown`, `run_stopped_inactive`, and
  `run_stopped_terminal`

6. Delivery and merge result statuses

- delivery: `completed`, `blocked`, `partial`
- merge result: `merged`, `blocked`

There is no single file that defines the full mapping end to end. That is the first structural
problem.

## Current Transition Reality

### Dispatch and Activation

- The tracker config treats `Todo`, `Bootstrapping`, `In Progress`, `Rework`, and `Approved` as
  dispatchable.
- A persisted run is created with status `dispatching` before workspace preparation completes.
- `Bootstrapping` transitions to `In Progress` at activation time.
- `Approved` merge runs also transition to `In Progress` at activation time.

This means issue state is currently serving two jobs at once:

- workflow visibility for humans
- dispatch eligibility for the runtime

That is workable, but it is not currently described as a first-class design rule.

### Successful Implementation Completion

- The runtime tool `finish` records a delivery report.
- If the delivery report status is `completed`, the runtime completion becomes `normal`.
- The run is finalized with runtime status `finished`, runtime outcome `completed_turn_batch`, and
  agent analytics status `completed`.
- The issue is expected to move to `In Review`.

### Successful Merge Completion

- The merge tool records a merge result.
- If the merge result status is `merged`, the runtime completion also becomes `normal`.
- The run is finalized with the same runtime outcome, `completed_turn_batch`.
- The issue is then moved to `Done`.

So two meaningfully different product successes share the same persisted runtime outcome.

### Failure and Stop Paths

- `max_turns_reached` becomes runtime status `paused`, outcome `paused_max_turns`
- `startup_failure` becomes runtime status `startup_failed`, outcome `startup_failed`
- `rate_limited` becomes runtime status `rate_limited`, outcome `rate_limited`
- `provider_transient` becomes runtime status `failed`, outcome `provider_transient`
- `stalled` becomes runtime status `stalled`, outcome `stalled`
- generic `failure` becomes runtime status `failed`, outcome `failed`
- `merge_blocked` becomes runtime status `failed`, outcome `merge_blocked`

These mappings are inconsistent about what `status` means:

- sometimes it describes a phase-like bucket such as `running`
- sometimes it describes a failure category such as `rate_limited`
- sometimes it duplicates `outcome`
- sometimes it is broader than `outcome`

That makes `status` and `outcome` hard to reason about as separate axes.

## High-Signal Findings

### 1. `status` and `outcome` are not cleanly separated concepts

The current mapping uses `status` and `outcome` inconsistently.

Examples:

- `rate_limited` appears as both status and outcome
- `stalled` appears as both status and outcome
- `startup_failed` appears as both status and outcome
- `provider_transient` uses status `failed` but outcome `provider_transient`
- success always uses status `finished` but a business-opaque outcome, `completed_turn_batch`

Why this matters:

- readers have to know both fields to understand one run
- UI code cannot rely on one clear semantic axis
- analytics filters become guesswork over historical aliases

Opinion:

- `status` should be phase-like
- `result` or `terminalReason` should be semantic
- current `outcome` is trying to do both compatibility and semantics at once

### 2. `completed_turn_batch` is the wrong success name for the current product

The lifecycle docs say success is defined by explicit delivery or explicit merge completion.
But the persisted success outcome is still `completed_turn_batch`.

That name describes an implementation detail, not the business boundary.

Problems:

- it does not say whether the run submitted work for review or completed a merge
- it reads like a generic turn-processing success
- it leaks an internal runtime interpretation into the main analytics surface

Recommendation:

- split successful results into explicit business outcomes, such as:
  - `submitted_for_review`
  - `merge_completed`
- keep compatibility mapping at the read boundary if older rows must remain readable

### 3. `finish --status blocked` currently routes repo-owned blocked work into a platform-style failure path

The runtime tool accepts delivery statuses `completed`, `blocked`, and `partial`.
But in `apps/api/src/core/agent-harness-runtime.ts`, `blocked` is mapped to completion kind
`failure`, not to a blocked-specific completion kind.

That then flows through the orchestrator’s generic failure path, which moves normal implementation
runs to `Paused`, not `Blocked`.

This is a direct semantic mismatch:

- docs say `Blocked` is agent/repo-owned
- code currently turns a blocked delivery report into a generic runtime failure
- the resulting issue state for normal runs becomes `Paused`

That is one of the clearest “simple bugs caused by fuzzy state semantics” in the current model.

Recommendation:

- add an explicit completion kind for repo-owned blocked implementation runs
- map `finish --status blocked` to that completion kind
- transition the issue to `Blocked`, not `Paused`

### 4. `partial` delivery is under-defined and likely too fuzzy to keep as-is

`partial` currently exists as a valid delivery report status, but it is treated as another generic
runtime failure.

The problem is conceptual:

- if the work is review-ready, it is `completed`
- if the work cannot continue, it is `blocked`
- if the runtime/platform failed, it is `paused` or `failed`

It is not obvious what durable product meaning `partial` adds beyond ambiguity.

Recommendation:

- either remove `partial` from the terminal delivery tool
- or define it as a first-class state with explicit operator meaning and follow-up behavior

Right now it behaves like a vague synonym for “not done,” which is not a strong enough contract.

### 5. A successful delivery can be recorded even when the issue transition to `In Review` fails

The `finish` tool records the delivery report first and only then attempts to transition the issue
to `In Review`.

If the tracker transition fails:

- the tool still returns a success payload
- the delivery report remains persisted
- the runtime loop still sees an explicit delivery report and finalizes the run as `normal`

This means one run can be recorded as successfully delivered while the issue remains in a
dispatchable state such as `In Progress`.

That is a dangerous integrity gap because it can lead to duplicate reruns of already-delivered work.

Recommendation:

- the canonical completion boundary must include both:
  - durable delivery recording
  - successful tracker transition to the expected workflow state
- if the tracker transition fails, the run should not finalize as a normal success

### 6. Approved merge runs do not stay visibly distinct in tracker state

The docs say `Approved` is merge-only execution state and describe `Approved -> Done` as the
relevant success transition.

The code currently does this instead:

- dispatch from `Approved`
- immediately transition `Approved -> In Progress`
- allow the approved merge run to continue while the issue is now indistinguishable from normal
  implementation in tracker state
- on success, move `In Progress -> Done`

That hides merge-mode semantics in the most operator-visible layer.

Recommendation:

- keep the issue in `Approved` during active merge execution
- if active-run visibility is needed, persist it in run state, not by erasing the merge-only issue
  state

### 7. Workspace cleanup behavior contradicts the durable workspace docs

The durability docs explicitly say:

- state changes must not secretly destroy workspace state
- `Paused`, `Blocked`, and `Failed` preserve workspace by default
- `In Review` is a hard stop for operator review
- only `Done` should eagerly teardown after final artifact capture

The orchestrator currently destroys the workspace for any issue that is not dispatchable.
That includes:

- `Paused`
- `Blocked`
- `Failed`
- `In Review`

So the current code path is aligned with “preserve active compute only,” not with the documented
durable issue workspace model.

This is not a small wording mismatch. It changes the product.

Recommendation:

- decide which contract is real
- if the durable workspace model is the target, `shouldDestroyWorkspaceForStoppedIssue` must stop
  using dispatchability as the destruction rule
- workspace destruction should be driven by an explicit teardown policy, not by generic issue
  ineligibility

### 8. Startup failure naming still carries stale vocabulary

Startup failure comments still use the label `startup_failed_backlog` whenever a startup-failure
state transition is configured, even though the configured default target state is `Failed`.

That is stale compatibility language leaking into live behavior.

Recommendation:

- remove `startup_failed_backlog`
- use names that match the real target state and current product semantics

### 9. The issue state model is acting as both workflow and liveness

Because `In Progress` and `Bootstrapping` are dispatchable states, an issue may be:

- visibly `In Progress`
- not currently hot/running
- still eligible for dispatch or resume

That may be correct, but it needs to be explicit.

Right now the phrase “In Progress” can mean:

- actively executing right now
- previously active but no current worker attached
- resumable implementation state

Recommendation:

- stop treating issue state as a proxy for live execution presence
- make live execution presence a runtime concern
- let issue state describe workflow intent and ownership boundaries only

### 10. Run start semantics still mix bootstrap time and active execution time

A persisted run record is created before workspace preparation completes, with initial status
`dispatching`.

That means run timing currently includes:

- claim time
- workspace preparation
- before-run hooks
- runtime launch
- actual implementation time

This is not inherently wrong, but the lifecycle docs talk about bootstrapping and active execution
as different concepts, and the metrics docs also want bootstrap duration explicitly.

Recommendation:

- keep `startedAt` if desired, but add a clearer active-execution boundary such as `executionStartedAt`
- do not force readers to infer bootstrap duration from event streams alone

## Canonical Ownership Proposal

### 1. Issue State

Owner: tracker

Meaning:

- operator-visible workflow contract
- ownership boundary between platform, agent, and human

It should not be the source of truth for whether a hot worker is currently attached.

### 2. Run Mode

Owner: runtime dispatch

Meaning:

- immutable intent captured at dispatch time
- `implementation`, `rework`, or `approved_merge`

This should stay frozen for the lifetime of the run.

### 3. Run Phase

Owner: runtime store

Recommended shape:

- `dispatching`
- `running`
- `ended`
- `stopped`

This should answer only “where is the run in its lifecycle?”

### 4. Run Result

Owner: runtime store

Recommended shape:

- `submitted_for_review`
- `merge_completed`
- `blocked`
- `paused_max_turns`
- `paused_rate_limited`
- `paused_stalled`
- `startup_failed`
- `runtime_failed`
- `stopped_inactive`
- `stopped_terminal`
- `runtime_shutdown`

This should answer only “how did the run end?”

### 5. Failure Bucket / Reason

Owner: runtime store

Meaning:

- machine-readable finer-grained reason, independent of the user-facing result bucket

Examples:

- `provider_transient`
- `repo_bootstrap_failed`
- `merge_conflict`
- `delivery_transition_failed`

### 6. Delivery Artifact

Owner: delivery report table

Meaning:

- review handoff artifact for implementation/rework runs

This should not be a substitute for run result or tracker state. It is a completion artifact tied to
one run.

### 7. Merge Artifact

Owner: timeline or dedicated merge-result table

Meaning:

- explicit merge completion artifact for approved merge runs

If merge execution remains first-class, consider making this as explicit as delivery reports instead
of leaving it as a timeline event search.

## Recommended Cleanup Order

1. Decide the durable workspace contract.

- This is the biggest product contradiction in the slice.

2. Redefine run storage around `phase` plus `result`.

- This is the main simplification that makes later analytics and UI work easier.

3. Add explicit completion kinds for blocked implementation work and tracker-transition failure.

- This fixes the most dangerous semantic mismatches immediately.

4. Keep `Approved` visible during merge runs.

- Preserve workflow clarity in the tracker layer.

5. Remove stale names and compatibility aliases from live contracts.

- `completed_turn_batch`
- `startup_failed_backlog`
- any remaining success aliases like `done` and `merged` in modern read paths

## Concrete Questions for the Next Implementation Session

1. Should `finish --status blocked` continue to exist, and if yes, should it map directly to
   `Blocked`?
2. Should `partial` exist at all as a terminal delivery status?
3. Should successful merge runs persist a distinct run result instead of reusing
   `completed_turn_batch`?
4. Is `In Progress` meant to mean “actively executing” or “implementation work is the current
   workflow phase and may be resumed”?
5. Does the team want the durable workspace ADR to be the real product contract, or does the code’s
   current destroy-on-stop behavior reflect the intended direction?

## Strong Opinion

The current system is one refactor away from becoming much easier to reason about.

The right simplification is not “add more statuses.” It is:

- fewer semantic axes
- stricter ownership of each axis
- no success path that can complete without its tracker transition
- no blocked path that accidentally looks like a platform pause
- no workspace destruction rule derived indirectly from dispatchability
