# Codex Analytics Subsystem Plan

Date: 2026-04-03

## Purpose

Replace the legacy run journal analytics model with a dedicated Codex analytics subsystem built around the actual TypeScript SDK event model. The goal is to make Codex data maximally type-safe, queryable, and isolated from Symphony runtime internals while preserving enough fidelity to support future analysis and dashboard work.

This plan assumes:

- Codex SDK types are the source of truth.
- Dashboard compatibility is not a constraint during the migration.
- Fresh Codex-specific tables are preferred over mutating legacy journal tables.
- The canonical transcript stays snake_case and SDK-shaped.
- Camel case exists only in a thin consumption adapter layer.

The installed SDK version at planning time is `@openai/codex-sdk@0.118.0`.

## Core Decisions

1. Canonical Codex event payloads will use the SDK `ThreadEvent` type directly.
2. Symphony orchestration/runtime events will remain separate from Codex transcript data.
3. A dedicated Codex analytics package will own schemas, projector logic, and adapters.
4. Query and dashboard reads will use derived projection tables, not raw event JSON.
5. Large payloads will move to overflow storage with stable references from canonical and projection rows.
6. We will not derive semantic truth from interpretation-heavy heuristics.
7. We will derive mechanical facts such as counts, durations, last agent message IDs, and token totals.
8. `run_id` and `thread_id` remain separate identifiers even when effectively one-to-one today.

## SDK Types To Reuse Directly

The subsystem should import and re-export these SDK types wherever possible instead of redefining them:

- `ThreadEvent`
- `ThreadItem`
- `Usage`
- `ThreadStartedEvent`
- `TurnStartedEvent`
- `TurnCompletedEvent`
- `TurnFailedEvent`
- `ItemStartedEvent`
- `ItemUpdatedEvent`
- `ItemCompletedEvent`
- `ThreadErrorEvent`

These types should be used in canonical storage contracts and projector inputs.

## High-Level Architecture

There will be three layers:

1. Canonical Codex transcript
   Stores exact SDK event payloads plus a local storage envelope.

2. Derived analytics projections
   Stores normalized, queryable lifecycle and rollup tables.

3. Consumption adapters
   Translates projection records into camelCase developer-facing response shapes for API and dashboard consumers.

The product should treat layer 2 as the primary query surface.

## Canonical Storage

### Table: `codex_event_log`

One row per SDK `ThreadEvent`.

Suggested columns:

| column | type | notes |
|---|---|---|
| `id` | text primary key | internal event row id |
| `run_id` | text not null | Symphony/Codex run identity |
| `turn_id` | text null | known when event belongs to a turn |
| `thread_id` | text null | SDK thread identity |
| `item_id` | text null | extracted from `item.*` events |
| `event_type` | text not null | mirrors SDK `type` |
| `sequence` | integer not null | append order within a run |
| `recorded_at` | text not null | storage timestamp / observed timestamp |
| `payload_json` | text null | serialized exact `ThreadEvent` when it fits inline |
| `payload_overflow_id` | text null | points to overflow row when payload is externalized |
| `payload_truncated` | integer not null default 0 | should stay false in steady state once overflow exists |
| `inserted_at` | text not null | row creation time |

Indexes:

- `(run_id, sequence)`
- `(run_id, turn_id, sequence)`
- `(run_id, item_id, sequence)`
- `(thread_id, sequence)`
- `(event_type, recorded_at)`

Constraints:

- `event_type` must match the top-level SDK event `type`
- `item_id` is only set for `item.started`, `item.updated`, `item.completed`

### Table: `codex_payload_overflow`

Generic overflow storage for large payloads and large text blobs.

Suggested columns:

| column | type | notes |
|---|---|---|
| `id` | text primary key | overflow object id |
| `kind` | text not null | `event_payload`, `command_output`, `tool_result`, `agent_message`, `reasoning`, etc. |
| `run_id` | text not null | owning run |
| `turn_id` | text null | owning turn |
| `item_id` | text null | owning item |
| `content_json` | text null | serialized structured payload |
| `content_text` | text null | raw text payload when applicable |
| `byte_count` | integer not null | original size |
| `inserted_at` | text not null | row creation time |

Indexes:

- `(run_id, inserted_at)`
- `(turn_id, inserted_at)`
- `(item_id, inserted_at)`
- `(kind, inserted_at)`

