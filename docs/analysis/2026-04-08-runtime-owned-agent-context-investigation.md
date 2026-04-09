# Runtime-Owned Agent Context Investigation

Date: 2026-04-08

## Goal

Decide what should replace the remaining agent-facing run fields once
`symphony_agent_runs` and `symphony_agent_turns` are removed.

This slice covers two kinds of data that are currently mixed together:

- compatibility status/failure fields like `agentStatus` and `agentFailureKind`
- session/launch/provider fields like `threadId`, `processId`, `providerName`, and
  `launchTarget`

The question is not whether the product still needs those values.

It does.

The question is where they should live once the shadow run graph is gone.

## Executive Position

My recommended end state is:

- keep lifecycle authority in `symphony_runs` and `symphony_turns`
- add one explicit runtime-owned 1:1 child table for session/launch/provider context
- derive compatibility fields like `agentStatus` and `agentFailureKind` in the runtime-owned
  forensics adapter
- stop reading `symphony_runtime_logs` as the primary source for public run fields
- do not create a new shadow lifecycle table just to preserve agent-facing response fields

The specific shape I would choose is an explicit table such as
`symphony_run_runtime_context`.

That table should be a narrow child of `symphony_runs`, not a second run graph.

## Why This Slice Exists

The current contract still exposes agent-facing fields in the forensics run summary:

