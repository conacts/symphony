# Agent Analytics Projection Authority Review

Date: 2026-04-08

## Goal

Review the `symphony_agent_*` and `pi_*` layer as a persistence model, not just as a feature.

The main questions for this slice are:

- which tables are legitimate child artifacts of the runtime graph
- which tables have quietly become a second source of truth
- where the read layer is repairing or inventing state instead of exposing drift
- how to keep the useful artifact surfaces without keeping the shadow authority model

This review is intentionally critical. The current analytics layer is useful, but it is doing more
than “analytics.” It is currently part artifact store, part compatibility layer, part fallback
authority graph, and part API adapter.

## Current Shape

Today the analytics stack does four different jobs:

1. Capture harness-native events

- `symphony_agent_event_log`
- `symphony_agent_payload_overflow`

2. Project item-level artifacts

- `symphony_agent_items`
- `symphony_agent_command_executions`
- `symphony_agent_tool_calls`
- `symphony_agent_messages`
- `symphony_agent_reasoning`
- `symphony_agent_file_changes`
- `symphony_agent_task_snapshots`
- `symphony_agent_task_snapshot_items`
- `pi_*`
- `pi_message_ends`

3. Maintain a second run and turn rollup graph

- `symphony_agent_runs`
- `symphony_agent_turns`

4. Feed forensics and UI contracts

- run summaries
- run detail
- artifact endpoints
- turn and transcript views in the web app

That last point matters. This is no longer “just a reporting layer.” The product already depends on
these tables and their normalization rules.

## High-Signal Findings

### 1. `symphony_agent_runs` and `symphony_agent_turns` are shadow authority, not clean projections

These two tables duplicate a large part of the runtime graph:

- issue identity
- issue identifier
- thread identity
- status
- start and end timestamps
- token totals
- latest-event markers
- per-run and per-turn counts
- harness and provider metadata

The write path makes the authority split explicit:

- `startRun()` writes `symphony_agent_runs` directly
- `ensureAgentRunRecord()` backfills `symphony_agent_runs` from `symphony_runs` if the analytics row
  is missing
- the read store then merges runtime rows and analytics rows back together

That is not a projection-only model. It is a second run graph with opportunistic synchronization.

Why this matters:

- one run can be “present” in list surfaces but absent in detail surfaces depending on which graph
  has the row
- statuses, timestamps, and token totals can drift between runtime rows and analytics rows
- the code has to know which layer to trust for each field instead of using one obvious owner

Recommendation:

- make `symphony_runs` and `symphony_turns` the only authority for run and turn identity
- either remove `symphony_agent_runs` and `symphony_agent_turns`
- or rename them into explicit summary-cache tables that do not repeat issue identity and workflow
  state

### 2. The read layer repairs drift instead of surfacing it

The analytics reader is full of compatibility and fallback behavior:

- unknown run statuses normalize to `"running"`
- unknown turn statuses normalize to `"running"`
- unknown item statuses normalize to `null` or `"in_progress"`
- zero analytics token totals fall back to runtime turn usage
- run detail fills harness, model, provider, auth mode, and launch target from runtime logs
- invalid resource profiles normalize into synthetic zeroed profiles
- unknown task snapshot states normalize to `"pending"`

These repairs make the product resilient, but they also make bad state look valid.

Why this matters:

- a malformed or stale projection row becomes indistinguishable from a legitimate running state
- the UI cannot tell the difference between “projection missing,” “projection invalid,” and
  “projection truly empty”
- operator bugs become long-tail mysteries instead of immediate data-integrity failures

Recommendation:

- compatibility logic should live at a narrow boundary, not inside the main mapper path
- stop converting invalid stored states into real business states
- when a projection row is malformed, return an explicit integrity signal or omit the projection
  rather than inventing a valid-looking substitute

### 3. The forensics summary path already depends on projection rows for runtime facts

`listRuns()` starts from `symphony_runs`, but it does not stay there. It enriches each run with:

- `symphony_agent_runs`
- `symphony_agent_event_log`
- `symphony_runtime_logs`
- `symphony_issue_delivery_reports`

The most important drift here is subtle: `buildRuntimeRunSummary()` is fed event rows derived from
`symphony_agent_event_log`, not from the authoritative `symphony_events` table.

That means even “runtime” summary fields like:

- event count
- last event type
- last event timestamp

are already depending on the analytics projection graph.

Why this matters:

- the read model cannot clearly answer what the runtime knows on its own
- a missing analytics event row can change summary results for an otherwise valid runtime run
- the event-store duplication is leaking into operator-facing forensics

