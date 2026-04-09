# Storage Integrity Review Plan

Date: 2026-04-08

## Goal

Break the storage-to-UI cleanup into explicit research slices, starting at the database boundary.
The main objective is to make the application flows more obvious, reduce optionality that hides
bugs, and make the persistence model reject impossible states instead of quietly tolerating them.

This document is intentionally opinionated. It is meant to surface the bigger fish first: state
authority, schema integrity, and cross-layer drift.

## Working Principles

- Required by default. Fields should only be optional when the product flow can clearly explain why
  absence is valid.
- One fact, one owner. If two tables can both claim authority over the same state, we should assume
  drift until proven otherwise.
- The database should reject impossible states. Runtime code should not be the only integrity
  mechanism.
- Read models may be lossy, but authority models must be explicit.
- Compatibility layers should live at the boundary, not leak through active names and table shapes.
- Prefer obvious product language over historical harness language.
- No legacy preservation. If a path is stale, unused, or only survives to protect old semantics,
  it should be deleted instead of folded into the new model.

## Research Slices

### Slice 1: Database Authority and Integrity

Scope:

- `packages/db/src/schema.ts`
- `packages/db/migrations/*.sql`
- `packages/db/src/client.ts`
- `packages/db/src/migration-runner.ts`
- every store that writes directly to the database

Questions:

- Which tables are authoritative, and which are derived projections?
- Which columns are optional only because the schema is permissive?
- Which relations should be enforced with foreign keys, uniqueness, or `CHECK` constraints?
- Which defaults are product decisions, and which are convenience leaks?

Deliverable:

- a written table-by-table audit
- a proposed authority graph
- a concrete migration agenda for required columns, foreign keys, and enum constraints

### Slice 2: Runtime State Machine and Run/Turn Authority

Scope:

- `packages/runtime-run-ledger/*`
- `packages/db/src/runtime-run-store.ts`
- `packages/db/src/sqlite-runtime-run-ledger.ts`
- runtime state docs under `docs/architecture/*state-machine*`

Questions:

- What is the actual runtime state machine today?
- Which states are issue-level, run-level, turn-level, or tracker-level?
- Which states are persisted as free text but should be explicit enums?
- Which state transitions are currently implicit or reconstructed after the fact?

Deliverable:

- a canonical run/turn/issue state map
- a decision on whether `runMode`, status, and outcome belong in first-class columns
- a list of states that must stop being generic strings

### Slice 3: Agent Analytics Ingestion and Projection Cleanup

Scope:

- `packages/db/src/agent-analytics-store.ts`
- `packages/db/src/agent-analytics-read-store.ts`
- `packages/agent-analytics/*`
- typed Pi projection tables

Questions:

- Should `symphony_agent_*` stay as persisted projections, or should some of that state be
  recomputed from authoritative runtime data?
- Which projections are valuable snapshots, and which are duplicated authority?
- Which projections should be strictly child records of a parent row instead of free-floating rows?

Deliverable:

- a projection policy for each `symphony_agent_*` and `pi_*` table
- a list of tables that can be simplified, renamed, or deprecated
- a follow-up decision on canonical event ingress and forensics reader ownership if
  `symphony_events` and `symphony_agent_event_log` remain separate

### Slice 4: API Contract Hardening

Scope:

- `apps/api/src/http/routes/*`
- `packages/contracts/*`
- API serializers and read models

Questions:

- Where do API contracts still accept or emit fuzzy shapes?
- Which request params should be required but are currently optional?
- Where do API read models normalize invalid stored data instead of rejecting it?

Deliverable:

- a contract hardening plan for request validation and response normalization
- an explicit rule for `404` versus empty collections versus degraded artifact responses
- a decision on whether issue identity must be `repo + issueIdentifier` at the API boundary
- a list of fields that should stop being nullable in API responses once the DB is tightened

### Slice 5: UI Schema Adoption

Scope:

- `apps/web/src/features/**/*`
- view models, query state, and hooks

Questions:

- Which UI branches exist only because backend state is ambiguous?
- Which screens can become simpler once runtime and analytics state are explicit?
- Which component props are optional only because upstream data is under-specified?

Deliverable:

- a UI rewiring plan over the stabilized backend schema
- a list of view-model simplifications unlocked by the earlier slices

