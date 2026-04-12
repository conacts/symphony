# PR #14 Review Disposition

Date: 2026-04-12

## Purpose

This is the slice 0 artifact for the current PR review pass.

The goal is to freeze the disposition of the latest review comments before implementation resumes.
That means:

- decide which comments are real defects in the current code
- decide which comments are stale because the code already changed
- decide which comments conflict with intentional hard-cut policy rather than exposing a bug
- assign valid comments to concrete implementation slices

Slice 0 is intentionally non-behavioral.

It does not change runtime code.
It records routing truth for the implementation queue.

## Decision Standard

Each comment is evaluated against the current branch, not against the code that existed when the
comment was originally written.

A comment is only treated as implementation work if it satisfies both conditions:

1. the reported behavior is still reachable in the current code
2. the reported behavior violates the hard-cut contracts we have already chosen

Comments that request fallback behavior we intentionally removed are not bugs.
Comments that describe code paths that no longer exist are stale.

## Disposition Summary

### Valid and queued for implementation

- Comment 6: multi-repo issue timeline writes still use the primary-repository store boundary
- Comment 7: multi-repo runtime log writes still use the primary-repository store boundary
- Comment 9: command execution and command settlement failures are still conflated
- Comment 10: recoverable completion-routing failures can still strand tracker state
- Comment 11: timeline read lookup is still using an unscoped issue fetch path
- Comment 12: workflow comparison read path is still using an unscoped replay lookup
- Comment 13: shutdown reconciliation still queries active runs without workspace-binding scope

### Stale and not actionable

- Comment 2: active lifecycle observation already accepts routed `run.dispatch` output
- Comment 4: tracker state contract checks are already normalized before comparison
- Comment 5: explicit non-running ingress already skips cleanly when no workflow exists and the
  observed state is not seedable

### Conflicts with intentional hard-cut policy

- Comment 1: shutdown reconciliation should not add tolerant fallback for missing `runMode`
- Comment 3: runtime manifests must now declare workflow configuration explicitly
- Comment 8: run detail reads should continue requiring canonical runtime context

## Comment-By-Comment Disposition

### Comment 1

File:
`apps/api/src/core/runtime-shutdown-reconciliation.ts`

Claim:
shutdown reconciliation should tolerate missing run metadata so one malformed row does not abort
the whole loop.

Disposition:
policy conflict, not a bug.

Reason:
the current schema and write path intentionally require canonical run metadata, including
`runMode`.
The right fix for missing metadata is to stop admitting malformed rows, not to soften shutdown
reconciliation around impossible state.

Action:
none in this pass.

### Comment 2

File:
`apps/api/src/core/runtime-run-lifecycle-routing.ts`

Claim:
active lifecycle observation crashes when the router emits `run.dispatch`.

Disposition:
stale.

Reason:
the active observation path already handles routed `run.dispatch` output explicitly.
This was a real issue earlier in the branch, but the current code no longer has that failure mode.

Action:
none.

### Comment 3

File:
`apps/api/src/core/runtime-workflow-preset-selection.ts`

Claim:
workflow preset selection should fall back to the default preset when the manifest omits the
workflow block.

Disposition:
policy conflict, not a bug.

Reason:
we intentionally hardened the runtime manifest contract.
The runtime now requires explicit workflow configuration.
That is part of the larger fail-fast posture around the router and preset selection.

Action:
none.

### Comment 4

File:
`apps/api/src/core/runtime-current-flow-routing.ts`

Claim:
exact tracker-state contract checks should be normalized to match case-insensitive tracker state
handling.

Disposition:
stale.

Reason:
the comparison is already normalized in the current branch.
The reported mismatch no longer exists.

Action:
none.

### Comment 5

File:
`apps/api/src/core/runtime-route-lifecycle-service.ts`

Claim:
explicit ingress should skip cleanly when no workflow exists and the observed non-running state is
not one we seed from.

Disposition:
stale.

Reason:
the explicit ingress path already distinguishes:

- no workflow plus seedable state: create or seed
- no workflow plus non-seed state: ignore without throwing

The batch and explicit paths now agree on that behavior.

Action:
none.

### Comment 6

File:
`packages/db/src/issue-timeline.ts`

Claim:
timeline writes for secondary-repository issues can fail because the store still validates against
the primary repository binding.

Disposition:
valid.

Reason:
the runtime can now operate across admitted repositories, but this store still assumes the
configured repository key is the only valid identity boundary.
That makes diagnostic writes a cross-repo hazard.

