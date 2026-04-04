# Codex SDK Log Model Audit

Date: April 3, 2026

Anchor run:

- `runId`: `3f10e19b-c241-4551-83f4-0a6e94d26f34`
- Database: `/Users/connorsheehan/junction/symphony/symphony.db`
- Validity window: the run starts at `2026-04-03T20:37:38.949Z`, which is `3:37:38.949 PM CDT` on April 3, 2026. That places it inside the "valid payloads" window that starts at about `3:37 PM CDT`.

## Scope

This audit focuses on the Codex TypeScript SDK-backed observability path and compares:

1. the upstream `@openai/codex-sdk@0.118.0` event model,
2. the data actually stored for a recent valid run,
3. the current SQLite schema and read models,
4. the shape that the UI currently infers from stored payloads.

The goal is to identify where the current storage model loses fidelity, where it is not type-safe enough, and what target model should replace the current stringly-typed approach.

## Executive summary

The SDK transition is already giving us materially better data than the old CLI path. The database now contains item-level agent telemetry for commands, web search, to-do lists, agent messages, and token usage. That is the right raw material.

The main problem is that the storage and read models still treat SDK data as generic JSON with free-form strings around it. The result is three classes of issues:

1. Canonical data is stored, but not typed.
2. Multiple observability tables duplicate overlapping data with weaker guarantees.
3. A few concrete integrity bugs already exist in live SDK-backed runs.

The highest-value change is to make `symphony_events` the canonical typed SDK event store, normalize SDK event names into a stable internal contract, and make the UI read typed event projections instead of heuristically parsing `unknown` payload blobs.

## What the Codex SDK actually emits

In `@openai/codex-sdk@0.118.0`, the `ThreadEvent` union is small and well-defined:

- `thread.started`
- `turn.started`
- `turn.completed`
- `turn.failed`
- `item.started`
- `item.updated`
- `item.completed`
- `error`

The `ThreadItem` union is also well-defined:

- `agent_message`
- `reasoning`
- `command_execution`
- `file_change`
- `mcp_tool_call`
- `web_search`
- `todo_list`
- `error`

Relevant upstream SDK details:

- `turn.completed.usage` is snake_case: `input_tokens`, `cached_input_tokens`, `output_tokens`
- `command_execution` includes `command`, `aggregated_output`, optional `exit_code`, and `status`
- `todo_list` contains `items[{ text, completed }]`
- `mcp_tool_call` carries `server`, `tool`, `arguments`, optional `result`, optional `error`, and `status`

In our wrapper, we currently add an envelope before persisting the payload:

- synthetic `event`
- synthetic `session_id`
- synthetic `thread_id`
- synthetic `turn_id`
- synthetic `codex_app_server_pid`
- then `...input.event`

That means the stored payload is not just the upstream SDK event. It is a wrapped transport payload.

## What the live run contains

For `runId = 3f10e19b-c241-4551-83f4-0a6e94d26f34`:

- `symphony_runs`: 1 row
- `symphony_turns`: 2 rows
- `symphony_events`: 214 rows
- `symphony_runtime_logs`: 2 rows
- `symphony_issue_timeline_entries`: 243 rows

Event type breakdown in `symphony_events`:

- `item.completed`: 120
- `item.started`: 86
- `session_started`: 2
- `thread.started`: 2
- `turn.started`: 2
- `item.updated`: 1
- `turn.completed`: 1

Observed item types in payloads:

- `command_execution`: 77 completed, 83 started
- `agent_message`: 35 completed
- `todo_list`: 2 started, 1 updated, 1 completed
- `web_search`: 1 started, 1 completed
- `null`: 6 completed events, all caused by truncation

Observed command outcomes:

- command executions with `status="completed"`: 64
- command executions with `status="failed"`: 13
- command executions with `status="in_progress"`: 83

Observed payload truncation:

- 6 events are truncated
- all 6 are `item.completed`
- the largest payload recorded `196245` bytes
- truncation threshold is `65536` bytes

The runtime log table only contains coarse lifecycle checkpoints for this run:

- `runtime_launch_target_resolved`
- `runtime_session_started`

This confirms that the detailed agent transcript is in `symphony_events`, not `symphony_runtime_logs`.

## Current storage model

The current schema already distinguishes three observability layers:

### 1. `symphony_events`

This is the closest table to a canonical SDK event stream.