Recommendation:

- make forensics run summaries derivable from `symphony_runs`, `symphony_turns`,
  `symphony_events`, and delivery data alone
- treat analytics artifacts as optional enrichment, not required ingredients for the main run
  summary

### 4. Tool-call projection currently stores synthesized truth, not observed truth

The tool-call path is doing several heuristic repairs:

- `chooseCanonicalToolArguments()` recursively merges old and new argument objects
- `mergeToolArgumentRecords()` preserves prior values when the new payload omits them
- `chooseCanonicalCommand()` preserves the earlier shell command when a later completion payload
  collapses to `"bash"`
- `mapAgentToolCallRecords()` reparses `argumentsJson` at read time to recover `piEdit.edits`, even
  though the typed `pi_edits` row already exists

The tests explicitly codify this behavior. For example, the store preserves rich `pi.edit`
arguments from the start event when the completion event only carries `path`.

That is pragmatic, but it means the stored row is no longer “the observed payload.” It is a merged
interpretation assembled across multiple events.

Why this matters:

- the raw tool-call row stops being a trustworthy record of what the harness actually emitted
- typed `pi_*` tables and `argumentsJson` both claim to describe the same truth
- read-time reparsing means even typed projection consumers still depend on the merged raw JSON

Recommendation:

- pick one explicit source for the final tool-call snapshot
- if raw observed payloads matter, store them as raw observations
- if normalized final arguments matter, store them as a clearly named derived snapshot
- typed `pi_*` tables should derive from one declared snapshot, not from merged heuristics plus
  read-time reparsing

### 5. Artifact endpoint semantics are inconsistent and hide missing-data problems

The current API behavior is not consistent across read paths:

- `listRuns()` can return a runtime-backed run even when agent analytics rows are absent
- `fetchRunDetail()` and `fetchRunArtifacts()` return `null` when `agentRun` is missing
- `listTurns()` only returns `symphony_agent_turns`, even if runtime turns exist
- list endpoints for items, commands, tools, messages, reasoning, and file changes return `200 []`
  without first proving the run exists
- `/agent/runs/:runId/artifacts` returns `404` when the artifact bundle is missing, while the
  smaller list endpoints silently return emptiness

This creates a practical bug class:

- one endpoint says the run exists
- another says it does not
- another says it exists but just has no turns or artifacts

Recommendation:

- decide whether artifact data is optional child data or required run data
- if it is optional child data, return explicit availability information instead of overloading
  `404` and `[]`
- if it is required, validate run existence consistently across every `/agent/runs/:runId/*`
  endpoint

### 6. `symphony_agent_event_log` is weaker than `symphony_events` in important ways

Compared with `symphony_events`, the analytics event log has a less explicit data contract:

- it does not persist `payloadBytes`
- it does not store a summary column
- `payloadTruncated` is always written as `false`
- large payloads move to overflow, but the row itself does not describe that with a dedicated
  semantic field
- raw harness payload lives in a side overflow record, not in the main event model

The read store later reconstructs event size with `byteLength(JSON.stringify(payload))`, which is a
derived number, not the original persisted size.

Why this matters:

- the analytics event log is not an equal-quality event authority
- consumers reading “event” data are already dealing with a weaker representation
- the codebase now has two event stores with different semantics and different guarantees

Recommendation:

- keep `symphony_events` and `symphony_agent_event_log` separate
- treat `symphony_events` as the curated runtime/product event ledger
- treat `symphony_agent_event_log` as the raw harness journal plus projection sidecar source
- stop using the raw harness journal to answer runtime-level questions unless it is being
  intentionally projected into the curated runtime ledger

### 7. Task snapshots are useful, but the projection policy is not explicit enough

`symphony_agent_task_snapshots` is one of the more valuable analytics additions because it records
append-only snapshots instead of only the latest state. That is good.

The weak spots are:

- `sourceKind` is free text in storage
- the API contract only requires `sourceKind` to be a non-empty string
- the projection can be built from structured `queue_update` payloads or from heuristic parsing of
  `[Steering]` and `[Follow-up]` labels
- unknown task states normalize to `"pending"`
- todo-list item lifecycle is inferred from this projection logic

That means the product is mixing:

- raw queue semantics
- heuristic todo-list semantics
- item-completion inference

without a strong contract describing which one is authoritative.

Recommendation:

- keep task snapshots as append-only derived artifacts
- add explicit enums for `sourceKind` and snapshot item `state`
- distinguish structured snapshots from heuristic projections
- do not let heuristic task parsing quietly define item completion rules unless that policy is
  made first-class