This stays generic unless there is a concrete query need to split it later.

## Projection Tables

### Table: `codex_runs`

Codex-centric run analytics. Separate from `symphony_runs`.

Suggested columns:

| column | type | notes |
|---|---|---|
| `run_id` | text primary key | joins back to product run |
| `thread_id` | text null | SDK thread identity |
| `issue_id` | text not null | current issue linkage |
| `issue_identifier` | text not null | current issue key |
| `started_at` | text null | from first turn or run start context |
| `ended_at` | text null | from final turn completion/failure |
| `status` | text not null | `running`, `completed`, `failed`, `stopped`, etc. |
| `failure_kind` | text null | normalized classification |
| `failure_origin` | text null | `codex`, `runtime`, `workspace`, etc. |
| `failure_message_preview` | text null | short message |
| `final_turn_id` | text null | last completed/failed turn |
| `last_agent_message_item_id` | text null | last seen `agent_message` item id |
| `last_agent_message_preview` | text null | short preview |
| `last_agent_message_overflow_id` | text null | full content when large |
| `input_tokens` | integer not null default 0 | aggregated from turn usage |
| `cached_input_tokens` | integer not null default 0 | aggregated from turn usage |
| `output_tokens` | integer not null default 0 | aggregated from turn usage |
| `turn_count` | integer not null default 0 | rollup |
| `item_count` | integer not null default 0 | rollup |
| `command_count` | integer not null default 0 | rollup |
| `tool_call_count` | integer not null default 0 | rollup |
| `file_change_count` | integer not null default 0 | rollup |
| `agent_message_count` | integer not null default 0 | rollup |
| `reasoning_count` | integer not null default 0 | rollup |
| `error_count` | integer not null default 0 | rollup |
| `latest_event_at` | text null | latest event seen |
| `latest_event_type` | text null | latest event type seen |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

### Table: `codex_turns`

Derived turn lifecycle plus rollups.

Suggested columns:

| column | type | notes |
|---|---|---|
| `turn_id` | text primary key | turn identity |
| `run_id` | text not null | parent run |
| `thread_id` | text null | SDK thread id |
| `started_at` | text null | from `turn.started` |
| `ended_at` | text null | from `turn.completed` / `turn.failed` |
| `status` | text not null | `running`, `completed`, `failed`, `stopped` |
| `failure_kind` | text null | normalized classification |
| `failure_message_preview` | text null | short message |
| `last_agent_message_item_id` | text null | last `agent_message` item in the turn |
| `last_agent_message_preview` | text null | short preview |
| `last_agent_message_overflow_id` | text null | full message when large |
| `input_tokens` | integer not null default 0 | exact `Usage.input_tokens` |
| `cached_input_tokens` | integer not null default 0 | exact `Usage.cached_input_tokens` |
| `output_tokens` | integer not null default 0 | exact `Usage.output_tokens` |
| `item_count` | integer not null default 0 | rollup |
| `command_count` | integer not null default 0 | rollup |
| `tool_call_count` | integer not null default 0 | rollup |
| `file_change_count` | integer not null default 0 | rollup |
| `agent_message_count` | integer not null default 0 | rollup |
| `reasoning_count` | integer not null default 0 | rollup |
| `error_count` | integer not null default 0 | rollup |
| `latest_event_at` | text null | latest event seen |
| `latest_event_type` | text null | latest event type seen |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

### Table: `codex_items`

Generic item lifecycle spine keyed by item identity.

Natural key:

- `(run_id, turn_id, item_id)`

Suggested columns:

| column | type | notes |
|---|---|---|
| `run_id` | text not null | parent run |
| `turn_id` | text not null | parent turn |
| `item_id` | text not null | SDK item id |
| `item_type` | text not null | SDK item type |
| `started_at` | text null | first `item.started` time |
| `last_updated_at` | text null | latest lifecycle event time |
| `completed_at` | text null | `item.completed` time |
| `final_status` | text null | status for item types that have status |
| `update_count` | integer not null default 0 | number of lifecycle updates observed |
| `duration_ms` | integer null | computed when both ends exist |
| `latest_preview` | text null | short preview |
| `latest_overflow_id` | text null | full content/result/output when large |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

Primary key:

- `(run_id, turn_id, item_id)`

### Table: `codex_command_executions`

One row per command execution item lifecycle.

