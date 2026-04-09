# Run/Turn Authority Collapse Investigation

Date: 2026-04-08

## Goal

Decide what should happen to `symphony_agent_runs` and `symphony_agent_turns`.

These tables are currently the biggest remaining shadow-authority problem in the analytics layer.

This slice asks one blunt question:

- should they survive as first-class persisted tables
- or should the system collapse back to one runtime run/turn graph plus child artifact tables

## Executive Position

The clean end state is:

- keep one authoritative run graph: `symphony_runs`, `symphony_turns`, `symphony_events`
- keep child artifact tables: `symphony_agent_event_log`, overflow, items, tool calls, messages,
  reasoning, file changes, task snapshots, `pi_*`
- remove `symphony_agent_runs` and `symphony_agent_turns`

If the migration needs a temporary compatibility step, those tables may survive briefly as narrow
rollup caches.

But they should not survive in their current names, current shapes, or current authority role.

## Why The Current Shape Is Wrong

### 1. The agent-side run graph has multiple lifecycle writers

`symphony_agent_runs` is written from several places:

- orchestrator dispatch start in
  [runtime-db-observer.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-db-observer.ts#L31)
- runtime session start in
  [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L301)
- event-ingest backfill in
  [agent-analytics-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-store.ts#L393)
- finalization backfill in
  [agent-analytics-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-store.ts#L329)

That is not one explicit owner. That is a repair loop.

The same pattern exists for turns:

- event-ingest writes and updates `symphony_agent_turns`
- terminal lifecycle paths finalize them later

So the tables do not represent a clean authority source. They represent a stitched-together
compatibility graph.

### 2. They are structurally incapable of being primary authority

The runtime graph holds the real run and turn semantics.

`symphony_runs` carries fields like:

- `repositoryKey`
- `outcome`
- `workerHost`
- `workspacePath`
- `commitHashStart`
- `commitHashEnd`
- `repoStart`
- `repoEnd`
- machine-load summary

See
[schema.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/schema.ts#L520).

`symphony_turns` carries fields like:

- `turnSequence`
- `agentTurnId`
- `sessionId`
- `promptText`
- runtime turn `usage`
- turn metadata

See
[schema.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/schema.ts#L551).

`symphony_agent_turns` does not even try to own those fields.

That means the agent-side run/turn tables cannot become primary truth without expanding into a full
second state graph, which is exactly what we should avoid.

### 3. The read layer already treats them as unreliable

The analytics reader repeatedly falls back away from agent rows:

- run token totals fall back to runtime turns in
  [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1122)
- turn token usage falls back to runtime turn usage in
  [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1140)
- forensics turn detail synthesizes turns when runtime and agent turn graphs disagree in
  [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1688)
- run list can still work with runtime-only rows, proven in
  [agent-analytics-read-store.test.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.test.ts#L1274)

The code is already telling us these tables are not trustworthy enough to stand alone.

### 4. Cache misses currently masquerade as missing runs

This is one of the sharpest contract bugs in the slice.

`loadRunData()` returns `null` when `agentRun` is missing, even if the runtime run exists, in
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1946).

That means:

- `/agent/runs/:runId/artifacts` can 404 because a rollup row is missing
- `/api/v1/runs/:runId` can also fail today because it is still wired through the analytics reader
- `listTurns()` reads only `symphony_agent_turns` in
  [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L333)

So the system is still treating cache presence like run existence.

That is the opposite of a safe cache contract.

### 5. There is no bulk agent-run API that justifies a persisted run-level cache

The API routes in
[agent-analytics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/agent-analytics-routes.ts#L1)
are all run-scoped:

- `/agent/runs/:runId/artifacts`
- `/agent/runs/:runId/turns`
- child artifact endpoints under a specific run

There is no `/agent/runs` list surface that needs a cross-run persisted summary table.

The only bulk run list in the product is forensics, and that should be runtime-owned.

This materially weakens the case for keeping persisted `symphony_agent_runs`.

### 6. The public contract still needs some agent-specific fields

This is the one reason deletion cannot be immediate.

The forensics contract still exposes:

- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`

See
[forensics/responses.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/responses.ts#L120).

The run screen uses those fields directly in
[agent-run-view-model.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/features/runs/model/agent-run-view-model.ts#L191).

So the real question is not whether the product needs these fields.

It does.

The real question is where they should come from.

My answer is:

- not from a second persisted run graph
- from runtime completion metadata and runtime-session context instead

### 7. Operational code still depends on the shadow graph

Shutdown reconciliation queries:

- `symphony_agent_turns` for running agent turns
- `symphony_agent_runs` for thread id

See
[runtime-shutdown-reconciliation.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-shutdown-reconciliation.ts#L63).

That is another sign these tables are doing more than artifact projection.

It is also a migration dependency:

- once canonical event ingress and runtime-owned session context exist, shutdown recovery should
  stop depending on the agent-side run graph

## What These Tables Really Are

Despite their names, `symphony_agent_runs` and `symphony_agent_turns` are not primary run records.

They are:

- live rollups over the raw harness event stream
- incremental counters for child artifact tables
- preview caches for the last agent message
- a home for some harness/runtime-session metadata that has not yet been promoted elsewhere

That is a cache role, not an authority role.

The names are misleading because they make the tables sound like peers of `symphony_runs` and
`symphony_turns`.

They are not.

## Options

### Option A: keep the current agent run/turn graph

I reject this.

It preserves:

- duplicate lifecycle writers
- duplicate status storage
- duplicate start/end timing
- duplicate token totals
- cache-miss-as-absence bugs

It also keeps the current misleading table names alive.

### Option B: keep them as persistent caches in the same shape

I also reject this.

Even if we promise not to treat them as authority, the current column set still invites it.

Fields like these should not live in a “cache” table with active names:

- `issueId`
- `issueIdentifier`
- `startedAt`
- `endedAt`
- `status`
- `failureKind`
- `failureOrigin`
- `threadId`

That shape continues to advertise ownership the table should not have.

### Option C: remove them entirely and derive run/turn artifact summaries on read

This is my recommended end state.

Why it works:

- per-run artifact endpoints already load child rows, so counts and previews can be computed on the
  fly
- forensics bulk summaries should be runtime-owned anyway
- runtime status, timing, token totals, and event counts already have better owners
- runtime logs and canonical events can supply session/provider/thread context

This is the simplest model.

### Option D: keep a temporary narrow rollup cache while migrating

This is my recommended transition, not the end state.

If performance or migration safety requires a cache for a while, it should be explicitly renamed to
something like:

- `symphony_agent_run_rollups`
- `symphony_agent_turn_rollups`

And it should contain only clearly derived fields such as:

- artifact counts
- latest agent-message preview
- latest artifact activity timestamp

It should not carry workflow identity or lifecycle authority.

## Recommended Ownership Model

### Runtime-owned

These fields belong in runtime-owned storage and runtime forensics reads:

- run identity
- issue identity
- repository identity
- workflow status and outcome
- run and turn start/end timestamps
- turn sequence
- prompt text
- session id
- agent turn id
- canonical event counts and last-event markers
- token totals
- workspace, worker, commit, repo snapshot, and machine-load data

Primary owners:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- `symphony_runtime_logs`
- delivery reports

### Artifact-owned

These belong in child artifact tables:

- raw harness events
- payload overflow
- item projections
- command/tool/message/reasoning/file-change projections
- task snapshots
- typed `pi_*` artifacts

Primary owners:

- `symphony_agent_event_log`
- `symphony_agent_payload_overflow`
- `symphony_agent_items`
- `symphony_agent_command_executions`
- `symphony_agent_tool_calls`
- `symphony_agent_messages`
- `symphony_agent_reasoning`
- `symphony_agent_file_changes`
- `symphony_agent_task_snapshots`
- `symphony_agent_task_snapshot_items`
- `pi_*`

### Fields that need a new owner before run/turn cache removal

These fields are currently living in the shadow graph but should move elsewhere:

- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`
- harness/model/provider metadata
- run-level thread id

Direction:

- failure status belongs in the runtime run/turn completion model
- session/provider/harness context belongs in an explicit runtime-owned context model, not in the
  shadow graph
- thread identity belongs in canonical runtime events plus runtime-session context

Follow-up slice:

- [Runtime-Owned Agent Context Investigation](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-runtime-owned-agent-context-investigation.md)

## Recommended Migration Sequence

### 1. Land the previous two slices first

Before this collapse is practical, two things should happen:

- canonical event ingress should become live
- `/forensics/*` should move onto a runtime-owned adapter

Those changes remove the biggest runtime-facing reasons to keep the shadow graph.

### 2. Stop requiring `agentRun` and `agentTurns` for artifact reads

`fetchRunArtifacts()` and `listTurns()` should build their run/turn skeleton from:

- runtime run/turn rows
- runtime logs
- canonical events
- child artifact tables

That change alone would remove the current cache-miss 404 behavior.

### 3. Promote agent-facing failure and session fields into runtime-owned reads

The runtime forensics adapter should provide:

- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`
- harness/model/provider/thread/session context

without reading `symphony_agent_runs`.

The recommended storage split for that work is captured in
[2026-04-08-runtime-owned-agent-context-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-runtime-owned-agent-context-investigation.md).

### 4. Remove lifecycle writes to the shadow graph

Once readers no longer depend on them:

- stop calling `agentAnalytics.startRun(...)` for lifecycle mirroring
- stop calling `agentAnalytics.finalizeRun(...)` and `agentAnalytics.finalizeTurn(...)` just to
  maintain run/turn shadow rows

At that point the analytics ingress can shrink toward:

- raw event logging
- child artifact projection

### 5. Update shutdown reconciliation

Shutdown recovery should use:

- `symphony_runs`
- `symphony_turns`
- runtime logs
- canonical runtime events

not `symphony_agent_runs` and `symphony_agent_turns`.

### 6. Delete the shadow tables or replace them with explicit rollup caches

Preferred end state:

- delete them

Fallback only if proven necessary:

- replace them with explicit `*_rollups` tables that contain only derived counters/previews

## Strong Recommendation

Do not preserve `symphony_agent_runs` and `symphony_agent_turns` as part of the long-term model.

They are the last major place where the code still behaves like it has two run graphs.

The right simplification is:

- one runtime run/turn graph
- one raw harness journal
- many child artifact tables
- zero agent-side run/turn authority tables

## Bottom Line

These tables are not “agent runs” and “agent turns.”

They are cache-shaped summaries over a child artifact graph.

The code is simpler, more explicit, and less bug-prone if that is reflected honestly:

- either remove them
- or quarantine them temporarily as narrow rollup caches while migrating toward removal
