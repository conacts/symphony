# Symphony Agent Run Lifecycle Spec

## Purpose

This document defines the intended lifecycle for Symphony-managed agent work.
It separates turn semantics, run semantics, issue-state transitions, delivery
boundaries, and rework re-entry so the runtime, prompts, and analytics all
optimize for the same behavior.

The primary goal is not one-turn completion. The primary goal is one clean run
per implementation cycle, with an explicit and auditable completion boundary.

## Guiding Principles

- Optimize for one run by default, not one turn at all costs.
- Treat turns as implementation slices, not business-completion signals.
- Use one explicit completion boundary for successful delivery.
- Preserve agent freedom during execution, but keep completion semantics narrow.
- Prefer preserved workspaces across rework so follow-up runs resume from real
  local state instead of starting over.

## Success Metrics

Preferred top-level metrics:

- One run per issue by default
- One review cycle per issue by default
- Explicit delivery recorded for every successful run
- Minimal inactive/stopped runs that did not record delivery
- Rework runs only when review feedback genuinely requires them

Secondary metrics:

- Turns per successful run
- Bootstrap duration
- Time spent in validation commands
- Rate of manual issue-state transitions that bypass delivery recording

## Bootstrap Cache Policy

Bootstrap should reduce first-turn execution cost without overloading every run.

Preferred near-term policy:

- warm local package artifacts during bootstrap with `pnpm build`
- keep bootstrap validation narrower than a full repo test sweep by default
- leave broader verification to the agent unless the runtime later grows a
  smaller deterministic smoke tier

Remote cache is a later optimization. It can help isolated Symphony workspaces,
but it should not be introduced until task inputs and outputs are modeled
cleanly enough to trust shared cache results.

## State Model

### Linear Issue States

Operational states:

- `Todo`
- `Bootstrapping`
- `In Progress`
- `In Review`
- `Rework`
- `Paused`
- `Failed`
- `Done`
- `Canceled`

### State Meanings

- `Todo`: dispatchable, not yet claimed
- `Bootstrapping`: runtime-owned setup state before active execution begins
- `In Progress`: active implementation state
- `In Review`: successful delivery boundary crossed
- `Rework`: review feedback arrived and a new implementation run should begin
- `Paused`: runtime could not continue, but the work is not terminal
- `Failed`: startup or execution failed and needs operator attention
- `Done`: work is actually complete after review lifecycle is satisfied
- `Canceled`: intentionally abandoned

## Turn Semantics

A turn is a single interaction slice within a run.

Turn terminal statuses:

- `completed`
- `failed`
- `stopped`

Turn `completed` means:

- the model stopped normally for that turn

Turn `completed` does **not** mean:

- the issue is done
- the run succeeded
- delivery was recorded
- the review handoff happened

Implication:

- a completed turn may be followed by another turn in the same run if the issue
  remains active and delivery has not been explicitly recorded

## Run Semantics

A run is the unit of implementation work associated with one dispatch of an
issue into the runtime.

Run starts when:

- the issue is dispatchable
- the workspace is prepared
- the runtime launches

Run ends when one of the following happens:

- successful delivery is explicitly recorded
- max turns are reached
- runtime startup fails
- runtime execution fails
- the issue becomes ineligible while the run is still active
- review feedback later causes a new run from `Rework`

### Runtime Run Statuses

Current runtime run statuses:

- `dispatching`
- `running`
- `finished`
- `paused`
- `failed`
- `startup_failed`
- `rate_limited`
- `stalled`
- `stopped`

### Runtime Turn Statuses

Current runtime turn statuses:

- `running`
- `completed`
- `failed`
- `stopped`

### Agent Analytics Run Statuses

Current agent analytics run statuses:

- `dispatching`
- `running`
- `completed`
- `paused`
- `failed`
- `startup_failed`
- `rate_limited`
- `stalled`
- `stopped`

Important distinction:

- runtime run `finished` with outcome `completed_turn_batch` means the run ended
  normally from the runtime’s perspective
- agent analytics run `completed` means the agent run ended normally
- neither should be interpreted as “the issue is done” unless explicit delivery
  was recorded

## Canonical Completion Boundary

Successful completion must be defined by one explicit delivery action.

Preferred completion tool contract:

- use a single terminal delivery tool
- recommended name: `submit_for_review`

The current concept already exists as:

- `finish_and_send_to_review`

The desired semantics are:

- agent uses the tool only after real work is delivered
- a completed delivery requires a real PR URL
- the tool records delivery against the active run and turn
- the tool transitions the issue to `In Review`
- the tool marks the successful completion boundary for the run
- the run should stop immediately after the tool succeeds

### What Does Not Count As Completion

The following are intermediate progress only:

- passing `pnpm build`
- passing `pnpm test`
- code changes written
- commit created
- branch pushed
- PR opened
- status comment posted
- a turn ending `completed`

None of these alone should count as successful run completion.

## Allowed Execution Freedom

Agents should retain broad execution freedom during implementation.

Allowed before completion:

- reading code
- editing code
- running shell commands
- running tests and builds
- committing changes
- pushing branches
- opening PRs
- gathering local context

Completion should still remain narrow:

- successful delivery must pass through the explicit delivery tool

## Manual State Mutation Policy

The runtime should not treat ad hoc issue-state mutation as equivalent to
successful delivery.

Specifically:

- manual transition of an issue into `In Review` should not be the preferred
  or canonical completion path
- if an issue becomes non-dispatchable without an explicit delivery record, that
  should be considered an abnormal completion path

This does not remove agent freedom in general. It clarifies that workflow
completion is a runtime-owned boundary, not just a side effect of any available
Linear mutation mechanism.

## Rework Re-entry

Rework should create a **new run**, not another turn inside the previous run.

Desired behavior:

1. review feedback moves the issue to `Rework`
2. `Rework` is dispatchable
3. Symphony starts a new run
4. the preserved workspace is reused when possible
5. the first prompt of the new run includes the rework handoff context

Why this is preferred:

- cleaner audit trail
- cleaner implementation/review boundary
- clearer metrics
- preserved local state still keeps rework efficient

## Prompt Contract

The primary first-turn prompt should teach the actual lifecycle explicitly.

It should state:

- the agent is already in the correct workspace
- the run is not complete until the explicit delivery tool succeeds
- commits, tests, comments, and PR creation are not completion by themselves
- the agent should not manually move the issue to `In Review` as its normal
  completion path
- once work is delivered and the PR exists, the delivery tool should be called
  immediately in the same turn
- if work remains, the run should continue instead of ending with a
  completion-style summary

The prompt should avoid:

- stale host-machine repo paths that do not match container reality
- optional language like “if Symphony exposes this tool” when the tool is a
  standard runtime capability
- vague completion instructions that compete with the explicit delivery boundary

## Runtime Enforcement

Prompting is necessary but not sufficient.

The runtime should preserve this invariant:

- successful completion happens only through explicit delivery recording

If a turn ends and:

- the issue is still active
- no delivery report exists

then continuation in the same run is correct.

If a turn ends and:

- the issue became ineligible
- but no delivery report exists

then the system should treat that as an abnormal or suspicious termination path,
not as a clean success condition.

## Bootstrap And Cache Policy

Execution cost materially affects run quality.

Long-running repo commands increase the likelihood that an agent:

- narrates partial progress
- times out command execution
- ends a turn before reaching the delivery boundary

### Phase 1: Local Bootstrap Warming

Preferred first optimization:

- warm local build artifacts during workspace bootstrap

Recommended initial shape:

- run `pnpm build` during bootstrap
- consider deferring full `pnpm test` unless the repo and issue make that cost
  acceptable

Rationale:

- lowers first-turn command cost
- increases the chance of completing implementation and delivery in one run
- avoids introducing remote-cache correctness questions too early

### Phase 2: Remote Cache

Remote Turbo cache is a later optimization, not the first prerequisite.

Remote cache is useful because Symphony issue workspaces are isolated clones or
snapshots, so standard same-machine worktree sharing does not fully help them.

Remote cache should only be enabled after:

- task outputs are modeled correctly
- environment hashing is understood
- nondeterministic tasks are identified

Remote cache is a performance optimization, not a correctness fix.

## Recommended Operating Target

The system should optimize for:

- one run by default
- one turn for genuinely small issues
- additional turns only when real work remains
- a new run on rework with preserved workspace reuse

The system should not optimize for:

- one turn at all costs

That pressure can encourage:

- skipped validation
- shallow fixes
- premature summaries
- lower-quality delivery

## Open Questions For Future Optimization

- Should the delivery tool be renamed from `finish_and_send_to_review` to a
  shorter terminal name such as `submit_for_review`?
- Should manual issue-state transitions to `In Review` be blocked from the
  agent’s normal tool affordances?
- Should bootstrap warming include a smaller validation tier in addition to
  `pnpm build`?
- Which tasks are safe to share via remote cache across isolated Symphony
  workspaces?
- What telemetry should be added to measure “abnormal completion paths” directly?

## Current Recommendation

1. Treat explicit delivery as the only canonical successful completion boundary.
2. Optimize for one run, not one turn.
3. Preserve rework as a new-run event with workspace reuse.
4. Improve prompt clarity before adding more workflow complexity.
5. Reduce execution cost with bootstrap-time local cache warming first.
6. Add remote cache only after lifecycle semantics and task determinism are
   solid.