### Slice 6: Naming, Defaults, and Compatibility Debt

Scope:

- public package exports
- legacy aliases
- compatibility mappings

Questions:

- Which old names still imply the wrong mental model?
- Which defaults hide missing product decisions?
- Which normalizers silently convert invalid states instead of surfacing them?

Deliverable:

- a deprecation and rename list
- a short compatibility strategy so cleanup does not sprawl across every layer

## Initial Database Findings

### 1. Foreign keys are effectively not being used

`packages/db/src/client.ts` enables `PRAGMA foreign_keys = ON`, but `packages/db/src/schema.ts`
does not declare foreign key relations for the main runtime graph or the projection graph. That
means the DB is not actually protecting us from orphaned turns, events, delivery reports, timeline
entries, or typed Pi rows.

Why this matters:

- runtime code must manually preserve graph integrity everywhere
- orphaned data becomes possible any time a write path changes order or partially fails
- reader code has to defensively tolerate impossible combinations

Direction:

- make the runtime graph explicit: `issue -> run -> turn -> event`
- attach support tables to their true parents with foreign keys
- decide which child tables should cascade on delete and which should restrict deletion

### 2. We currently have two run graphs, not one

There is a runtime run graph in `symphony_issues`, `symphony_runs`, `symphony_turns`, and
`symphony_events`. There is also an agent analytics run graph in `symphony_agent_runs`,
`symphony_agent_turns`, and related rollup tables.

`packages/db/src/agent-analytics-store.ts` shows the problem clearly:

- `startRun()` can write `symphony_agent_runs` directly
- `ensureAgentRunRecord()` backfills `symphony_agent_runs` from `symphony_runs` if the agent-side
  row is missing

That is a partial synchronization scheme, not a clear ownership model.

Why this matters:

- issue identity, thread identity, run status, and start/end timing are duplicated
- the read layer has to merge runtime rows and agent rows to answer simple questions
- bugs will look like “the run exists, but only in one graph”

Direction:

- declare one authoritative run/turn graph
- keep projections as strict children of the authoritative graph
- stop letting projection tables invent or recover authority on their own

### 3. Status and outcome fields are too permissive across layers

The runtime store normalizes statuses to a known set in `packages/db/src/sqlite-runtime-run-ledger.ts`,
but the persisted schema stores them as free text, and the ledger types in
`packages/runtime-run-ledger/src/runtime-run-ledger-types.ts` still expose many statuses as plain
`string`.

The read layer then compensates in `packages/db/src/agent-analytics-read-store.ts` by normalizing
unknown values back to defaults such as `"running"`.

Why this matters:

- invalid values can be stored
- invalid values can be silently reinterpreted instead of surfaced
- the true product state machine stays implicit

Direction:

- use one shared status vocabulary per authority level
- enforce it in the DB with `CHECK` constraints or equivalent enum enforcement
- stop defaulting unknown persisted statuses to a real state in readers

### 4. `repositoryKey` is still treated like a convenience default

Several write paths default `repositoryKey` to `"default"`:

- `packages/db/src/runtime-run-store.ts`
- `packages/db/src/issue-timeline.ts`
- `packages/db/src/runtime-logs.ts`
- `packages/db/src/issue-delivery-reports.ts`
- `packages/runtime-run-ledger/src/file-backed-runtime-run-ledger.ts`
- `apps/api/src/core/runtime-repository-key.ts`

This may be reasonable for fixtures or single-repo local development, but it is a weak fit for a
system that wants explicit repository routing and durable issue workspaces.

Why this matters:

- missing repository identity is being papered over instead of rejected
- multi-repo correctness depends on call-site discipline
- support tables can end up attached to a synthetic repository identity

Direction:

- require `repositoryKey` at the first real ingress boundary
- keep `"default"` only as a deliberate fixture/bootstrap mode, not a normal persistence fallback
- make repository identity immutable once a run is created

### 5. Migration checksums are recorded but not verified

`packages/db/src/migration-runner.ts` stores a checksum in `symphony_migrations`, but startup only
checks whether a migration name has already been applied. If a migration file is edited later, the
runner will not fail fast.

Why this matters:

- migration drift can go undetected
- a modified migration file can silently stop matching real databases
- the stored checksum currently has no enforcement value