| column | type | notes |
|---|---|---|
| `run_id` | text not null | parent run |
| `turn_id` | text not null | parent turn |
| `item_id` | text not null | command item id |
| `command` | text not null | command line |
| `status` | text not null | item status |
| `exit_code` | integer null | final exit code |
| `started_at` | text null | lifecycle start |
| `completed_at` | text null | lifecycle end |
| `duration_ms` | integer null | computed |
| `output_preview` | text null | short preview |
| `output_overflow_id` | text null | full command output |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

Primary key:

- `(run_id, turn_id, item_id)`

### Table: `codex_tool_calls`

One row per MCP tool call lifecycle.

| column | type | notes |
|---|---|---|
| `run_id` | text not null | parent run |
| `turn_id` | text not null | parent turn |
| `item_id` | text not null | tool call item id |
| `server` | text not null | MCP server |
| `tool` | text not null | tool name |
| `status` | text not null | item status |
| `error_message` | text null | final error preview |
| `arguments_json` | text null | inline args when small |
| `arguments_overflow_id` | text null | large args |
| `result_preview` | text null | short preview |
| `result_overflow_id` | text null | large MCP result |
| `started_at` | text null | lifecycle start |
| `completed_at` | text null | lifecycle end |
| `duration_ms` | integer null | computed |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

Primary key:

- `(run_id, turn_id, item_id)`

### Table: `codex_file_changes`

Exploded to one row per changed file.

| column | type | notes |
|---|---|---|
| `run_id` | text not null | parent run |
| `turn_id` | text not null | parent turn |
| `item_id` | text not null | file change item id |
| `path` | text not null | changed path |
| `change_kind` | text not null | `add`, `delete`, `update` |
| `recorded_at` | text not null | item completion/update time |

Primary key:

- `(run_id, turn_id, item_id, path, change_kind)`

### Table: `codex_agent_messages`

One row per `agent_message` item lifecycle.

| column | type | notes |
|---|---|---|
| `run_id` | text not null | parent run |
| `turn_id` | text not null | parent turn |
| `item_id` | text not null | message item id |
| `started_at` | text null | lifecycle start |
| `completed_at` | text null | lifecycle end |
| `duration_ms` | integer null | computed |
| `text_preview` | text null | short preview |
| `text_overflow_id` | text null | full message |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

Primary key:

- `(run_id, turn_id, item_id)`

### Table: `codex_reasoning`

One row per `reasoning` item lifecycle.

| column | type | notes |
|---|---|---|
| `run_id` | text not null | parent run |
| `turn_id` | text not null | parent turn |
| `item_id` | text not null | reasoning item id |
| `started_at` | text null | lifecycle start |
| `completed_at` | text null | lifecycle end |
| `duration_ms` | integer null | computed |
| `text_preview` | text null | short preview |
| `text_overflow_id` | text null | full reasoning text |
| `inserted_at` | text not null | row creation time |
| `updated_at` | text not null | row update time |

Primary key:

- `(run_id, turn_id, item_id)`

## Token Rollups

Token usage matters enough to surface directly at multiple levels.

We should keep:

- `codex_turns.input_tokens`
- `codex_turns.cached_input_tokens`
- `codex_turns.output_tokens`
- `codex_runs.input_tokens`
- `codex_runs.cached_input_tokens`
- `codex_runs.output_tokens`

We do not need separate issue token tables in the first implementation if `codex_runs` already joins cleanly to issue identity. Issue-level usage can be queried from `codex_runs` first and materialized later only if needed.

Source of truth:

- final token accounting comes from `turn.completed.usage`

Live runtime counters may still exist elsewhere for in-progress UI, but they are not the canonical analytics source.

## Mechanical Derivations Only

Allowed derived facts:

- counts
- durations
- latest event type
- latest event timestamp
- last agent message item id
- last agent message preview
- failure taxonomy

Disallowed primary facts:

- `is_final_visible_answer`
- semantic interpretation of agent intent
- inferred categorization that depends on subjective meaning

If the UI wants richer semantics later, that belongs in a downstream derived layer, not in canonical storage or core projections.

## Consumption Boundary

The API and dashboard should read from projection tables through a thin shared adapter layer.

That layer may:

- convert snake_case fields to camelCase
- compose projection rows into dashboard response shapes
- hide overflow indirection behind helper accessors

That layer may not:

- reinterpret SDK payload semantics
- mutate canonical event meaning
- backfill missing facts by guessing

