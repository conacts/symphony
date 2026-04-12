# Lifecycle Authority Matrix

Date: 2026-04-11

## Purpose

This document names the actual lifecycle-changing surfaces that currently exist in Symphony and
maps each one to:

- its ingress boundary
- the router signal it emits
- the command families the host will execute
- the settlement path that writes the result back into workflow history
- the read-side surface that is allowed to answer lifecycle questions
- its current audit status

This is the concrete matrix behind the broader architectural rule:

**workflow history must be the only lifecycle authority**

If a lifecycle surface is not represented here, it should not be able to change workflow truth.

## Authority Rule

The control-plane authority stack is:

1. `route_workflows`
   Binds a ticket to a repository, router preset, router name, and router version.
2. `route_history_events`
   Append-only workflow journal. This is the canonical lifecycle authority.
3. `route_projection_snapshots`
   Durable read checkpoint derived from history. Useful for fast rehydration, but not independent
   authority.
4. `route_decisions`
   Decision record and debugging aid. Never lifecycle authority on its own.

The following are not allowed to become workflow authority:

- tracker state on its own
- `symphony_runs`
- timeline events
- runtime logs
- GitHub review side effects
- orchestrator-local transition logic

Those systems may still be authoritative for their own domain, but not for workflow progression.

## Lifecycle Write Contract

Every routed lifecycle change should follow the same shape:

1. An ingress boundary observes a real-world fact.
2. The ingress resumes the workflow session bound to the issue.
3. The ingress emits a router signal through the preset adapter.
4. The route result is persisted through `recordRouteResult`.
5. Each emitted command is executed by the host.
6. Each executed command is settled back into the session through
   `executeSettledRouteCommand`.
7. Command settlement is appended to `route_history_events` through
   `appendCommandSettlement`.

That means the durable workflow story for a state change is:

- signal recorded
- decision recorded
- command emitted
- command settled

Anything that skips that chain is either a bug or a deliberate temporary gap that should be called
out explicitly.

## Matrix

| Lifecycle Surface | Primary Ingress | Router Signal | Allowed Commands Executed By Host | Settlement Path | Canonical Read Side | Audit Status |
| --- | --- | --- | --- | --- | --- | --- |
| Dispatch bootstrap | `workflowRoutingAdapter.routeDispatchBootstrap` in `runtime-dispatch-bootstrap-routing.ts` | `createTrackerStateObservedSignal` with ingress-specific id prefix `signal_dispatch_bootstrap_*` | `tracker.transition` to `Bootstrapping`; `run.dispatch` to select the first run mode | `recordRouteResult` plus `executeSettledRouteCommand` for tracker transition and dispatch selection | Snapshot-derived tracker state plus `readLastDispatchModeFromProjection` | Routed and authoritative |
| Run start activation | `workflowRoutingAdapter.activateRunStart` in `runtime-run-start-activation-routing.ts` | `createRunStartedSignal` with id prefix `signal_run_started_*` | `tracker.transition` to `In Progress` | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived tracker state | Routed and authoritative |
| Running issue observation | `workflowRoutingAdapter.observeRunningIssueState` in `runtime-run-lifecycle-routing.ts` | `createTrackerStateObservedSignal` with id prefix `signal_running_issue_observed_*` | `tracker.transition` only | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived tracker state | Routed and authoritative |
| Runtime completion | `workflowRoutingAdapter.routeRunCompletion` in `runtime-run-lifecycle-routing.ts` | `createRuntimeCompletionSignal` with id prefix `signal_run_completed_*` | `tracker.transition` only | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived tracker state, plus preset-specific projection data | Routed and authoritative, including startup failure |
| Non-running tracker observation, batch | `createRuntimeTrackerStateIngressPort().observeNonRunning` before each poll cycle | `createTrackerStateObservedSignal` with id prefix `signal_tracker_state_observed_*` | `tracker.transition`; optional `run.dispatch` when idle observation should start work | `recordRouteResult` plus `executeSettledRouteCommand`; dispatch callback hands off to orchestrator after settlement | Snapshot-derived tracker state through `loadCurrentTrackerState` and preset adapter readers | Routed and first-class |
| Non-running tracker observation, single issue | `createRuntimeTrackerStateIngressPort().observeNonRunningByIdentifier` and `trackerStateIngress.observeNonRunningIssue` | `createTrackerStateObservedSignal` with id prefix `signal_tracker_state_observed_*` | `tracker.transition`; optional `run.dispatch` | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived tracker state through the route lifecycle service | Routed and first-class |
| Active tracker observation by identifier | `routeLifecycle.observeActiveIssueStateByIdentifier` in `runtime-route-lifecycle-service.ts` | `createTrackerStateObservedSignal` with id prefix `signal_tracker_state_observed_*` | `tracker.transition` only | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived active run mode through `readActiveRunModeFromProjection` | Routed recovery surface |
| Review rework request | GitHub review ingress via `routeLifecycle.routeReviewReworkRequest` in `runtime-services.ts` and `runtime-review-rework-routing.ts` | `createReviewReworkRequestedSignal` with id prefix `signal_review_rework_requested_*` | `tracker.transition` to `Rework` or `Bootstrapping`; optional `run.dispatch` for requeue | `recordRouteResult` plus `executeSettledRouteCommand`; dispatch callback hands off after settlement | Snapshot-derived rework handoff through `readLatestReworkHandoffFromProjection` | Routed and authoritative |
| Delivery report | Runtime tools port `recordDeliveryReport` through `runtime-tools-port.ts` and `runtime-delivery-routing.ts` | `createDeliveryReportedSignal` with id prefix `signal_delivery_reported_*` | `tracker.transition` to `In Review`, `Approved`, or `Blocked`; `run.dispatch` only for completed delivery and only for `approved_merge` | `recordRouteResult` plus `executeSettledRouteCommand`; dispatch callback hands off after settlement | Snapshot-derived tracker state | Routed and authoritative |
| Merge result | Runtime tools port `submitMergeResult` through `runtime-tools-port.ts` and `runtime-merge-result-routing.ts` | `createMergeResultReportedSignal` with id prefix `signal_merge_result_reported_*` | `tracker.transition` to `Done` or `Blocked` | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived merge result through `readLatestMergeResultFromProjection` | Routed and authoritative |
| Runtime state request, spike/cancel class | Runtime tools port `submitSpikeResult` and `cancelIssue` through `runtime-tools-port.ts` and `runtime-state-request-routing.ts` | `createStateRequestedSignal` with id prefix `signal_state_requested_*` | `tracker.transition` only, and it must match the requested target state exactly | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived tracker state | Routed and authoritative |
| Shutdown pause | `routeLifecycle.routeShutdownPause` through `runtime-run-shutdown-routing.ts` | `createShutdownRequestedSignal` with id prefix `signal_shutdown_requested_*` | `tracker.transition` to `Paused` only | `recordRouteResult` plus `executeSettledRouteCommand` | Snapshot-derived tracker state | Routed and authoritative |
| Persisted active-run shutdown recovery | `reconcilePersistedActiveRunsOnShutdown` in `runtime-shutdown-reconciliation.ts` | Delegates to `routeShutdownPause`; no separate lifecycle signal family today | Router handles workflow pause; shutdown reconciler finalizes `symphony_runs` and turn records locally | Workflow settlement happens through routed shutdown; run-store finalization remains runtime execution-domain work | Workflow truth from route history; execution truth from `symphony_runs` | Acceptable split authority |
## Notes Per Surface