Direction:

- verify checksums for already-applied migrations on startup
- fail hard on checksum mismatch
- treat altered historical migrations as an operational error

### 6. Some core product fields are still hiding inside generic JSON

`runMode` is stored inside `metadata` by `packages/db/src/runtime-run-store.ts` instead of being a
first-class runtime column. Other columns such as `repoStart`, `repoEnd`, `usage`, and various
payload blobs are intentionally JSON, but not all JSON fields are equally harmless.

Why this matters:

- important product state becomes harder to query and harder to constrain
- API and UI code need secondary parsing knowledge to interpret core flow data
- “optional metadata” becomes a dumping ground for missing schema decisions

Direction:

- promote product-critical fields to first-class columns
- keep JSON for genuinely extensible data, not for primary control-plane state

### 7. Legacy naming and compatibility aliases still blur the model

A few examples:

- `packages/db/src/index.ts` still exports `createSqliteSymphonyRuntimeRunLedger` under the alias
  `createSqliteSymphonyRunJournal`
- `packages/agent-analytics/src/schema.ts` still exposes `codex_*` table definitions even though
  the active DB schema is `symphony_*`
- read paths still normalize `"finished"` into `"completed"`

Why this matters:

- the codebase still carries multiple mental models at once
- new code can easily attach to the wrong vocabulary
- cleanup work gets deferred because compatibility is spread everywhere

Direction:

- isolate compatibility at the edge
- stop exporting old authority terms as first-class active names
- make the current domain language singular and obvious

## Table Review

### Runtime Authority Tables

- `symphony_issues`: This should be the durable issue anchor. It is already close, but nothing in
  the schema is forced to reference it. Make it the root identity table for issue-scoped runtime
  data.
- `symphony_runs`: This looks like the intended authoritative run table. It should own repository,
  issue, status, outcome, run mode, workspace identity, and core timing. Status and outcome need
  stronger enforcement, and `runMode` should not live only in `metadata`.
- `symphony_turns`: This should be a strict child of `symphony_runs`. It should not exist without a
  parent run. `status` should be constrained, and any “eventually known” identity fields should be
  reviewed to determine which are truly nullable versus merely late-bound.
- `symphony_events`: This is the authoritative event ledger. It should be a strict child of both
  run and turn. It should stay separate from raw harness capture and only hold curated
  runtime/product events. The schema should reject events whose turn does not belong to the given
  run.

### Projection and Analytics Tables

- `symphony_agent_event_log`: Valuable as a high-fidelity raw harness journal, and it should stay
  separate from `symphony_events`. The main fix is to enforce that it remains a child artifact
  store, not an alternate source for runtime summaries or operator-facing state.
- `symphony_agent_payload_overflow`: Useful storage support table. It should be tied more explicitly
  to the rows that reference it, or at least to a parent run/turn/item graph.
- `symphony_agent_runs`: This is currently the most dangerous table in the schema because it looks
  authoritative and is partially backfilled from `symphony_runs`. Either demote it to an explicit
  projection or merge its authority into the runtime run table.
- `symphony_agent_turns`: Same concern as `symphony_agent_runs`. It duplicates turn authority while
  also acting as a rollup table.
- `symphony_agent_items`: Reasonable projection table, but it should be an explicit child of a
  parent agent turn or tool-call row, not a free-floating composite key that depends on convention.
- `symphony_agent_command_executions`: Good candidate for a child projection of an item/tool event
  stream. The parent relation should be explicit.
- `symphony_agent_tool_calls`: Useful projection, but typed Pi child tables currently rely on
  convention rather than enforced 1:1 parentage.
- `symphony_agent_messages`: Clear projection table. The main improvement is relation integrity and
  deciding whether empty content is ever valid.
- `symphony_agent_reasoning`: Same story as messages. It should be a strict child record, not an
  independently survivable row.
- `symphony_agent_file_changes`: Useful for read models. It should be attached to an authoritative
  event or item identity, not just a composite convention.
- `symphony_agent_task_snapshots`: Valuable snapshot artifact. It should clearly reference the item
  or turn it was derived from.
- `symphony_agent_task_snapshot_items`: Good child table, but the parent relation to
  `symphony_agent_task_snapshots` should be enforced in the DB.

