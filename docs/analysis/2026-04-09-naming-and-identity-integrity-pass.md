# Naming And Identity Integrity Pass

Date: 2026-04-09

## Conclusion

Yes. The `session_id` versus `sessionId` situation is a bug waiting to happen.

The real problem is larger than one field:

- the repository still accepts multiple names for the same logical value at the runtime boundary
- app-owned JSON stored near the database uses more than one naming convention
- missing identity is still being converted into valid-looking fallback values like `"default"`

That combination makes bad writes survivable instead of impossible. It is the opposite of the
cleanup direction we have been converging on.

## Opinionated Standard

This is the standard I would enforce:

- SQL column names stay `snake_case`
- TypeScript fields and app-owned JSON payloads stay `camelCase`
- raw vendor or harness payloads may preserve their original shape, but only inside raw artifact
  storage such as `symphony_agent_event_log`
- control-plane storage must never accept both `snake_case` and `camelCase` for the same logical
  field
- missing repository identity must fail fast instead of falling back to `"default"`

The key distinction is raw versus canonical.

Raw payloads are allowed to be ugly because they are evidence.
Canonical payloads are not allowed to be ugly because they are product truth.

## Findings

### 1. Runtime ingest still accepts multiple field names for the same control-plane values

`apps/api/src/core/agent-harness-runtime.ts` is still reading both `thread_id` and `threadId`,
and both `session_id` and `sessionId`, before persisting canonical run events.

Evidence:

- [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L460)
- [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L467)

Why this is bad:

- it treats malformed or stale payloads as valid input
- it lets boundary ambiguity leak into the control plane
- it makes it harder to know which shape the app actually owns

Recommended direction:

- delete mixed-name parsing from the control-plane ingest path
- require harness adapters to emit one canonical app-owned shape before the DB writer sees it

### 2. We still normalize multiple event names into one canonical event

The runtime boundary currently normalizes `session_started` into `session.started`.

Evidence:

- [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L1305)
- [agent-app-server-client.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-app-server-client.ts#L245)

This is acceptable only if it is treated as raw-harness adaptation. It is not acceptable as a
general contract rule.

Recommended direction:

- keep protocol translation inside the harness adapter
- stop letting the runtime ingest layer normalize old event names

### 3. App-owned runtime context JSON is using a second naming dialect

The canonical event contract uses `snake_case` payload fields such as `session_id`,
`thread_id`, and `reasoning_effort`, but runtime session context stored in
`symphony_runtime_logs.payload` uses `camelCase` fields such as `processId`, `providerId`,
`reasoningEffort`, and `authMode`.

Evidence:

- [agent-analytics-types.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/runtime-run-ledger/src/agent-analytics-types.ts#L162)
- [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L326)
- [runtime-forensics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/runtime-forensics-read-store.ts#L507)
- [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L2068)

Why this is bad:

- we have two app-owned JSON dialects living beside the same run graph
- readers must know which table speaks which naming convention
- this makes migrations and contract cleanup larger than they need to be

Recommended direction:

- standardize app-owned control-plane payloads on `camelCase`
- keep `snake_case` only for physical SQL columns and raw preserved payloads
- convert `symphony_events.payload` into a truly canonical app-owned event shape instead of a
  half-curated protocol object

### 4. Runtime context is still mined from untyped logs instead of explicit storage

Both forensics readers are parsing runtime session context out of `symphony_runtime_logs.payload`,
which is an untyped JSON blob on a table whose parent identity is still optional.

Evidence:

- [schema.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/schema.ts#L681)
- [runtime-forensics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/runtime-forensics-read-store.ts#L476)
- [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L2026)

Why this is bad:

- it duplicates parsing logic
- it leaves runtime context under-specified
- it normalizes missing or malformed context instead of rejecting it at write time

Recommended direction:

- move runtime session and provider context into an explicit runtime-owned sidecar table
- leave `symphony_runtime_logs` as diagnostics only

### 5. Repository identity still falls back to invalid values

The database and service layer still accept `"default"` as a repository key, and one code path
still truncates a repository key down to its last path segment.

Evidence:

- [runtime-run-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/runtime-run-store.ts#L66)
- [runtime-logs.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/runtime-logs.ts#L49)
- [issue-timeline.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/issue-timeline.ts#L56)
- [issue-delivery-reports.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/issue-delivery-reports.ts#L89)
- [file-backed-runtime-run-ledger.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/runtime-run-ledger/src/file-backed-runtime-run-ledger.ts#L79)
- [runtime-repository-key.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/runtime-repository-key.ts#L1)
- [runtime-manifest-validation-shared.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/runtime-contract/src/runtime-manifest-validation-shared.ts#L55)

Why this is bad:

- missing identity becomes valid-looking identity
- repository-scoped APIs can drift without failing loudly
- `openai/symphony` and `symphony` can both survive in active storage

Recommended direction:

- require `<owner>/<repo>` identity everywhere in the control plane
- delete `"default"` fallbacks
- delete repo-name-only fallback logic

### 6. `authMode` is still overloaded across runtime layers

One layer stores runtime selection values like `"provider"` and `"subscription"`, while another
expects stored auth context values like `"auth_json"` and `"api_key_env"`.

Evidence:

- [agent-harness-runtime.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/apps/api/src/core/agent-harness-runtime.ts#L334)
- [runtime-forensics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/runtime-forensics-read-store.ts#L234)
- [agent-analytics-read-store.ts](/Users/connorsheehan/.codex/worktrees/112e/symphony/packages/db/src/agent-analytics-read-store.ts#L246)

This is the same family of problem: one name is carrying two different concepts.

Recommended direction:

- split model-selection mode from credential-source mode into different fields
- stop storing them under the same name

## Cleanup Program

### Immediate deletions

- remove mixed key acceptance from the control-plane ingest path
- remove `session_started` normalization from the runtime ingest layer
- remove `"default"` repository fallbacks from DB stores
- remove repo-name-only fallback in runtime repository resolution

### Immediate migrations

- add explicit runtime-owned session/provider context storage
- give that storage one canonical app-owned naming convention
- stop reading run context from `symphony_runtime_logs.payload`

### Follow-up contract cleanup

- migrate canonical runtime event payloads to `camelCase`
- confine raw `snake_case` payloads to raw artifact storage
- rename overloaded fields like `authMode` into separate concepts

## Recommended Next Implementation Pass

If we want the highest-leverage follow-up after the current forensics work, I would do this next:

1. add `symphony_run_runtime_context`
2. write runtime session/provider context there instead of relying on runtime logs
3. delete `"default"` repository fallbacks in DB stores
4. delete repo-name truncation in runtime repository resolution
5. tighten `agent-harness-runtime.ts` so it only accepts one canonical control-plane shape

That sequence removes the biggest identity and naming ambiguity without preserving any legacy
semantics.
