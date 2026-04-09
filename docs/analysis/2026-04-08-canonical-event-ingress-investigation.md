# Canonical Event Ingress Investigation

Date: 2026-04-08

## Goal

Decide where live curated writes to `symphony_events` should happen, and how the app should stop
using the raw harness journal to answer runtime-level questions.

This slice follows directly from the dual-event-store decision:

- keep `symphony_events`
- keep `symphony_agent_event_log`
- make the boundary real

The unresolved question is where the canonical ledger comes back to life.

## Executive Position

Restore live writes to `symphony_events`, but do not do it in the orchestrator observer and do not
back-project it from the raw journal after the fact.

The right place is the ingest boundary in
[agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts),
where the code already has:

- the persisted `runId`
- the persisted `turnId`
- the normalized event name
- the resolved `threadId`
- the raw harness payload
- the projection-loss payload
- the thread-event payload when one exists
- runtime usage extraction

That is the richest and most stable place to decide what belongs in the curated runtime ledger.

My concrete recommendation is:

- add a dedicated canonical event ingress path at the `agent-harness-runtime.ts` boundary
- keep raw harness capture in `agentAnalytics.recordEvent()`
- move `/forensics/*` back onto runtime-owned tables plus delivery/runtime-log enrichment
- leave `/agent/*` on the analytics/artifact layer

## Current Live Path

### 1. The app-server client already performs the first normalization pass

