# Research North Star And Action Program

Date: 2026-04-08

## Why This Document Exists

The individual research slices are finding real problems, but they are also converging on one
larger idea.

This document turns those findings into a north star for the repository and a concrete cleanup
program.

The goal is not just to “fix optionals” or “tighten the schema.”

The goal is to make Symphony feel like one explicit control plane for agent work, instead of a
system that reconstructs its own state from overlapping tables, logs, and compatibility shims.

## North Star

Symphony should have:

- one explicit control-plane authority graph
- one explicit runtime state machine
- one explicit runtime session/context model
- one separate artifact plane for raw harness output and typed projections
- database-backed integrity for the main relational graph
- compatibility logic concentrated at boundaries, not spread through storage and readers

The system should be able to answer product questions like:

- what state is this issue in
- what happened in this run
- why did this run fail
- which session/provider/model executed it
- what artifacts did the harness produce

without guessing, backfilling, or reading a raw debug journal as if it were authority.

## The High-Level Model We Are Converging On

### 1. Control plane

This is the durable product truth.

Core graph:

- `symphony_issues`
- `symphony_runs`
- `symphony_turns`
- `symphony_events`

Context and support sidecars:

- `symphony_run_runtime_context`
- `symphony_issue_delivery_reports`
- `symphony_issue_timeline_entries`
- `symphony_runtime_logs`

The control plane answers:

- lifecycle state
- timing
- ownership and identity
- delivery outcome
- provider/session/model context
- operator-facing history

### 2. Artifact plane

This is the harness/raw/typed projection layer.

Core artifact stores:

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

The artifact plane answers:

- what raw harness events were emitted
- what commands/tools/messages/reasoning were observed
- what transcripts and projections should be rendered
- what debugging evidence is available

It does not answer:

- whether the run exists
- what the canonical run status is
- whether the issue was successfully delivered

### 3. Compatibility layer

Some public fields still exist because the UI and contracts use them:

- `agentStatus`
- `agentFailureKind`
- `agentFailureOrigin`
- `agentFailureMessagePreview`

Those should survive only as derived compatibility outputs from runtime-owned state.

They should not justify a second run graph.

## The Central Design Principle

One fact, one owner.

Right now the repository violates that principle in several ways:

- lifecycle truth is duplicated across runtime and agent-run tables
- session/provider context is split between agent tables and parsed logs
- raw event journals are being asked product questions
- readers silently normalize bad state back into valid-looking state

The cleanup program should remove those violations directly.

## No Legacy Preservation

Another principle is now explicit:

- if a code path, alias, table, normalizer, or route helper is stale, unused, or only exists for
  historical compatibility, remove it

This repository is close enough to stability that it should stop carrying legacy semantics forward.

That applies to:

- stale naming that preserves old mental models
- response normalization that rewrites obsolete stored values into live contract values
- shadow-table reads kept alive only because old screens once depended on them
- route helpers and endpoint aliases that no longer match the intended product model

## What “Done” Looks Like

The repository is in a good state when all of these are true:

1. A run exists if and only if the runtime graph says it exists.
2. Runtime and tracker lifecycle transitions are modeled explicitly, not inferred from string
   accidents.
3. Session/provider/model/thread data has one runtime-owned home.
4. Forensics and run detail reads do not depend on `symphony_agent_runs` or
   `symphony_agent_turns`.
5. Raw harness capture remains available without pretending to be control-plane truth.
6. The DB rejects impossible parent/child combinations and impossible state values.
7. UI branching becomes simpler because backend shapes are more explicit.

## Actionable Program

### Track 1: Normalize runtime lifecycle truth

Objective:

- make the runtime state machine explicit and enforceable

Concrete work:

- finalize the canonical run status and outcome vocabularies
- remove implementation-shaped success outcomes where product language should exist
- promote `runMode` to a first-class runtime field
- define which failure classifications are primary runtime concepts versus compatibility labels

Why this matters:

- every later slice depends on a stable lifecycle vocabulary

### Track 2: Restore canonical event and runtime-context ingress

Objective:

- make the runtime control plane actually live again

Concrete work:

- restore live writes to `symphony_events` at runtime ingress
- add `symphony_run_runtime_context` as a 1:1 child of `symphony_runs`
- write session/provider/launch context at the same runtime-owned boundary
- keep `symphony_runtime_logs` as diagnostics, not the primary state source

Why this matters:

- it gives the system one clean place to read runtime truth from

### Track 3: Rebuild forensics around runtime-owned reads

Objective:

- stop using analytics/shadow rows to answer control-plane questions

Concrete work:

- move `/forensics/*` onto a runtime-owned adapter
- derive compatibility fields centrally in that adapter
- stop requiring `agentRun` presence for run detail
- make run summaries come from runtime runs, turns, canonical events, delivery reports, and
  runtime context

Why this matters:

- it breaks the current coupling between product reads and shadow authority

### Track 4: Demote and remove the shadow run graph

Objective:

- eliminate `symphony_agent_runs` and `symphony_agent_turns` as active lifecycle owners

Concrete work:

- stop lifecycle mirroring writes
- update artifact endpoints to build from runtime skeletons plus child artifact tables
- update shutdown reconciliation to stop depending on the shadow run graph
- delete the tables, or keep only explicitly named narrow rollups if proven necessary

Why this matters:

- this is the biggest simplification in the whole cleanup

### Track 5: Enforce relational integrity in the DB

Objective:

- make the database reject obviously invalid states

Concrete work:

- add foreign keys across the runtime authority graph
- add foreign keys from artifact/projection tables to their parents
- add `CHECK` constraints for statuses and delivery/report invariants
- require `repositoryKey` at real ingress points
- verify migration checksums on startup

Why this matters:

- it turns integrity from convention into enforcement

### Track 6: Harden API contracts

Objective:

- make the API reflect the cleaned authority model

Concrete work:

- define consistent existence semantics for run detail and artifact endpoints
- define resource identity explicitly for issue-scoped endpoints instead of hiding it behind
  optional filters
- remove nullable fields that only exist because the backend is currently fuzzy
- stop normalizing bad stored values into valid response values
- make compatibility fields explicit compatibility fields, not mysterious “sometimes present”
  storage echoes
- delete legacy route helpers, aliases, and stale compat names instead of preserving them

Why this matters:

- API clarity is where the cleaned authority model becomes visible to every caller

## Research Readiness

At this point the remaining open questions are mostly sequencing questions, not architecture
questions.

The research is now sufficient to begin implementation in phased passes:

1. runtime authority and ingress cleanup
2. API and forensics reader rewiring
3. shadow-graph removal
4. DB constraint hardening
5. UI rewiring against the explicit model

Why this matters:

- the API is where structural ambiguity currently leaks into the UI

### Track 7: Rewire the UI to the explicit model

Objective:

- cash in the backend cleanup by simplifying view-model logic

Concrete work:

- remove UI fallback branches that merge runtime rows with agent shadow rows
- let run detail trust runtime-owned metadata
- simplify failure analysis and issue history views around explicit status/outcome/failure
  semantics
- reserve artifact reads for transcript/debug/per-command/per-tool detail

Why this matters:

- backend explicitness is only valuable if the UI actually gets simpler

## Remaining Research Agenda

These are the main research leads still worth chasing before implementation starts in earnest.

### 1. API existence semantics

Need a firm contract for:

- when run detail should 404
- when artifact endpoints should 404
- when runtime-only degraded responses are acceptable
- when empty arrays are the right answer versus silent masking

This is the next highest-value slice.

### 2. Migration sequencing for DB hardening

We know what should change.

We still need the safest rollout order for:

- foreign keys
- `CHECK` constraints
- `repositoryKey` hardening
- migration checksum enforcement
- runtime-context sidecar introduction

### 3. Completion taxonomy cleanup

The runtime outcome model still has values that feel too implementation-shaped.

We need one more focused pass to define the product-facing completion vocabulary before it gets
cemented into DB constraints and public read adapters.

### 4. Workspace/state-machine alignment

The docs and runtime behavior still disagree about when workspaces should be preserved versus
destroyed.

That needs one explicit product decision before implementation starts, because it affects runtime
cleanup, operator expectations, and failure recovery semantics.

### 5. Task snapshot and tool-call truth model

These are smaller than the authority work, but still worth a focused pass:

- should stored tool arguments be raw observed payloads or normalized snapshots
- what are the exact semantics of task snapshot `sourceKind`
- which artifact rows are true observations versus derived summaries

### 6. Naming cleanup around auth and provider concepts

This is not the highest-risk area, but it is real design debt.

Example:

- `authMode` currently means both credential transport (`auth_json` / `api_key_env`) and model
  policy selection (`provider` / `subscription`)

That should be straightened out before the new runtime context model hardens around the wrong name.

## What Is No Longer Pure Research

Several ideas are now strong enough that I would stop treating them as open-ended exploration:

- keep `symphony_events` and `symphony_agent_event_log` separate
- restore canonical event writes at runtime ingress
- remove `symphony_agent_runs` and `symphony_agent_turns` as long-term authority tables
- move session/provider/launch context into explicit runtime-owned storage
- rebuild forensics on runtime-owned reads

Those are not fully implemented decisions yet, but they are past the “maybe” stage.

## Recommended Next Move

If we want the next best research slice, I would take:

- API existence semantics

If we want to start converting research into implementation planning right now, I would instead
write a refactor sequence document with:

- dependencies
- milestone ordering
- expected schema changes
- API surface changes
- UI fallout

That would be the bridge from “research” to “execution plan.”
