# Symphony Linear Ticket Lifecycle

Date: 2026-04-03

## Purpose

Define the Linear workflow contract for Symphony-operated issues.

The goal is to keep execution boundaries explicit:

- `Bootstrapping` is platform-owned prepare/rehydrate work
- `Paused` is platform/provider-owned
- `Failed` is platform-owned
- `Blocked` is agent/repo-owned
- `Done` and `Canceled` are terminal
- legacy review/merge tracker states do not define the intelligent-flow golden path

## State Contract

### Dispatch States

- `Todo`
- `Bootstrapping`
- `In Progress`

### Non-Dispatch States

- `Backlog`
- `Blocked`
- `Paused`
- `Failed`

### Terminal States

- `Done`
- `Canceled`

### Legacy States

- `In Review`
- `Rework`
- `Approved`

These states may still exist in a Linear workflow for historical reasons, but they are not part of
the active intelligent-flow lifecycle. If an issue lands there, move it deliberately to `Todo`,
`Done`, or another current state instead of expecting Symphony to route from them automatically.

## State Meanings

### `Backlog`

Parking state for work that is not ready for agent execution.

Symphony does not dispatch from `Backlog`.

### `Todo`

Primary dispatch queue for admitted, agent-ready work.

The ticket should already contain enough detail for the agent to work without hidden context.

### `Bootstrapping`

Platform-owned setup state.

Use this while Symphony is attaching or provisioning the durable issue workspace, validating
preconditions, and preparing the box for the first agent turn.

### `In Progress`

Active implementation state.

This begins only when the agent is actually ready to start working.

### `Blocked`

Agent/repo-owned stop state.

Use this when the agent has already begun work but cannot continue because of repo-side or task-side
reality. Examples:

- repo commands failed during active work
- tests or verification exposed a repo issue the agent could not resolve
- the agent intentionally hands the issue back for repo-side intervention

`Blocked` is non-terminal and non-dispatch. A human must fix the repo-side issue and move the
ticket back into `Todo` to request another run.

### `Paused`

Platform/provider-owned stop state.

Use this when the workspace exists but Symphony cannot keep the run going because the orchestration
channel or provider failed. Examples:

- provider rate limit or capacity failure
- runtime stall without visible agent activity
- approval/orchestration interruption

`Paused` is non-terminal and non-dispatch. There are no hidden retries. A human must move the
ticket back into `Todo` to request another run.

### `Failed`

Platform-owned failure state.

Use this when Symphony refuses or cannot start the run because the platform or bootstrap path failed
before the agent began real work. Examples:

- missing `.symphony/runtime.ts`
- missing `.symphony/prompt.md`
- prompt render failure
- missing required auth/env
- Docker preflight failure
- repo admission failure
- repo bootstrap/migrate/verify failed before the first real agent turn

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
- `Paused -> Todo`
- `Failed -> Todo`
- `Blocked -> Todo`
- `In Review -> Todo`
- `Rework -> Todo`
- `Approved -> Todo`
- any move to `Done`
- any move to `Canceled`

Symphony-owned transitions:

- `Todo -> Bootstrapping`
- `Bootstrapping -> In Progress`
- `Bootstrapping -> Failed`
- `Bootstrapping -> Paused`
- `In Progress -> Paused`
- `In Progress -> Blocked`
- `In Progress -> Done`

There is no intelligent-flow-owned transition into `In Review`, `Rework`, or `Approved`.

## Comment Policy

Symphony should leave explicit Linear comments when it moves an issue into `Paused` or `Failed`, and
when an operator resumes from `Paused -> Todo`.

Those comments should include:

- state transition
- reason bucket
- whether workspace was preserved
- next operator action

There are no hidden retries for `Paused`, `Blocked`, or `Failed`.