`runTurn()` in
[agent-app-server-client.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-app-server-client.ts#L202)
converts transport messages into a smaller runtime-facing stream.

It emits:

- synthetic wrapper events like `session_started`, `turn_completed`, `turn_failed`,
  `approval_required`, and `turn_input_required`
- raw method-wrapped events for other app-server messages

So by the time updates reach `agent-harness-runtime.ts`, they are already closer to product
semantics than raw transport frames.

### 2. `agent-harness-runtime.ts` is the real event ingress point

Inside the `onMessage` callback in
[agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L419),
the runtime currently derives:

- `threadEvent`
- `runtimePayload`
- `eventName`
- `timestamp`
- `turnUsage`
- `threadId`

Then it:

- sends `callbacks.onUpdate(...)`
- updates turn usage in `symphony_turns`
- writes the raw harness journal through `agentAnalytics.recordEvent(...)` when `threadEvent`
  exists

That is already the real ingress coordinator. It just is not writing the canonical event ledger.

### 3. The canonical event ledger writer exists, but is not in the live path

`SqliteSymphonyRuntimeRunLedger.recordEvent()` in
[sqlite-runtime-run-ledger.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/sqlite-runtime-run-ledger.ts#L102)
writes `symphony_events`.

I did not find a production path that calls it from the live runtime.

So today:

- `symphony_events` is canonical by intent
- `symphony_agent_event_log` is canonical by ingest reality

That is the inversion we need to fix.

### 4. The forensics surface is wired to the wrong reader

`runtime-services.ts` builds the forensics read model with `agentAnalyticsReadStore` in
[runtime-services.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-services.ts#L154).

That means `/api/v1/runs/:runId` is currently backed by the analytics reader, not a runtime-owned
read adapter.

As a result:

- run summaries use `symphony_agent_event_log`
- run detail turn events use `symphony_agent_event_log`
- raw harness capture is still answering runtime questions

## High-Signal Findings

### 1. `agent-harness-runtime.ts` has the best canonical context

This is the strongest reason to put curated event ingress there.

At that point in the code, the runtime knows:

- whether the update is a true thread event or only a wrapper/lifecycle message
- the persisted runtime `turnId`
- the resolved `threadId`
- the raw payload and projection losses
- extracted usage for turn rollups

The orchestrator observer does not have this fidelity.

### 2. The orchestrator observer is too thin to own canonical event persistence

`SymphonyAgentRuntimeUpdate` in
[symphony-orchestrator-types.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/orchestrator/src/symphony-orchestrator-types.ts#L112)
only carries:

- `event`
- `payload?`
- `timestamp`
- `sessionId?`
- `agentRuntimeProcessId?`

It does not carry:

- persisted `turnId`
- projection losses
- raw harness payload
- a typed thread-event boundary

That makes it a poor place to reconstruct canonical runtime events.

If canonical event writing moved there, it would immediately become a second normalization pass
with less context than the current ingress has.

### 3. Post-hoc projection from the raw journal would preserve the same authority bug

One possible answer is:

- keep only `agentAnalytics.recordEvent(...)` live
- later project `symphony_events` from `symphony_agent_event_log`

I do not recommend that as the primary design.

Why:

- it keeps the raw journal as the real first authority
- it makes the canonical ledger delayed and projector-dependent
- projection failures would create stale or partial canonical history
- reader cleanup would remain blocked on projector correctness

That path is acceptable for historical backfill, not for the steady-state contract.

### 4. The existing SQLite canonical writer is not a clean interface to reuse directly

This was the most important new finding in this slice.

The file-backed runtime ledger implementation records events without any issue-timeline side effect
in
[file-backed-runtime-run-ledger.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/runtime-run-ledger/src/file-backed-runtime-run-ledger.ts#L142).

The SQLite implementation does more:

- it writes `symphony_events`
- and also writes an issue timeline row for each event

See
[sqlite-runtime-run-ledger.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/sqlite-runtime-run-ledger.ts#L162).

That means the interface contract is already inconsistent across implementations.

Why this matters:

- “just call `recordEvent()`” is not actually an abstraction-safe recommendation
- turning it on in production would likely flood the issue timeline with low-level agent item
  events
- it would couple canonical event recovery to a UI-facing issue-activity side effect

So I do not recommend directly reusing `SqliteSymphonyRuntimeRunLedger.recordEvent()` as-is.

I recommend extracting a dedicated canonical event sink instead.

### 5. `symphony_events` is intentionally more curated than the raw journal

The event types in
[agent-analytics-types.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/runtime-run-ledger/src/agent-analytics-types.ts#L151)
show that `symphony_events` was designed to hold:

- thread events
- `session.started`

That is important.

The raw journal currently only persists actual thread events because
`agentAnalytics.recordEvent(...)` is only called when `threadEvent` exists in
[agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L460).

So the canonical ledger is not supposed to be a blind mirror of the raw journal.

It is already a curated runtime view.

### 6. The current runtime tables are already enough for most of `/forensics/runs/:runId`

The current forensics detail contract mostly needs:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- delivery reports
- runtime logs for session context

The analytics reader currently adds:

- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`
- runtime context like provider/model/auth mode from runtime logs

But that is enrichment, not proof that the raw journal owns run detail.

The main event list, turn list, counts, and last-event markers should come from runtime-owned
tables.

## Options

### Option A: write canonical events from the orchestrator observer

I reject this.

Pros:

- one central observer hook
- minimal wiring change in concept

Cons:

- insufficient context
- no persisted `turnId`
- no raw payload or projection-loss context
- requires reconstructing event meaning after the richer ingest boundary has already passed

This would create a thinner, more brittle projector than the existing ingress code.

### Option B: back-project canonical events from `symphony_agent_event_log`

I reject this as the default architecture.

Pros:

- keeps a single live ingest writer
- easier to explain as a transitional migration

Cons:

- keeps authority inverted
- makes canonical truth lag behind raw capture
- turns `symphony_events` into a derived cache instead of a first-class ledger
- blocks reader cleanup on projector completeness

Useful for migration. Wrong for the long-term model.

### Option C: dual-write by directly calling `SqliteSymphonyRuntimeRunLedger.recordEvent()`

I only partially accept this.

Pros:

- reuses existing event persistence logic
- preserves per-turn event sequencing
- uses the current canonical schema directly

Cons:

- SQLite implementation has hidden issue-timeline side effects
- file-backed implementation does not share those side effects
- it is not a clean, implementation-neutral abstraction
- enabling it in production could pollute the operator timeline with low-level item churn

This is close to the right answer, but not quite.

### Option D: add a dedicated canonical event sink at the ingest boundary

This is the option I recommend.

The shape should be:

- live in the same boundary as `agentAnalytics.recordEvent(...)`
- accept curated event input derived in `agent-harness-runtime.ts`
- write only `symphony_events`
- avoid automatic issue-timeline fanout
- optionally share a correlation key with the raw journal in the future

This keeps the dual-store contract clean:

- canonical runtime ledger for product/runtime semantics
- raw journal for debugging and artifact projection

## Recommended Design

### 1. Introduce a dedicated canonical runtime event ingress writer

This should be a separate write surface from `SymphonyRuntimeRunStore`.

It can live in the DB package, but it should not be the existing SQLite runtime ledger class unless
the timeline fanout is removed or made explicit.

Responsibilities:

- validate `runId` and `turnId`
- assign per-turn `eventSequence`
- persist `eventType`, `itemType`, `itemStatus`, `payload`, `payloadBytes`, `summary`,
  `threadId`, `sessionId`, and `agentTurnId`
- avoid issue-timeline side effects by default

### 2. Write canonical events from `agent-harness-runtime.ts`

At the ingest boundary:

- when the update is `session_started`, write a curated `session.started` canonical event
- when the update is a thread event, write both:
  - the canonical runtime event
  - the raw harness journal event

This preserves the correct order of operations:

- identify the event
- decide whether it belongs in the canonical ledger
- then persist curated and raw representations from the same moment in the flow

### 3. Keep non-canonical wrapper events out of `symphony_events`

These should stay in runtime logs and/or issue timeline, not in the curated event ledger:

- `approval_required`
- `turn_input_required`
- `tool_call_failed`
- `unsupported_tool_call`
- synthetic `turn_completed` wrapper messages
- synthetic `turn_failed` wrapper messages
- orchestrator lifecycle events like `runtime_launch_requested`

Those are useful operational signals, but they are not part of the canonical thread-event ledger.

### 4. Keep issue timeline higher-level than the canonical event ledger

Issue timeline should remain an operator-facing activity stream.

It should not automatically mirror every low-level agent event.

If the product later wants selected canonical events in the issue timeline, that should be an
explicit projection policy, not an incidental side effect of event persistence.

## Reader Migration Path

### 1. Add a runtime-owned forensics read adapter

Create a read adapter specifically for `createSymphonyForensicsReadModel(...)` that reads from:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- `symphony_issue_delivery_reports`
- `symphony_runtime_logs`

This adapter should own:

- run summaries
- run detail
- problem runs
- issue detail aggregates

It should not depend on `symphony_agent_event_log`.

### 2. Switch `runtime-services.ts` to use the runtime-owned adapter for forensics

The key wiring change is in
[runtime-services.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-services.ts#L154).

Today:

- `forensics.runStore = agentAnalyticsReadStore`

Target:

- `forensics.runStore = runtimeForensicsReadStore`

That is the boundary restoration step on the read side.

### 3. Leave `/agent/*` on the analytics reader

The raw artifact APIs are the right place for:

- raw event inspection
- transcript/debug views
- overflow retrieval
- tool-call and item projections
- reasoning, file-change, and task-snapshot artifacts

That surface should remain on `agentAnalyticsReadStore`.

### 4. Keep the web app’s two-call model

The current web hook in
[use-agent-run.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/features/runs/hooks/use-agent-run.ts#L16)
already loads:

- runtime run detail
- agent run artifacts

That is actually the correct separation.

The problem is not the two-call model.

The problem is that both calls currently rely on the analytics layer more than they should.

## Migration Notes

### Historical runs

Older runs may not have canonical event rows.

There are two reasonable choices:

1. Backfill `symphony_events` from `symphony_agent_event_log` for historical runs.

This is acceptable as a one-time migration because historical repair is different from steady-state
authority.

2. Keep mixed-era behavior temporarily.

If this is chosen, the runtime-owned forensics adapter must clearly distinguish:

- no canonical events because the run predates the new ingress
- no canonical events because something is broken

I prefer backfill if the volume is manageable.

### Correlation

If both stores remain separate, debugging paired rows will be easier if they share an explicit
correlation key.

Possible shapes:

- shared ingest UUID
- canonical event id referenced from the raw journal
- raw event id referenced from the canonical ledger

This is not required for the first cleanup step, but it is worth planning for now.

### Transaction boundaries

The cleanest steady state is a single SQLite transaction that writes:

- the canonical event row
- the raw journal row
- any child artifact projections derived from the raw journal

Without that, partial-write drift remains possible.

If a single transaction is too invasive in the first step, the code should at least isolate both
writes behind one ingress coordinator so the eventual transaction boundary has a single home.

## Strong Recommendation

The next implementation slice should do this:

1. Add a dedicated canonical runtime event writer with no implicit issue-timeline fanout.
2. Call it from `agent-harness-runtime.ts` alongside the raw journal writer.
3. Treat `session.started` as a first-class canonical event.
4. Build a runtime-owned forensics read adapter.
5. Rewire `runtime-services.ts` so `/forensics/*` stops reading canonical run history from the raw
   journal.

## Bottom Line

The fix is not “write more rows into `symphony_events` somehow.”

The fix is:

- restore canonical event ingress at the live runtime boundary
- keep the raw journal raw
- stop using the analytics reader as the runtime forensics reader

That gives the app a real dual-store architecture instead of the current half-separated model.
