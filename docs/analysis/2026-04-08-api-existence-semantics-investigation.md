# API Existence Semantics Investigation

Date: 2026-04-08

## Goal

Define one explicit API contract for:

- missing parent resources
- existing parents with empty child collections
- missing artifact/debug rows
- invalid or stale stored data

This slice is also where the user’s no-legacy stance matters directly.

If an endpoint only behaves because of compatibility shims, shadow tables, or stale names, the
contract should be tightened and the legacy behavior should be removed instead of preserved.

## Executive Position

My recommended contract is:

- return `404` only when the canonical parent resource does not exist, or when a specifically
  addressed child resource does not exist
- return `200` with empty arrays when the parent exists but no child rows exist
- never let shadow-table absence decide whether a runtime run “exists”
- stop treating “no rows matched” as equivalent to “resource not found”
- make issue identity explicit in the API, because the storage model is keyed by
  `repositoryKey + issueIdentifier`, not `issueIdentifier` alone
- remove legacy route names, legacy helpers, and silent compatibility normalization instead of
  building new code around them

This is the clean rule:

- control-plane endpoints answer existence from control-plane authority
- artifact endpoints answer existence from the parent runtime run, not from projection completeness
- empty collections are data
- missing parents are errors

## Why This Slice Exists

The current contracts already want stricter semantics than the implementation gives them.

For example, the forensics response schemas allow empty collections:

- issue detail allows `runs: []` in
  [responses.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/responses.ts#L245)
- issue timeline allows `entries: []` in
  [responses.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/responses.ts#L285)
- forensics bundle allows empty `recentRuns`, `timeline`, and `runtimeLogs` in
  [responses.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/responses.ts#L470)
  and the contract test already validates that shape in
  [forensics.test.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/contracts/src/domain/forensics/forensics.test.ts#L657)

So the repository already has the schema vocabulary for “resource exists, but this slice is empty.”

The route/store composition is what is still blurring that distinction.

## What The Current Code Is Telling Us

### 1. The agent artifact family has inconsistent existence semantics

The route layer returns `404` for the top-level artifacts bundle:

- `GET /api/v1/agent/runs/:runId/artifacts` returns `404` when
  `fetchRunArtifacts()` returns `null` in
  [agent-analytics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/agent-analytics-routes.ts#L27)

But the sibling collection endpoints do not validate run existence at all:

- `GET /turns`
- `GET /items`
- `GET /command-executions`
- `GET /tool-calls`
- `GET /agent-messages`
- `GET /reasoning`
- `GET /file-changes`

See
[agent-analytics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/agent-analytics-routes.ts#L71)
and the underlying store list methods in
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L333).

That means the same missing run can currently produce:

- `404` from `/artifacts`
- `200` with `[]` from `/items` or `/tool-calls`

That is not a contract. It is a leak from implementation details.

### 2. Shadow-graph presence is still deciding whether a run exists

`fetchRunArtifacts()` depends on `loadRunData()`.

`loadRunData()` returns `null` when the runtime run is missing, which is correct, but it also
returns `null` when `symphony_agent_runs` is missing:

- `if (!agentRun || !issue) return null`

See
[agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L1898).

That is exactly the wrong authority boundary for the system we are converging on.

The parent run exists if `symphony_runs` says it exists.

Projection incompleteness should degrade artifact detail, not erase run existence.

### 3. Timeline currently conflates “no entries yet” with “issue missing”

The issue timeline port returns `null` whenever the timeline store returns zero rows:

- `return entries.length === 0 ? null : ...`

See
[runtime-observability-ports.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-observability-ports.ts#L12).

The route then treats `null` as “Issue not found” and returns `404`:

- `GET /api/v1/issues/:issueIdentifier/timeline`

See
[forensics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/forensics-routes.ts#L153).

So today:

- existing issue, zero timeline entries
- missing issue

produce the same API response.

That hides useful product state and makes timelines look less trustworthy than they are.

### 4. Issue detail and issue bundle also collapse zero-run state into 404

The forensics read model returns `null` for issue detail when `runs.length === 0`:

- see
  [symphony-forensics-read-model.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/forensics/src/symphony-forensics-read-model.ts#L213)

It does the same for the issue forensics bundle:

- see
  [symphony-forensics-read-model.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/forensics/src/symphony-forensics-read-model.ts#L254)

The routes then translate that `null` into `404`:

- issue detail in
  [forensics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/forensics-routes.ts#L192)
- issue bundle in
  [forensics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/forensics-routes.ts#L101)

That is too aggressive for two reasons:

- the response contracts already allow empty collections
- “issue exists but no runs match this view yet” is a real state, not a missing resource

### 5. The UI has already started compensating for the API inconsistency

The run page treats run detail as authoritative and artifacts as optional:

- `useAgentRun()` throws if run detail fails
- but it degrades artifacts to `null` and keeps rendering

See
[use-agent-run.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/features/runs/hooks/use-agent-run.ts#L20).

The analysis sample loader behaves differently:

- if artifact fetch fails, it silently drops that sampled run entirely

See
[load-agent-analysis-sample.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/features/analysis/hooks/load-agent-analysis-sample.ts#L23).

So the same artifact-plane failure currently means:

- degraded run detail page
- deleted sample row in analysis

That is backend ambiguity leaking straight into product behavior.

### 6. Issue identity is still under-specified at the API boundary

The storage model says issue identity is repo-scoped:

- `symphony_issues` has a unique index on `repositoryKey + issueIdentifier`

See
[schema.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/schema.ts#L484).

But issue-scoped routes still identify resources by `:issueIdentifier` with optional `repo`
filters:

- forensics issue detail and timeline in
  [forensics-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/forensics-routes.ts#L153)
- runtime issue detail in
  [runtime-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/routes/runtime-routes.ts#L225)

That means part of resource identity is still hiding inside an optional query param.

I do not think that is a stable end state.

### 7. Legacy naming is still alive in active API-adjacent code

The route helper still exports `buildLegacyRunHref()`:

- see
  [control-plane-routes.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/core/control-plane-routes.ts#L66)

The API tests still use `codex*` variable names while exercising current agent routes:

- see
  [app.test.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/http/app.test.ts#L216)

This is not just cosmetic.

It keeps the old mental model alive in exactly the layer where we are trying to make boundaries
obvious.

## Recommended API Contract

## 1. Existence must come from canonical parents

This should be the general rule:

- `runId` existence comes from `symphony_runs`
- issue existence comes from `symphony_issues`
- turn existence comes from `symphony_turns`
- artifact/projection completeness does not decide parent existence

If a route cannot answer parent existence from a canonical store, the route is not ready.

## 2. Parent resources should 404 only when the parent is actually absent

Recommended behavior:

- `GET /api/v1/runs/:runId`
  - `404` only when the runtime run is absent
- `GET /api/v1/agent/runs/:runId/artifacts`
  - `404` only when the runtime run is absent
  - `200` with empty artifact arrays when the run exists but artifact rows are absent
- `GET /api/v1/issues/:issueIdentifier`
  - `404` only when the issue is absent under explicit issue identity
  - `200` with `runs: []` when the issue exists but has no matching runs
- `GET /api/v1/issues/:issueIdentifier/forensics-bundle`
  - `404` only when the issue is absent under explicit issue identity
  - `200` with empty `recentRuns`, `timeline`, and `runtimeLogs` when the issue exists but those
    slices are empty
- `GET /api/v1/issues/:issueIdentifier/timeline`
  - `404` only when the issue is absent under explicit issue identity
  - `200` with `entries: []` when the issue exists but no timeline entries exist

The important part is not just the status code. It is the meaning:

- `404` means “the addressed resource is not in the authority graph”
- `200` with empty arrays means “the resource exists, but this slice is empty”

## 3. Child collection endpoints should validate the parent first

Recommended behavior for:

- `/agent/runs/:runId/turns`
- `/items`
- `/command-executions`
- `/tool-calls`
- `/agent-messages`
- `/reasoning`
- `/file-changes`

Contract:

- if the parent run does not exist, return `404`
- if `turnId` is provided and that turn does not exist for that run, return `404`
- if the parent exists and no matching child rows exist, return `200` with `[]`

I would not keep the current “return empty list for a missing run” behavior.

It hides bugs in callers and makes debugging much slower.

## 4. Specifically addressed child resources should 404 when missing

`GET /api/v1/agent/runs/:runId/overflow/:overflowId` should stay a `404` when the overflow row is
missing.

But the existence checks should be explicit and ordered:

- if the run does not exist, return `404` for the run
- if the run exists but the overflow row does not, return `404` for the overflow

That keeps the mental model clean and avoids treating orphaned overflow rows as valid.

## 5. Issue identity should become explicit

This repository is already telling us that issue identity is composite:

- `repositoryKey + issueIdentifier`

I would not keep pretending that `issueIdentifier` alone is a complete key.

My preference order is:

1. make issue-scoped routes repo-scoped in the path
2. if path redesign is too disruptive for the first pass, make `repo` required on issue-scoped
   endpoints
3. do not keep `repo` optional once the backend is cleaned up

This applies to:

- runtime issue detail
- forensics issue detail
- issue timeline
- issue forensics bundle

If we keep hidden identity inside optional query params, the API will remain harder to reason about
than the storage model underneath it.

## 6. The API should stop normalizing invalid stored values into valid-looking truth

This is the no-legacy position applied to response semantics.

If stored state is invalid, stale, or from an obsolete vocabulary:

- do not quietly coerce it into a current valid state
- do not silently substitute fake defaults like `"running"`
- fix the data model and migrate the stored data
- fail closed in the adapter if impossible values still get through

Compatibility fields can still exist at the boundary.

Compatibility repair logic should not exist in active control-plane reads.

## UI Consequences

The UI can become simpler once these semantics are fixed.

### Run detail screen

The current degrade-on-artifact-failure model is reasonable only when artifacts are genuinely
optional debug data.

After the API cleanup:

- run detail remains authoritative
- artifact bundle should usually resolve for existing runs
- any remaining artifact failure becomes a true degradation, not a common shadow-graph mismatch

### Analysis/sample screens

The analysis sample should stop deleting runs when artifact fetch fails.

The clean behavior is:

- keep the run in the sample because the run exists
- show empty artifact collections or explicit degraded artifact state

Dropping the run entirely makes missing debug data look like missing control-plane history.

### Runtime issue screen

The runtime client already treats `404` as empty state in
[runtime-operator-client.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/web/src/core/runtime-operator-client.ts#L11).

That is acceptable as long as it remains a deliberate UI choice on top of a clean backend
semantic, not a sign that the API itself is fuzzy.

## No-Legacy Policy Implications

This slice makes the cleanup policy more concrete.

I would explicitly remove:

- `buildLegacyRunHref()` and similar route helpers that keep old route concepts alive
- `codex` naming in active API tests and helpers
- shadow-graph-based `null` semantics in read stores
- response normalizers that translate obsolete stored values into current contract values

I would not preserve old endpoint behavior just because the current clients happen to tolerate it.

The repository is in the right phase to delete obsolete semantics instead of carrying them forward.

## Migration Sequence

1. Add canonical existence checks for issue, run, and turn parents in the relevant ports/read
   adapters.
2. Change issue timeline reads so “issue missing” and “no entries” are distinct outcomes.
3. Change forensics issue detail and bundle reads so existing issues can return empty collections.
4. Rebuild `/agent/runs/:runId/artifacts` on runtime run existence plus runtime-owned context,
   not on `symphony_agent_runs` presence.
5. Make child collection endpoints validate parent existence before querying children.
6. Tighten client behavior so artifact degradation is explicit instead of silently dropping runs.
7. Delete legacy route helpers, stale aliases, and obsolete response normalization once the new
   contract is live.

## Bottom Line

The API should expose the repository’s authority model, not compensate for its current blur.

The rule set is simple:

- missing canonical parent: `404`
- existing parent, empty slice: `200` with empty arrays
- missing specifically addressed child: `404`
- invalid stored state: fail closed and fix it

That contract is more explicit, easier to test, easier to reason about, and much more compatible
with the broader cleanup program than the current mix of nulls, empty arrays, shadow-table gating,
and legacy names.

This slice is strong enough to move the work from research into implementation planning.
