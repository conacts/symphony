# Dual Event Store Contract Review

Date: 2026-04-08

## Goal

Decide how `symphony_events` and `symphony_agent_event_log` should coexist.

This slice starts from an explicit opinion:

- the two tables should remain separate

But keeping both only makes sense if their contracts are clear. Right now they are not.

## Opinionated Position

Keep both tables.

The right separation is:

- `symphony_events` = curated runtime/product event ledger
- `symphony_agent_event_log` = raw harness journal

Those are different jobs.

Trying to force them into one table would either:

- weaken the canonical runtime ledger into “just a JSON log”
- or over-constrain raw harness capture until it stops being useful for debugging and projection
  work

So the design direction is correct. The current implementation is not.

## The Real Problem

The current codebase does not have a healthy dual-store model.

It has this instead:

- a canonical runtime ledger that is barely written in the live runtime path
- a raw harness journal that is actively written and then reused for product-facing summaries

That is not separation of concerns. It is authority inversion.

## Current Write Paths

### `symphony_events`

The canonical runtime event ledger is written by `SqliteSymphonyRuntimeRunLedger.recordEvent()` in
[sqlite-runtime-run-ledger.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/sqlite-runtime-run-ledger.ts#L102).

That path:

- validates the run and turn
- assigns per-turn `eventSequence`
- stores curated fields like `itemType`, `itemStatus`, `payloadBytes`, and `summary`
- records a related issue timeline entry

This is exactly what a canonical runtime event store should look like.

The problem is that the live runtime path does not appear to call it.

I traced runtime event ingestion and found:

- production runtime updates flow through `agent-harness-runtime.ts`
- that path writes `agentAnalytics.recordEvent()` in
  [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L460)
- I did not find a production call site that invokes `runtimeRunLedger.recordEvent()` or
  `SqliteSymphonyRuntimeRunLedger.recordEvent()`

So today `symphony_events` is canonical by schema intent, but not by live ingest reality.

### `symphony_agent_event_log`

The raw harness journal is written by `SqliteAgentAnalyticsStore.recordEvent()` in
[agent-analytics-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-store.ts#L186).

That path:

- appends a per-run `sequence`
- stores the projected event payload inline or in overflow
- records projection-loss overflow
- records raw-harness overflow
- updates item projections and run/turn rollups

This is a reasonable raw-harness journal plus projector ingress.

The design issue is not that it exists. The issue is that it is now the only live per-event ingest
path.

## Current Read Paths

### Runtime/product-style readers

The codebase already has a runtime-oriented reader for canonical events:

- `fetchRunExport()` in
  [sqlite-runtime-run-ledger.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/sqlite-runtime-run-ledger.ts#L287)

That export reads:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`

This is a clean runtime authority read.

But it is barely used. I did not find an API route exposing that canonical event export in the
current app flow.

### Forensics and run detail readers

The main read path used by the app is `createSqliteAgentAnalyticsReadStore()`, which is wired into
forensics in
[runtime-services.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-services.ts#L154).

That means the production forensics surface is built from the analytics reader, not the runtime
ledger reader.

That analytics reader currently uses `symphony_agent_event_log` in three problematic ways:

1. `listRuns()` converts agent event-log rows into summary event rows and feeds them into
   `buildRuntimeRunSummary()` in
   [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L121)

2. `fetchRunDetail()` uses `buildForensicsEvents()` over `symphony_agent_event_log`, not over
   `symphony_events`, in
   [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1818)

3. `fetchRunArtifacts()` exposes raw journal events back to the UI in
   [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L270)

Only the third usage is a clean fit for the raw journal.

The first two are contract violations.

## What Each Store Should Mean

### `symphony_events`

This store should answer:

- what happened in the runtime flow
- what happened in the product-visible run lifecycle
- what operator-facing event sequence belongs to each turn
- what event counts and last-event summaries are valid for runtime forensics

This table should be:

- stable
- curated
- product-readable
- safe to summarize directly

It should not need raw harness payload fidelity to do its job.

### `symphony_agent_event_log`

This store should answer:

- what exact harness event was observed
- what raw payload overflow belongs to that event
- what projection losses were encountered
- what event stream fed the artifact projectors
- what debug event history should be visible in deep run inspection

This table should be:

- SDK or harness-shaped
- append-only
- tolerant of overflow sidecars
- not trusted as the main runtime-summary source

## Why Separation Is Better Than Unification

### 1. Different stability requirements

`symphony_events` wants stable semantics. It should evolve slowly and intentionally.

`symphony_agent_event_log` wants fidelity. It should preserve odd raw payload details, harness
quirks, and sidecar references without forcing product code to understand them.

### 2. Different retention and cost profiles

The canonical runtime ledger is durable control-plane history.

The raw harness journal is high-volume debugging and transcript infrastructure. It is much easier
to retain, compact, or prune differently if it stays separate.

### 3. Different consumers

Operator summaries and issue-level analytics want curated semantics.

Transcript debugging and projection rebuilds want raw-ish harness data.

One table serving both would produce a compromised contract for both.

### 4. A raw journal should not be forced to pretend it is semantically complete

The raw journal currently carries:

- `rawPayloadOverflowId`
- `projectionLossOverflowId`
- harness-derived payload blobs

That is exactly the kind of detail a product-facing canonical event ledger should not need.

## Current Contract Violations

### 1. `symphony_events` is canonical in name, not in live practice

This is the highest-severity problem in the slice.

If the live runtime is not feeding the canonical event ledger, then:

- the table is stale or empty in real runs
- any code calling it authoritative is relying on a contract the runtime is not honoring
- the raw harness journal becomes canonical by accident

### 2. Forensics summaries are crossing the boundary

`listRuns()` currently computes runtime summaries partly from `symphony_agent_event_log`.

That should never happen if the stores stay separate.

### 3. Forensics run detail is crossing the boundary

`fetchRunDetail()` currently builds its turn event list from the raw harness journal.

That makes the forensics layer semantically dependent on raw capture instead of curated runtime
events.

### 4. The canonical event ledger is underexposed

The code has a canonical export surface via `fetchRunExport()`, but the app routes do not appear to
use it.

That is backwards. The curated event model should be easier to consume than the raw one.

### 5. The raw journal is weaker than the curated ledger

Even if you ignored the authority question, `symphony_agent_event_log` still has a weaker contract:

- no persisted `payloadBytes`
- no persisted summary
- `payloadTruncated` is written `false` even when payload goes to overflow

That makes it especially unsuitable as a runtime-summary source.

## Recommended Contract

### Allowed writers

`symphony_events`

- only a curated runtime-event projector or runtime-event ingress path may write here
- writer must operate in the live runtime path
- writer should run in the same transaction boundary as any paired raw-journal write when both are
  created from the same ingress event

`symphony_agent_event_log`

- only the harness analytics ingress path may write here
- this store should remain raw-journal first, projector-ingress second

### Allowed readers

`symphony_events`

- runtime summaries
- run export
- forensics run detail
- operator-facing event timelines linked to run/turn

`symphony_agent_event_log`

- artifact debug views
- raw event inspection
- projection rebuilds
- transcript-side overflow inspection

### Prohibited readers

`symphony_agent_event_log` should not be used for:

- runtime event counts
- last-event timestamps for run summaries
- canonical turn event lists in forensics
- operator-facing “what happened in the run” answers

## Implementation Direction

### Recommendation A: restore the canonical ledger

This is the path I would take.

1. Add a live write path for `symphony_events` at the same ingress boundary that currently writes
   `symphony_agent_event_log`.

Implementation note:

- do not directly reuse `SqliteSymphonyRuntimeRunLedger.recordEvent()` as-is
- the SQLite implementation currently fans event writes into the issue timeline, while the
  file-backed ledger does not
- that makes the existing writer a leaky abstraction for production ingress
- see
  [2026-04-08-canonical-event-ingress-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-canonical-event-ingress-investigation.md)
  for the recommended ingress shape

2. Curate, do not mirror blindly.

Only write runtime/product-relevant event shapes into `symphony_events`. The raw journal can keep
the full harness detail.

3. Move forensics run summaries back onto:

- `symphony_runs`
- `symphony_turns`
- `symphony_events`
- delivery reports

4. Keep `/agent/runs/:runId/artifacts` and debug event views on top of the raw journal.

5. Add a shared correlation key between the two stores for paired events.

Without that, dual-store debugging will always require heuristic matching.

### Recommendation B: if we will not restore the live canonical writer, demote `symphony_events`

This is my fallback, not my preferred path.

If the team does not want to maintain a curated event projector in the live runtime path, then the
honest move is:

- stop calling `symphony_events` authoritative
- stop expecting runtime summaries to come from it later
- document that the raw harness journal is the only live event source

I do not recommend this because it collapses runtime semantics back into harness semantics and makes
future API cleanup harder.

## Recommended Follow-Up Work

1. Add a live writer for curated runtime events.

2. Repoint `buildForensicsRunSummary()` and `fetchRunDetail()` away from
   `symphony_agent_event_log`.

3. Expose the curated event stream through the API in a way the app can consume directly.

4. Leave raw event inspection in the agent artifact API.

5. Tighten the raw journal contract so it clearly advertises overflow and original payload size.

## Bottom Line

The right model is not one event store. The right model is:

- one curated canonical runtime ledger
- one raw harness journal

The design is sound.

The current bug is that the raw harness journal is doing the canonical ledger’s job because the
canonical ledger is not fully wired into the live runtime and read paths.