Action:
implement in the multi-repo observability slice.

### Comment 7

File:
`packages/db/src/runtime-logs.ts`

Claim:
runtime log writes for secondary-repository issues can fail because the log store is still bound
to the primary repository.

Disposition:
valid.

Reason:
same class of defect as comment 6.
The write boundary is stricter than the runtime’s admitted-repository model, and the failure lands
inside normal lifecycle flows.

Action:
implement in the multi-repo observability slice.

### Comment 8

File:
`packages/db/src/runtime-forensics-read-store.ts`

Claim:
run detail reads should tolerate runs that do not have canonical runtime context.

Disposition:
policy conflict, not a bug.

Reason:
the current direction is to require explicit runtime context for canonical run detail.
If startup-failure runs are still being persisted without that context, the write path should be
fixed or the persistence rule tightened, not the read model softened.

Action:
none in this pass.

### Comment 9

File:
`apps/api/src/core/runtime-route-workflow-command-utils.ts`

Claim:
`executeSettledRouteCommand(...)` currently marks command execution as failed when the real failure
was the success-settlement write.

Disposition:
valid.

Reason:
this can make workflow history lie about the external world.
If the side effect succeeds but the settlement write fails, the command did not fail.
The current combined `try` block makes those two failure domains indistinguishable.

Action:
implement in the workflow-journal integrity slice.

### Comment 10

File:
`packages/orchestrator/src/symphony-orchestrator.ts`

Claim:
recoverable completion-routing failures are being flattened into successful completion handling,
which can finalize a run while leaving tracker state unchanged.

Disposition:
valid.

Reason:
this is exactly the kind of authority split we have been removing.
If routed completion fails, the orchestrator should not continue as though lifecycle routing
already happened.

Action:
implement in the workflow-journal and authority-correctness slice.

### Comment 11

File:
`apps/api/src/core/runtime-observability-ports.ts`

Claim:
issue timeline reads are using an unscoped issue lookup and will fail for scoped workspace
bindings.

Disposition:
valid.

Reason:
this is a read-side authority bug.
The route/timeline view should honor the active workspace binding instead of assuming the unscoped
path.

Action:
implement in the scoped read-side slice.

### Comment 12

File:
`apps/api/src/core/runtime-workflow-comparison.ts`

Claim:
workflow comparison reads are using an unscoped replay lookup and can return false 404s for scoped
workflows.

Disposition:
valid.

Reason:
same class of bug as comment 11.
The comparison surface is reading the right authority through the wrong identity boundary.

Action:
implement in the scoped read-side slice.

### Comment 13

File:
`apps/api/src/core/runtime-shutdown-reconciliation.ts`

Claim:
shutdown reconciliation still processes every active run in the database instead of only the runs
owned by the current workspace binding.

Disposition:
valid.

Reason:
this is a real multi-tenant correctness bug.
A scoped runtime should not pause or finalize runs belonging to a different workspace binding.

Action:
implement in the scoped shutdown-hygiene slice.

## Implementation Slice Mapping

### Slice 1: Workflow Journal Integrity And Completion Authority

Includes:

- comment 9
- comment 10

Why first:
these are authority bugs.
They can make workflow history contradict real side effects or let the orchestrator continue after
lifecycle routing failed.

### Slice 2: Multi-Repo Observability Writes

Includes:

- comment 6
- comment 7

Why second:
these are write-boundary bugs caused by the runtime’s admitted-repository model outgrowing the old
single-repository store assumptions.

### Slice 3: Scoped Read-Side Authority

Includes:

- comment 11
- comment 12

Why third:
these are read-path correctness fixes.
They matter for hosted and scoped runtime bindings, but they do not threaten lifecycle authority as
directly as slices 1 and 2.

### Slice 4: Scoped Shutdown Hygiene

Includes:

- comment 13

Why fourth:
this is operationally important, but it is isolated and can be implemented cleanly after the
journal/write/read issues above.

## Non-Goals For These Slices

- restoring manifest fallback behavior
- softening canonical read models around missing required context
- adding new compatibility shims for malformed data we no longer want to accept
- re-opening already-fixed comments just because they appear in the review thread

## Completion Bar For Slice 0

Slice 0 is complete when:

- every current review comment has an explicit disposition
- stale comments are separated from real defects
- policy disagreements are separated from correctness bugs
- valid defects are assigned to implementation slices in execution order

That bar is now met.