- `agentHarness`
- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`
- `model`

See
[responses.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/responses.ts#L121).

The detailed run contract adds:

- `threadId`
- `processId`
- `providerId`
- `providerName`
- `reasoningEffort`
- `profile`
- `authMode`
- `providerEnvKey`
- `launchTarget`

See
[responses.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/responses.ts#L315).

Those fields are real product/UI needs today. The run screen uses them directly in
[agent-run-view-model.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/features/runs/model/agent-run-view-model.ts#L185).

So deleting the shadow graph is not just a storage cleanup exercise. It requires a replacement
ownership model.

## What The Current Code Is Telling Us

### 1. Runtime already owns lifecycle truth

The orchestrator observer writes the authoritative runtime run row with:

- `status`
- `outcome`
- `errorClass`
- `errorMessage`
- `workspace`
- `usage`
- startup failure metadata

See
[runtime-db-observer.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-db-observer.ts#L176).

Then, in parallel, it writes the agent-side compatibility row with:

- `status`
- `failureKind`
- `failureOrigin`
- `failureMessagePreview`

See
[runtime-db-observer.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-db-observer.ts#L230).

That means the current agent-facing failure/status fields are already downstream of runtime truth.

They are not independently discovered facts.

### 2. Runtime session context already originates outside the shadow graph

When the harness session starts, the runtime log entry already contains:

- `threadId`
- `processId`
- `model`
- `reasoningEffort`
- `profile`
- `providerId`
- `providerName`
- `authMode`
- `providerEnvKey`
- `harness`
- `launchTarget`

See
[agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L316).

On runtime failure and startup failure, the runtime error log also carries most of that same
context:

- `reason`
- `failureStage`
- `failureOrigin`
- `model`
- `providerId`
- `providerName`
- `authMode`
- `providerEnvKey`
- `harness`
- `launchTarget`

See
[agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L648).

So the true source of this data is already the runtime execution path, not `symphony_agent_runs`.

### 3. The current read layer is still stitching public run fields from the wrong places

`buildForensicsRunSummary()` currently builds public run rows by merging:

- `symphony_runs`
- `symphony_agent_runs`
- runtime turns
- raw agent event rows
- delivery reports
- parsed runtime logs

See
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L661).

`fetchRunDetail()` then continues that merge by reading:

- `threadId` from `agentRun`
- `providerId` and `providerName` from `agentRun` first, runtime logs second
- session/provider/launch context from parsed runtime logs

See
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L208).

This is exactly the kind of implicit multi-owner contract we are trying to remove.

### 4. Runtime logs are being used as state, not logs

The current runtime context extractor scans runtime log payloads to recover structured fields like
`model`, `processId`, `providerName`, and `launchTarget`.

See
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L2026).

That works as a fallback.

It is not a good end state.

Reasons:

- logs are append-only diagnostics, not a stable product read model
- log payload parsing is a softer contract than reading typed columns
- log retention and product-state retention are not the same concern

### 5. The shadow graph is still gating run existence

`loadRunData()` still returns `null` when `agentRun` is missing, even if the runtime run exists.

See
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1898).

That means the current replacement cannot just be “keep reading `symphony_agent_runs` a bit less.”

The ownership model itself has to change.

### 6. The UI mostly needs presentation fields, not a second authority graph

The run UI uses:

- `agentStatus` for labels
- `agentFailureKind` for a short diagnostic badge
- `agentFailureMessagePreview` for a failure summary
- session/provider fields for metadata display

See
[agent-run-view-model.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/features/runs/model/agent-run-view-model.ts#L191).

That is important, but it does not require persisting a second lifecycle graph.

### 7. Even the metrics logic already leans on runtime outcomes

Forensics success metrics classify most failures from:

- `outcome`
- `errorClass`
- only secondarily `agentFailureKind`

See
[symphony-forensics-success-metrics.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/forensics/src/symphony-forensics-success-metrics.ts#L273).

That is another sign that the shadow fields are compatibility helpers, not primary truth.

## Recommended Ownership Model

### Runtime lifecycle authority stays where it is

These remain runtime-owned:

- run `status`
- run `outcome`
- run `errorClass`
- run `errorMessage`
- run timing
- run token totals
- turn timing and usage
- repo snapshots
- worker/workspace identity

Primary owners:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- delivery reports

### Add one explicit runtime context sidecar

I recommend a new 1:1 child table:

- `symphony_run_runtime_context`

Purpose:

- hold the launch/session/provider metadata that is real, structured, and user-visible
- avoid bloating `symphony_runs` with a large set of late-bound nullable fields
- avoid forcing readers to parse log payloads as primary state

This is not another shadow run table because it should not carry:

- status
- outcome
- timestamps already owned by `symphony_runs`
- token totals
- counts
- last-event markers
- failureKind

It should only own context.

### Suggested `symphony_run_runtime_context` shape

Minimum fields:

- `runId` primary key and foreign key to `symphony_runs`
- `harnessKind`
- `threadId`
- `processId`
- `model`
- `reasoningEffort`
- `profile`
- `providerId`
- `providerName`
- `authTransport`
- `providerEnvKey`
- `launchTargetJson`
- `insertedAt`
- `updatedAt`

Optional additions if useful during implementation:

- `sessionId`
- a foreign key reference to the canonical `session.started` event once that ingress is live

My opinion on naming:

- `authTransport` is better than `authMode`

The current public `authMode` field really means “how PI credentials reached the runtime”:

- `auth_json`
- `api_key_env`

That is set in
[runtime-services.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-services.ts#L383)
from the Docker PI auth contract in
[runtime-auth-contract.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-auth-contract.ts#L55).

Elsewhere in the runtime policy, `authMode` already means a different thing:

- `provider`
- `subscription`

So the current name is semantically overloaded and should not be expanded.

## Which Fields Should Be Derived

### `agentStatus`

Do not persist it separately.

Derive it from runtime `run.status` with a single compatibility mapping:

- `dispatching -> dispatching`
- `running -> running`
- `finished -> completed`
- `paused -> paused`
- `failed -> failed`
- `startup_failed -> startup_failed`
- `rate_limited -> rate_limited`
- `stalled -> stalled`
- `stopped -> stopped`

This should live in one shared runtime-owned adapter function, not in multiple readers.

### `agentFailureKind`

Do not persist it separately in a new authority table.

Derive it from:

- `run.outcome`
- `run.errorClass`
- startup failure metadata already stored on the runtime run row

This is not perfect today because the runtime outcome vocabulary still contains implementation-ish
values like `completed_turn_batch`.

But that is an argument to clean up the runtime completion taxonomy, not to keep
`symphony_agent_runs`.

### `agentFailureMessagePreview`

Do not persist it separately.

Derive it from `run.errorMessage` with the same preview function the runtime already uses for
shadow-run writes.

That keeps the contract stable without storing the preview as a second fact.

### `agentFailureOrigin`

This field should not become a new hard authority field unless we prove a real product need.

My opinion is:

- keep it as a compatibility field for now
- derive it when runtime state explicitly knows the answer
- otherwise return `null`

Good derived cases:

- startup failure: use `metadata.startupFailure.failureOrigin`
- provider transient or rate-limited failure: return `provider`
- shutdown reconciliation or stop events: return `runtime`
- merge-blocked delivery/approval failure: return `tracker`

Bad current behavior:

- everything non-startup becomes `"agent"`

That is too coarse to be worth persisting.

### `agentHarness`

Derive it from runtime context `harnessKind`.

Do not keep a second copy in a shadow run table.

## Which Fields Should Be Stored Explicitly

These should be first-class fields in the runtime context sidecar, not re-derived from logs:

- `threadId`
- `processId`
- `model`
- `reasoningEffort`
- `profile`
- `providerId`
- `providerName`
- `authTransport`
- `providerEnvKey`
- `launchTarget`

Why:

- they are structured
- they are user-visible in run detail
- they are stable within the current one-session-per-run model
- they are too important to recover by parsing log payloads

## Options I Considered

### Option A: leave these fields in `symphony_agent_runs`

I reject this.

That preserves the exact shadow-authority problem we are trying to delete.

### Option B: move everything onto `symphony_runs`

This is workable, but not my preferred end state.

It would turn the core run table into a wide bag of late-bound nullable session fields.

That is still better than the current shadow graph, but it weakens the clarity of the core run
table.

### Option C: keep parsing `symphony_runtime_logs`

I reject this as an end state.

It is acceptable only as a migration fallback.

### Option D: put everything in `run.metadata`

I reject this as the steady-state design.

It solves the storage problem while recreating a reasoning problem:

- weaker shape enforcement
- more reader-side parsing
- more hidden contract knowledge

### Option E: add one explicit 1:1 runtime context table

This is my recommendation.

It is the cleanest balance between:

- explicitness
- schema enforcement
- low duplication
- keeping the core run table focused on lifecycle truth

## Recommended Migration Sequence

### 1. Add the runtime context table

Create `symphony_run_runtime_context` as a child of `symphony_runs`.

Do not add lifecycle fields to it.

### 2. Start writing it from runtime ingress

Write or upsert it from the same runtime-owned ingress that will restore canonical event writes.

Write points should include:

- launch/session start
- startup failure
- runtime execution failure when session context is partial

The key rule is:

- the runtime execution path writes context
- logs merely mirror it

### 3. Move forensics list/detail reads onto runtime-owned composition

The new runtime forensics adapter should compose:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- `symphony_run_runtime_context`
- delivery reports

`symphony_runtime_logs` may remain a temporary fallback during migration, but not the preferred
source.

### 4. Derive compatibility fields centrally

Centralize:

- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`