Stored fields:

- `run_id`
- `turn_id`
- `event_sequence`
- `event_type`
- `recorded_at`
- `payload`
- `payload_truncated`
- `payload_bytes`
- `summary`
- `codex_thread_id`
- `codex_turn_id`
- `codex_session_id`

### 2. `symphony_issue_timeline_entries`

This is an issue-scoped mixed timeline across:

- `codex`
- `orchestrator`
- `tracker`
- `workspace`
- `runtime`

It duplicates most Codex event payloads again.

### 3. `symphony_runtime_logs`

This is a coarse runtime log sink with:

- `level`
- `source`
- `event_type`
- `message`
- `payload`

This table is useful for service lifecycle and runtime diagnostics, but it is not the right place to represent Codex transcript detail.

## Concrete findings

### Finding 1: token usage is stored correctly but summarized incorrectly

Severity: high

The SDK emits usage as snake_case:

- `input_tokens`
- `cached_input_tokens`
- `output_tokens`

The live run stores that raw structure on turn 1:

- `input_tokens = 15112362`
- `cached_input_tokens = 14680448`
- `output_tokens = 29594`

But the run summary code only reads camelCase keys:

- `tokens?.inputTokens`
- `tokens?.outputTokens`
- `tokens?.totalTokens`

That means SDK-backed runs can legitimately persist token usage and still compute `0` token totals in summaries and dashboards.

Root cause:

- ingestion preserves SDK `usage` shape
- aggregation assumes legacy camelCase shape

Recommendation:

- replace generic `tokens: json` with a typed `usage_v1` shape that explicitly supports:
  - `inputTokens`
  - `cachedInputTokens`
  - `outputTokens`
  - `totalTokens`
- normalize snake_case to that shape at ingest time
- never read raw SDK `usage` directly in read-model math

### Finding 2: the live run has canonical-state divergence across observability tables

Severity: critical

The timeline for this run shows:

- `turn.completed` for turn 1 at `2026-04-03T20:56:10.397Z`
- `turn_started` for turn 2 at `2026-04-03T20:56:10.706Z`
- `run_stopped_inactive` at `2026-04-03T20:58:49.309Z`
- `workspace_cleanup_completed` at `2026-04-03T20:58:51.161Z`

But the canonical run row still says:

- `status = running`
- `outcome = null`
- `ended_at = null`

And turn 2 still says:

- `status = running`
- `ended_at = null`

This is not a UI issue. It is a storage integrity issue.

Probable cause from code flow:

- the orchestrator records `run_stopped_inactive`
- `stopRun()` flips `activeRun.stopped = true`
- `executeRun()` exits early when `input.activeRun.stopped` is true
- `onComplete()` is not called in that path
- `runtime-db-observer.finalizeRun()` only writes terminal run state when the orchestrator emits a completion callback

Result:

- lifecycle/timeline says the run ended
- canonical run and turn tables say the run is still active

Recommendation:

- treat stop paths as terminal state transitions in the canonical run journal
- finalize the active turn and run when a run is stopped for inactivity or terminal issue state
- do not rely on the agent runtime completion callback as the only way to close a run

### Finding 3: the event payload is rich, but the schema types it as `unknown`

Severity: high

The SDK gives us a narrow discriminated union. We currently store it as:

- `payload: unknown` in DB schema
- `payload: SymphonyJsonValue` in contracts
- `eventType: string`

That throws away most of the compile-time benefit of using the SDK.

Downstream symptoms:

- the UI re-discovers event shape by probing arbitrary JSON fields
- item kind is inferred with helpers like `getPayloadItemType(payload)`
- tool rendering depends on ad hoc checks against `payload.item.type`
- event naming logic still handles both `turn_completed` and `turn.completed`

Recommendation:

- define a first-class internal event union:
  - `CodexSessionStartedEvent`
  - `CodexThreadStartedEvent`
  - `CodexTurnStartedEvent`
  - `CodexTurnCompletedEvent`
  - `CodexTurnFailedEvent`
  - `CodexItemStartedEvent<TItem>`
  - `CodexItemUpdatedEvent<TItem>`
  - `CodexItemCompletedEvent<TItem>`
  - `CodexStreamErrorEvent`
- define a matching internal item union:
  - `agent_message`
  - `reasoning`
  - `command_execution`
  - `file_change`
  - `mcp_tool_call`
  - `web_search`
  - `todo_list`
  - `error`