### 8. The legacy analytics schema package shows the rename is incomplete at the model level

`packages/agent-analytics/src/schema.ts` still defines a parallel `codex_*` schema that mirrors the
new `symphony_*` tables almost exactly.

This is not just naming debt. It signals that the model still conceptually lives in two eras:

- a historical harness-specific analytics story
- a newer Symphony runtime story

Recommendation:

- either delete the legacy schema package once migration coverage is complete
- or quarantine it behind an explicit compatibility boundary
- do not let the old schema continue shaping how new persistence decisions are made

### 9. The UI is already compensating for split authority

The run screen explicitly loads:

- forensics run detail
- agent run artifacts

and then merges them again in the client:

- `agentStatus` falls back from `runDetail.run.agentStatus` to `runArtifacts.run.status`
- token totals fall back across multiple layers
- transcript and performance views degrade when artifacts are absent
- the hook carries an `agentError` branch because the main run can succeed while artifacts fail

That is a downstream symptom of the storage model, not just a frontend detail.

Recommendation:

- stabilize the backend contract so the UI can consume one explicit run authority object plus one
  optional artifact bundle
- stop forcing the web app to decide which backend layer is “really” telling the truth

## Table-by-Table Direction

| Table | Recommendation | Why |
| --- | --- | --- |
| `symphony_agent_runs` | Demote or remove | Duplicates run authority and triggers read-time merging |
| `symphony_agent_turns` | Demote or remove | Duplicates turn authority and creates endpoint inconsistency |
| `symphony_agent_event_log` | Keep and reclassify | Useful raw harness/event artifact store, but should not answer runtime-summary questions |
| `symphony_agent_payload_overflow` | Keep | Legitimate child artifact table for large payloads and raw harness side data |
| `symphony_agent_items` | Keep, with explicit parentage | Useful item lifecycle projection if attached to a declared parent graph |
| `symphony_agent_command_executions` | Keep | Valuable child artifact; should stop inventing canonical command state |
| `symphony_agent_tool_calls` | Keep, but split raw from derived | Useful artifact, but current merged `argumentsJson` semantics are too fuzzy |
| `pi_reads` / `pi_edits` / `pi_writes` / `pi_greps` / `pi_finds` | Keep | Best part of the model: typed child artifacts, but they need enforced 1:1 parentage |
| `pi_message_ends` | Keep, likely rename later | Useful typed response metadata child table |
| `symphony_agent_messages` | Keep | Clear child artifact table |
| `symphony_agent_reasoning` | Keep | Clear child artifact table |
| `symphony_agent_file_changes` | Keep, define latest-vs-history policy | Useful, but currently latest-state only while task snapshots are append-only |
| `symphony_agent_task_snapshots` | Keep | Valuable append-only artifact history |
| `symphony_agent_task_snapshot_items` | Keep | Legitimate child table if tied strongly to snapshot parent |

## Recommended Cleanup Order

1. Rebase forensics run summaries on the runtime graph first.

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- delivery reports

2. Make artifact API semantics explicit.

- either every artifact route proves run existence
- or every artifact route reports projection availability separately from emptiness

3. Stop normalizing invalid persisted state into valid business state.

- no more unknown status -> `"running"`
- no more unknown task state -> `"pending"`
- no more silent empty resource profiles for malformed rows

4. Split raw observed tool-call data from derived typed projections.

- one raw snapshot contract
- one normalized typed child layer
- no heuristic merged “canonical” raw JSON

5. Remove or demote `symphony_agent_runs` and `symphony_agent_turns`.

- once forensics and UI can run without them as authority

## Decision Update

Current direction:

- keep `symphony_events` and `symphony_agent_event_log` separate
- remove `symphony_agent_runs` and `symphony_agent_turns` as long-term persisted authority tables
  after reader migration

Opinion:

- `symphony_events` should answer “what happened in the runtime/product flow”
- `symphony_agent_event_log` should answer “what exactly did the harness emit while that happened”

The next research slice should therefore focus on the dual event-store contract:

- allowed writers
- allowed readers
- current contract violations
- how to restore `symphony_events` as a live canonical ledger instead of leaving it mostly
  aspirational

Follow-up update:

- that event-ingress slice is now documented in
  [2026-04-08-canonical-event-ingress-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-canonical-event-ingress-investigation.md)
- the run/turn collapse follow-up is now documented in
  [2026-04-08-run-turn-authority-collapse-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-run-turn-authority-collapse-investigation.md)