in the runtime-owned adapter.

Do not let UI view models or secondary readers keep re-deriving them ad hoc.

### 5. Remove `agentRun` dependence from run detail and artifacts

Once the runtime adapter can supply the public run fields, remove the `agentRun` existence check
from
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1898)
and let artifact reads operate on runtime run existence plus child artifact tables.

### 6. Delete lifecycle mirroring writes

After readers stop depending on them:

- stop `agentAnalytics.startRun(...)` for run-summary compatibility
- stop `agentAnalytics.finalizeRun(...)` for shadow lifecycle mirroring
- keep analytics writes only for raw harness events and child artifact projection

## Strong Recommendation

Do not replace `symphony_agent_runs` with another hidden cache that still owns public run status or
failure semantics.

The clean split is:

- `symphony_runs` and `symphony_turns` own lifecycle truth
- `symphony_run_runtime_context` owns launch/session/provider context
- the runtime forensics adapter derives compatibility fields
- `symphony_agent_event_log` and child artifact tables stay artifact-only

That is a simpler system and a more honest one.

## New Lead Opened By This Slice

This investigation exposed one additional cleanup lead that is worth a dedicated pass:

- the codebase currently uses `authMode` to mean both PI credential transport
  (`auth_json` / `api_key_env`) and model-selection policy (`provider` / `subscription`)

That is small compared with the state-authority work, but it is exactly the kind of naming collision
that makes the system harder to reason about than it needs to be.