- persist a normalized typed payload shape rather than raw generic JSON

### Finding 4: event naming is mixed between SDK-native and synthetic legacy forms

Severity: medium

Current event naming mixes:

- synthetic `session_started`
- SDK-native `thread.started`
- SDK-native `turn.started`
- SDK-native `turn.completed`
- fallback logic for legacy `turn_completed`

This makes aggregations and UI conditionals harder than necessary.

Recommendation:

- establish a stable internal namespace for stored event kinds
- either:
  - keep SDK-native names and make synthetic events explicit, for example `session.started.synthetic`
  - or normalize everything into one internal enum, for example:
    - `session_started`
    - `thread_started`
    - `turn_started`
    - `turn_completed`
    - `turn_failed`
    - `item_started`
    - `item_updated`
    - `item_completed`
    - `stream_error`
- keep the raw upstream event type separately if needed for debugging

### Finding 5: truncation destroys typed structure for the most important large events

Severity: high

When payload exceeds the limit, we currently replace the entire payload with:

- `truncated: true`
- `preview: <first N chars of JSON string>`
- `originalBytes: <full size>`

That means truncated events lose:

- event discriminator
- item discriminator
- structured fields
- JSON validity guarantees on the preview

In the live run, every truncated payload became untyped `item.completed` with no recoverable `item.type` via JSON extraction.

Recommendation:

- never truncate by replacing the whole payload with a string preview
- keep a typed header plus selectively truncated heavy fields
- for example:
  - retain `type`
  - retain `item.id`
  - retain `item.type`
  - retain `item.status`
  - retain `exit_code`
  - move large string fields like `aggregated_output` and large `agent_message.text` into separate overflow storage

Suggested pattern:

- `payload_core`: small typed JSON object
- `payload_overflow_ref`: nullable pointer
- `payload_overflow_bytes`: nullable integer
- `payload_truncation_reason`: enum

### Finding 6: `symphony_issue_timeline_entries` duplicates Codex transcript data with less structure

Severity: medium

For this run:

- `symphony_events`: 214 rows
- `symphony_issue_timeline_entries`: 243 rows

The timeline includes almost all Codex events again, but:

- still stores `eventType` as string
- still stores `payload` as generic JSON
- usually has no useful `message`

That makes the timeline a denormalized duplicate of the transcript rather than a purposeful projection.

Recommendation:

- stop copying full Codex payloads into issue timeline
- issue timeline should be a compact cross-domain projection for operator views
- keep entries like:
  - run started
  - run finished
  - run paused
  - workspace prepared
  - workspace cleaned up
  - tracker state changed
  - comment published
  - codex turn started/completed/failed
- if deep transcript is needed, link to `runId`/`turnId` and query `symphony_events`

### Finding 7: the UI is already forced into heuristic parsing because the API is not typed enough

Severity: medium

The UI transcript renderer currently does things like:

- inspect `payload.item.type`
- branch on string literals like `command_execution`, `todo_list`, `web_search`
- derive tool state from `eventType` suffixes and optional `item.status`
- pretty-print arbitrary `payload` JSON when specialized rendering fails

This works, but it means:

- compile-time safety is low
- new SDK item types will silently degrade into generic JSON cards
- truncation breaks higher-level rendering because discriminators disappear

Recommendation:

- API response should expose typed transcript events directly
- UI should switch on a typed discriminant from the API contract, not on `unknown` payload JSON

## Proposed target model

### Canonical write model

Keep the run and turn tables, but tighten them:

#### `symphony_runs`

- keep canonical lifecycle state
- make stop/final states authoritative
- do not leave runs open after orchestrator stop paths

#### `symphony_turns`

- keep:
  - `runId`
  - `turnSequence`
  - `codexThreadId`
  - `codexTurnId`
  - `codexSessionId`
  - `promptText`
  - `status`
  - `startedAt`
  - `endedAt`
- replace `tokens: json` with typed usage columns or a typed usage object:
  - `inputTokens`
  - `cachedInputTokens`
  - `outputTokens`
  - `totalTokens`

#### `symphony_events`

Make this the canonical transcript stream.

Suggested columns:

- `eventId`
- `runId`
- `turnId`
- `turnSequence`
- `streamSequence`
- `recordedAt`
- `transportEventKind`
- `sdkEventKind`
- `itemKind`
- `itemStatus`
- `codexThreadId`
- `codexTurnId`
- `codexSessionId`
- `payloadCore`
- `payloadOverflowRef`
- `payloadBytes`
- `payloadOverflowBytes`

Key point:

- `streamSequence` should be unique per run, not just `eventSequence` per turn

### Projection tables

#### `symphony_issue_timeline_entries`

Turn this into a compact mixed-source operator timeline. Do not store full Codex transcript payloads here.

Suggested use:

- cross-domain narrative
- small summary payloads
- links back to canonical run/turn/event ids

#### `symphony_runtime_logs`

Keep this for service/runtime diagnostics:

- environment/bootstrap/runtime startup
- workspace/backend errors
- poller health
- reconciliation failures

Do not use it as a transcript store.

## Normalization strategy

At ingest time:

1. accept SDK `ThreadEvent`
2. map it into a typed internal event contract
3. split transport envelope metadata from event body
4. normalize snake_case usage into internal camelCase usage
5. classify item kind and item status explicitly
6. isolate large string bodies into overflow storage

Example internal event shape:

```ts
type CodexStoredEvent =
  | {
      kind: "session_started";
      runId: string;
      turnId: string;
      codexThreadId: string | null;
      codexTurnId: string;
      codexSessionId: string;
      model: string | null;
      reasoningEffort: string | null;
    }
  | {
      kind: "thread_started";
      runId: string;
      turnId: string;
      codexThreadId: string;
    }
  | {
      kind: "turn_completed";
      runId: string;
      turnId: string;
      usage: {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        totalTokens: number;
      };
    }
  | {
      kind: "item_completed";
      runId: string;
      turnId: string;
      item: CodexStoredItem;
    };
```

Example stored item shape:

```ts
type CodexStoredItem =
  | {
      kind: "command_execution";
      id: string;
      status: "in_progress" | "completed" | "failed";
      command: string;
      exitCode: number | null;
      aggregatedOutputRef: string | null;
      aggregatedOutputPreview: string | null;
    }
  | {
      kind: "agent_message";
      id: string;
      textRef: string | null;
      textPreview: string;
    }
  | {
      kind: "todo_list";
      id: string;
      items: Array<{ text: string; completed: boolean }>;
    };
```

## Migration plan

### Phase 1: introduce typed normalization without breaking existing readers

- add internal TypeScript types for normalized Codex SDK events and items
- normalize usage keys at ingest
- add typed helper functions for reading payloads instead of raw JSON probing
- keep existing tables, but write normalized payload cores

### Phase 2: fix canonical lifecycle closure

- finalize turns and runs on stop paths
- add tests for:
  - inactive stop
  - terminal stop
  - aborted turn
  - stop during turn 2

### Phase 3: split transcript from overflow content

- preserve typed core event data in-row
- move large outputs and long texts to overflow storage
- keep references in `symphony_events`

### Phase 4: slim the issue timeline

- stop duplicating full Codex payloads into `symphony_issue_timeline_entries`
- make it a summary projection only

### Phase 5: change the API/UI contract

- expose typed transcript events from forensics routes
- remove most `unknown` payload parsing in the UI
- switch transcript rendering to discriminated unions

## Immediate priority fixes

These should happen before any broader schema redesign:

1. Fix token usage normalization so SDK-backed runs report correct totals.
2. Fix stop-path finalization so runs and turns cannot remain `running` after `run_stopped_inactive` or cleanup.
3. Introduce a typed internal event union for Codex SDK payloads.
4. Preserve typed headers on truncated payloads instead of replacing the entire payload blob.

## Recommended direction for the dashboard

The UI should not be built around the current generic storage shape. It should be built around the normalized SDK model.

The dashboard should receive:

- a typed run summary
- typed turn usage
- typed transcript events
- compact operator timeline entries
- runtime/service logs

Those are different views over different kinds of data. Keeping them collapsed into generic `payload: json` records is what makes the current model brittle.

## Bottom line

The Codex SDK transition is the right foundation. The stored payloads are already much better than the old CLI-era data.

The next step is not "collect more JSON." It is:

- normalize SDK events into a first-class internal type system,
- make `symphony_events` the canonical typed transcript store,
- stop duplicating that transcript into weaker projections,
- and make run/turn closure and usage math consistent with the SDK payload we already have.
