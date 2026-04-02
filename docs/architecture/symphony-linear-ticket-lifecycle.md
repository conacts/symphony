# Symphony Linear Ticket Lifecycle

Date: 2026-04-02

## Purpose

Define the Linear workflow contract for Symphony-operated issues.

The goal is to keep execution boundaries explicit:

- `Failed` is platform-owned
- `Blocked` is repo-owned
- `Done` and `Canceled` are terminal
- `Approved` is active only for merge execution

## State Contract

### Dispatch States

- `Todo`
- `In Progress`
- `Rework`
- `Approved`

### Non-Dispatch States

- `Backlog`
- `In Review`
- `Blocked`
- `Failed`

### Terminal States

- `Done`
- `Canceled`

The platform does not rely on `Duplicate` as part of the supported orchestration contract. If a
team still carries `Duplicate` in Linear, treat it as human workflow outside the explicit Symphony
state model until that workflow is cleaned up.

## State Meanings

### `Backlog`

Parking state for work that is not ready for agent execution.

Symphony does not dispatch from `Backlog`.

### `Todo`

Primary dispatch queue for admitted, agent-ready work.

The ticket should already contain enough detail for the agent to work without hidden context.

### `In Progress`

Active implementation state.

This means the issue is eligible for continued agent execution.

### `In Review`

Human review handoff state.

Symphony does not dispatch from `In Review`. Review comments may inform the next run, but they do
not automatically wake the issue unless the admitted requeue path explicitly moves it back to
`Rework`.

### `Rework`

Explicit implementation requeue state after review.

Use this when another coding pass is wanted.

### `Approved`

Merge-only execution state.

Use this when the implementation is accepted and the remaining work is final branch/merge
execution. `Approved` is active, but it is not a general implementation state.

### `Blocked`

Repo-owned failure state.

Use this when the platform successfully prepared and dispatched the environment, but the repo's own
lifecycle failed. Examples:

- `bootstrap` failed
- `migrate` failed
- `verify` failed

`Blocked` is non-terminal and non-dispatch. A human must fix the repo-side issue and move the
ticket back into an active state.

### `Failed`

Platform-owned failure state.

Use this when Symphony refuses or cannot start the run because the platform contract failed before
normal repo work could proceed. Examples:

- missing `.symphony/runtime.ts`
- missing `.symphony/prompt.md`
- prompt render failure
- missing required auth/env
- Docker preflight failure
- repo admission failure

`Failed` is non-terminal and non-dispatch. The next move must be deliberate.

### `Done`

Terminal success state.

Symphony cleans up the issue workspace and does not recreate it after the issue reaches `Done`.

### `Canceled`

Terminal stop state.

Symphony cleans up the issue workspace and does not recreate it after the issue reaches
`Canceled`.

## Ownership Boundaries

Human-owned transitions:

- `Backlog -> Todo`
- `In Review -> Rework`
- `In Review -> Approved`
- `Blocked -> Todo`
- `Failed -> Todo`
- any move to `Done`
- any move to `Canceled`

Symphony-owned transitions:

- `Todo -> In Progress`
- `Rework -> In Progress`
- `In Progress -> In Review`
- `Approved -> Done`
- `Approved -> In Review`

## Comment Policy

Symphony should leave explicit Linear comments when it moves or refuses an issue because of a
platform-owned failure.

Those comments should include:

- failure class
- failed check
- whether retry is blocked
- next operator action

Repo-owned lifecycle failures should also leave a concise note, but they belong in `Blocked`, not
`Failed`.
