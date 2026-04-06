# Pi Runtime Stability Incident

## Summary

Symphony is currently experiencing a compound runtime-stability incident on the Pi harness path. The visible symptoms are:

- repeated startup failures with `Timed out waiting for Agent response 1`
- runtime failures such as `Agent app-server exited (code:137)` and permission errors under `/home/agent/.pi/agent`
- runs that remain `running` or `stalled` while producing `0` token usage
- repeated turns that only emit `queue_update` / `pi-todo-queue` events
- duplicate active runs for the same Linear issue after runtime restarts

These are not all one bug. The evidence points to multiple interacting failures across transport selection, continuation semantics, and restart/shutdown behavior.

## User Impact

- tickets can be left in a broken active state after the runtime process exits
- restarting the server can redispatch an already-active issue
- one unhealthy ticket can explode into multiple active runs
- the dashboard becomes misleading because some runs look active while doing no useful work
- issue delivery metrics become noisy because the system records activity without meaningful harness progress

## Confirmed Findings

### 1. `pi app-server` was the wrong transport

The installed Pi build does not speak Symphony's custom app-server protocol. Running `pi app-server` in the container behaved like an interactive command, while `pi --mode rpc` responded immediately to Pi-native JSONL RPC commands such as:

```json
{"type":"get_state","id":"req_1"}
```

This confirms that the earlier startup timeout was not just "Pi is slow"; Symphony was speaking the wrong protocol for the installed Pi runtime.

### 2. Continuation turns are still semantically fragile

After moving back to Pi-native RPC, continuation handling still produced broken behavior:

- the first continuation bug sent `prompt` when Pi expected a queued continuation command
- the next fix sent `follow_up` too aggressively
- live runs then began emitting only `queue_update` events containing stacked continuation prompts

This means Symphony can currently talk to Pi successfully while still driving the session incorrectly.

### 3. Active runs are not safely reconciled across server restarts

The orchestrator's `running` and `claimed` state is in-memory only. When the API/runtime process restarts:

- the new process does not hydrate active runs from the DB
- existing `dispatching` / `running` rows remain persisted as active
- the new orchestrator can forget those runs and redispatch the same issue

This is the clearest explanation for multiple active runs on the same issue.

### 4. Graceful shutdown is currently unsafe

Before this incident work, shutdown only:

- stopped the poller
- stopped machine-load sampling
- closed the DB

It did **not**:

- stop active harness sessions cleanly
- pause or finalize active runs
- move active issues to a safe recoverable tracker state
- reconcile persisted `dispatching` / `running` rows before exit

That made runtime restarts materially dangerous.

## Reproduction and Evidence

### Permission and transport evidence

Observed runtime errors included:

- `EACCES: permission denied, mkdir '/home/agent/.pi/agent/sessions/--workspace--'`
- `Timed out waiting for Agent response 1`

The permission issue was traced to Pi using `PI_CODING_AGENT_DIR`, not the earlier override name. The startup timeout was later traced to a protocol mismatch between Symphony's custom app-server client and Pi's actual JSONL RPC mode.

### Duplicate-run evidence

For `COL-188`, the DB showed multiple active runs at once, including:

- `716b3e9e-9caf-47e0-9665-bab771a907b8`
- `1e8c2767-dea3-4de3-a643-0053260e1d0f`
- `120e5d46-6368-4e3b-9df2-8eaf104be7f7`

That should never happen under a healthy single-run-per-issue policy.

### Zero-token / queue-only evidence

For the stalled run on `COL-188`:

- runtime/analytics token totals remained `0`
- the agent event log contained only:
  - `thread.started`
  - repeated `item.updated` events for `pi-todo-queue`
- raw overflow payloads were `queue_update` entries containing repeated continuation prompt text

That is strong evidence that the system was queueing more instructions without getting meaningful Pi work back out.

## Root Cause Assessment

This incident should be treated as a multi-cause stability failure:

1. **Legacy transport artifact**
   Symphony retained a Codex-era app-server assumption that does not match Pi's installed runtime protocol.

2. **Continuation contract mismatch**
   Symphony still lacks a fully correct rule for when to send a fresh `prompt` versus a queued continuation command on Pi-native RPC.

3. **Missing persisted active-run recovery**
   The orchestrator does not recover active state from the DB after restart.

4. **Unsafe shutdown semantics**
   Active issues and runs were allowed to survive process exit without a terminal or paused reconciliation step.

## Immediate Containment

The current containment priorities are:

1. Prefer Pi-native RPC over the custom app-server path.
2. Add richer logging around every turn dispatch:
   - run id
   - turn number
   - chosen Pi command
   - `isStreaming`
   - `pendingMessageCount`
   - `messageCount`
   - thread/session id
3. Safely pause/finalize active runs during graceful shutdown.
4. Reconcile leftover persisted `dispatching` / `running` rows before closing the DB.

## Recommended Next Fix Slices

### Slice 1: Safe shutdown and startup containment

- stop the poll scheduler first
- stop or finalize in-memory active runs
- reconcile persisted `dispatching` / `running` rows before DB close
- pause affected tracker issues so they are recoverable instead of silently active

### Slice 2: Persisted active-run recovery on boot

- on startup, inspect persisted active runs before the first poll cycle
- either:
  - hydrate them into orchestrator state, or
  - mark them stale/paused before dispatch can resume

### Slice 3: Pi continuation instrumentation

- log the exact decision input to `prompt` vs `follow_up`
- capture the raw Pi session state before each continuation turn
- add tests using captured queue-only fixtures from this incident

### Slice 4: Duplicate-dispatch hardening

- enforce a DB-backed "one active run per issue" guard
- do not rely only on in-memory `claimed` / `running`

## Operational Recommendation

Do not continue retrying real tickets until:

- graceful shutdown reconciliation is in place
- duplicate-dispatch risk is reduced
- continuation-command instrumentation is added

At the current failure mode, retrying real tickets mostly creates more noisy evidence and can damage issue state.

## Decision

Treat this as a runtime-architecture incident, not a one-off Pi bug.

The correct next move is to harden shutdown/restart semantics first, then continue investigating Pi continuation behavior with better logs and tests.