### Shared Tracker Observation Signal

Several different ingresses intentionally collapse into the same router signal factory:

- dispatch bootstrap
- running issue observation
- non-running tracker observation
- active tracker observation

That is correct.

The distinction between those surfaces lives at the ingress boundary and in the signal id prefix,
not in four separate signal types. The shared semantic is:

`the host observed tracker state and is asking the router to interpret it`

That keeps the preset contract smaller while still preserving ingress-specific observability.

### Command Execution Is Not Authority

Tracker writes and dispatch callbacks are execution side effects.

They become workflow truth only after command settlement is written back into
`route_history_events`.

The important implication is:

- a tracker transition alone is not a sufficient workflow fact
- a run dispatch alone is not a sufficient workflow fact
- logs describing those actions are not sufficient workflow facts

The authoritative record is the routed signal and the settled command chain.

### Read Side Rule

When code needs to answer a workflow question such as:

- what tracker state does the workflow currently believe
- what was the last rework handoff
- what merge result is currently attached to this workflow
- what run mode is active

it should answer that from the routed workflow hydration state, typically through the preset
adapter projection readers:

- `readTrackerStateFromProjection`
- `readLastDispatchModeFromProjection`
- `readActiveRunModeFromProjection`
- `readLatestReworkHandoffFromProjection`
- `readLatestMergeResultFromProjection`

The tracker remains the external observation source.

The projection remains Symphony's internal lifecycle read source.

## Remaining Hard-Cut Work

The matrix makes the remaining cutover work explicit.

### 1. Keep timeline and runtime logs projection-only

Timeline events and runtime logs still matter for diagnostics, but they should remain descriptive.

They should never be required to reconstruct why a workflow changed state.

If reconstructing a lifecycle transition requires reading runtime logs, then workflow history is
still incomplete.

### 2. Keep preset modules as the only source of routing variation

The host ingress layer should stay thin.

Variation in behavior between:

- `current-flow`
- `auto-merge`
- future custom routers

should come from preset policy and router definitions, not from new ad hoc branches in the host.

That is the architectural path that enables user-authored state machines later.

## Completion Bar For Final Lifecycle Authority Audit

The lifecycle authority cut is complete when all of the following are true:

- every workflow-changing ingress emits a routed signal
- every emitted command settles back into workflow history
- `route_history_events` is sufficient to explain every lifecycle move
- snapshots can fully answer current workflow questions without consulting shadow state
- runtime logs and timeline records are optional observability, not required authority
- orchestrator-local lifecycle transitions no longer decide workflow truth outside the router

Until then, this matrix should be treated as the operating checklist for the remaining hard cuts.