## Module Boundaries

Create a dedicated package for this subsystem. Suggested name:

- `packages/codex-analytics`

Suggested contents:

- `sdk-types.ts`
  re-exports of SDK types
- `envelope.ts`
  canonical event envelope types
- `schema.ts`
  Drizzle table definitions for Codex analytics tables
- `overflow.ts`
  overflow thresholds and helpers
- `projectors/`
  append-driven projector functions
- `queries/`
  reusable analytics queries
- `adapters/`
  thin camelCase consumption mappers

Suggested projector modules:

- `project-run.ts`
- `project-turn.ts`
- `project-item.ts`
- `project-command-execution.ts`
- `project-tool-call.ts`
- `project-file-change.ts`
- `project-agent-message.ts`
- `project-reasoning.ts`

The API runtime should hand off SDK events to this package rather than implementing projector logic inline.

## Ingest and Projection Flow

1. Runtime receives SDK event.
2. Runtime resolves local context:
   `run_id`, `turn_id`, `thread_id`, `sequence`, `recorded_at`
3. Event is written to `codex_event_log`.
4. Large payloads or large nested fields are externalized to `codex_payload_overflow`.
5. Projectors run in the same transaction.
6. Projectors upsert affected rows using natural keys.
7. Reads use projection tables only.

Important constraints:

- projection writes must be idempotent
- ordering must use `sequence`, not timestamps
- `item.started`, `item.updated`, and `item.completed` update the same item lifecycle row
- `turn.started` initializes `codex_turns`
- `turn.completed` and `turn.failed` finalize `codex_turns`

## Write Strategy

For the first version:

- synchronous projection updates
- same transaction as canonical event insert
- fail the whole transaction if projection update fails

This is intentionally simpler and safer than partial success.

## Migration Sequence

### Phase 1: Design Freeze

- finalize table names
- finalize module boundaries
- finalize envelope shape
- finalize overflow thresholds

### Phase 2: New Package and Schema

- create `packages/codex-analytics`
- define schema and helpers
- add fresh Codex-specific tables
- do not reuse legacy journal tables

### Phase 3: Dual Write

- keep current runtime path alive
- add Codex analytics writes in parallel
- verify canonical and projection rows against real runs

### Phase 4: Cut Reads Over

- point analytics queries to Codex projection tables
- update API adapters
- allow dashboard breakage during transition if needed

### Phase 5: Deprecate Legacy Run Journal

- remove Codex analytics responsibility from `run-journal`
- keep only minimal legacy compatibility as long as absolutely necessary
- delete old journal paths once cutover is verified

### Phase 6: Dashboard Rewrite

- rebuild dashboard views on top of the new queryable model
- use camelCase adapter functions only at the consumption boundary

## Testing Strategy

Required test coverage:

1. canonical event ingest from recorded real SDK events
2. item lifecycle projection across started/updated/completed
3. turn rollups and token accounting
4. command execution projection
5. tool call projection including large results
6. overflow externalization behavior
7. idempotent replay of the same event stream
8. dual-write verification against live runtime sessions

Test fixtures should come from real SDK events whenever possible.

## Retention

Current recommended retention:

- `codex_event_log`: 30 days
- `codex_payload_overflow`: 30 days
- projection tables: 30 days initially

This matches the current product need: operational analytics and short-horizon optimization rather than permanent archival.

## Explicit Non-Goals

- preserving old dashboard query shapes
- preserving legacy run journal architecture
- inventing semantic fields not directly supported by the SDK stream
- treating Symphony product identifiers and Codex identifiers as the same concept

## First Programming Pass

The next implementation pass should do only this:

1. create `packages/codex-analytics`
2. add canonical event and overflow tables
3. add `codex_runs`
4. add `codex_turns`
5. add `codex_items`
6. add `codex_command_executions`
7. add `codex_tool_calls`
8. add `codex_agent_messages`
9. wire runtime ingest to the new package
10. dual-write and verify against live SDK events

`codex_reasoning` and `codex_file_changes` can be included in the same pass if the implementation stays clean, but they are slightly less critical than command/tool/message visibility.

## Recommendation

Proceed with a clean Codex analytics subsystem now instead of extending the partially migrated run journal further. The current direction is correct, but the long-term abstraction should move out of `run-journal` and into a dedicated package with fresh tables and projector logic.