### Typed Pi Tool Tables

- `pi_reads`: This is a good example of moving structure out of opaque JSON. It should remain a
  typed child row of a parent tool-call record.
- `pi_edits`: Same as `pi_reads`. It is useful, but it should be relationally attached to its tool
  call and reviewed for which fields should be mandatory after insert.
- `pi_writes`: This table is moving in the right direction, but it still carries “late optional”
  fields such as `bytesWritten` and diff data that need explicit semantics.
- `pi_greps`: Useful typed projection. It should explicitly define whether `searchPath` and
  `ignoreCase` are truly nullable or simply absent in older events.
- `pi_finds`: Same as `pi_greps`.
- `pi_message_ends`: Valuable for token accounting, but it should be attached to the exact message
  or item identity it summarizes and not rely on convention alone.

### Support and Operational Tables

- `symphony_issue_timeline_entries`: Good append-only support table, but it is denormalized and not
  tied to parent issue/run rows in the schema. That makes support history easier to corrupt.
- `symphony_issue_delivery_reports`: The store layer already enforces useful rules, such as blocked
  reports requiring a blocking reason and completed reports requiring a PR URL. Those rules should
  be reflected in the schema where practical.
- `symphony_runtime_logs`: This table currently tolerates a nullable `repositoryKey`. For a system
  that cares about explicit routing, that is too loose for anything except truly global logs.
- `symphony_github_ingress`: Reasonable dedupe journal, but the semantic uniqueness rule is enforced
  only in code. If semantic dedupe is a real invariant, the DB should help express it.
- `symphony_migrations`: Necessary operational table. It should be paired with real checksum
  validation, otherwise the stored checksum is informational only.

## Immediate Refactor Agenda for the DB Slice

1. Declare authority.

- `symphony_issues`, `symphony_runs`, `symphony_turns`, and `symphony_events` should become the
  explicit runtime authority graph unless we intentionally choose otherwise.
- `symphony_agent_*` and `pi_*` tables should be described as projections or artifacts, not a
  second authority path.

2. Enforce relations.

- Add foreign keys across the authority graph first.
- Add foreign keys from projection tables to their parent runtime or tool-call rows next.
- Decide cascade behavior table by table instead of leaving deletion semantics undefined.

3. Tighten required fields.

- Require `repositoryKey` at real ingress points.
- Promote `runMode` out of `metadata`.
- Revisit nullable runtime identity fields and make a decision on each one.

4. Tighten state vocabularies.

- Replace free-text status fields with constrained values.
- Stop silently normalizing unknown persisted states to live product states in readers.

5. Harden migrations.

- Verify applied migration checksums.
- Treat checksum mismatches as fatal.

## Suggested Order for Future Sessions

1. Runtime authority tables and migration strategy
2. Agent analytics projection demotion or cleanup
3. API contract hardening over the tightened schema
4. UI rewiring over the explicit runtime and projection model
5. Naming and compatibility cleanup once the new authority model is stable

Progress on that sequence now exists in:

- [2026-04-08-runtime-state-authority-review.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-runtime-state-authority-review.md)
- [2026-04-08-agent-analytics-projection-authority-review.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-agent-analytics-projection-authority-review.md)
- [2026-04-08-dual-event-store-contract-review.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-dual-event-store-contract-review.md)
- [2026-04-08-canonical-event-ingress-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-canonical-event-ingress-investigation.md)
- [2026-04-08-run-turn-authority-collapse-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-run-turn-authority-collapse-investigation.md)
- [2026-04-08-runtime-owned-agent-context-investigation.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-runtime-owned-agent-context-investigation.md)
- [2026-04-08-research-north-star-and-action-program.md](/Users/connorsheehan/.codex/worktrees/112e/symphony/docs/analysis/2026-04-08-research-north-star-and-action-program.md)

## Notes for the Next Session

- Start by drawing the desired relational graph on paper before changing code.
- Decide whether `symphony_agent_runs` and `symphony_agent_turns` stay as persisted tables at all.
- Decide whether `runMode` is important enough to deserve a first-class column. It probably is.
- Decide which support tables may legitimately omit `repositoryKey`. The likely answer should be
  “very few”.
- Treat runtime session/provider context as explicit runtime-owned data, not log-derived state.
