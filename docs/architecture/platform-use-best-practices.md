# Platform Use Best Practices

Date: 2026-04-03

## Purpose

Define the intended operator workflow for running Symphony well, avoiding token burn, preserving
workspace continuity, and keeping issue state transitions explicit.

This document is about how to use the platform, not how to implement it.

## Core Principles

- Treat the issue as the durable unit of work.
- Treat the issue workspace as a persistent box, not a disposable run artifact.
- Prefer one high-quality run over many blind retries.
- Keep state transitions explicit.
- Use Linear as the communication surface and the dashboard as the deep observability surface.
- Do not reset or rebuild a workspace unless you explicitly intend to destroy prior work.

## Golden Path

### 1. Move The Ticket To `Todo`

Use `Todo` when the ticket is ready for Symphony to pick up.

The issue should already include:

- the user-visible goal
- repo context if needed
- any constraints the agent must respect
- enough clarity that the agent can begin without hidden operator context

### 2. Let Symphony Claim Into `Bootstrapping`

`Bootstrapping` is platform-owned.

This is where Symphony:

- attaches or provisions the durable issue workspace
- creates the canonical issue branch if needed
- validates runtime prerequisites
- runs pre-agent lifecycle/setup

If the issue never makes it out of `Bootstrapping`, that is a platform/bootstrap problem, not an
agent-work problem.

### 3. Let Symphony Enter `In Progress`

`In Progress` begins only when the agent is actually ready to work.

At this point, the issue box should already exist and be attached. The branch, repo state, and
service state should be stable enough for the agent to continue across later runs if needed.

### 4. Review The Outcome

Possible handoffs are:

- `In Review`
- `Blocked`
- `Paused`
- `Failed`

Those states do not mean the same thing.

## What Each State Means Operationally

### `Bootstrapping`

Platform is preparing the box.

Operator action:

- usually none
- if it lands in `Failed`, inspect the comment and fix the setup problem

### `In Progress`

Agent is actively working.

Operator action:

- usually none
- use the dashboard if you need to inspect messages, tool calls, file changes, or terminal output

### `In Review`

Agent believes the work is ready for review.

Operator action:

- inspect the work
- move to `Approved`, `Rework`, or `Done` as appropriate

The agent must not move a ticket to `Done`.

### `Blocked`

Agent/repo-owned stop after work has started.

Typical meaning:

- the repo is in a state the agent could not finish through
- the work needs operator judgment or repo-side intervention

Operator action:

- inspect the issue and the preserved workspace
- fix what is needed
- move back to `Todo` when ready

### `Paused`

Platform/provider-owned stop.

Typical meaning:

- provider rate limit
- provider capacity issue
- orchestration/runtime interruption
- approval/input path that the platform could not satisfy

Operator action:

- fix the platform-side problem
- move back to `Todo` when ready

`Paused` is a hard stop. There are no hidden retries.

### `Failed`

Pre-agent failure during bootstrapping.

Typical meaning:

- Docker/runtime/setup issue
- auth/env contract issue
- prompt/render/setup failure
- repo bootstrap path failed before the first real agent turn

Operator action:

- fix the startup problem
- move back to `Todo` when ready

`Failed` is also a hard stop. There are no hidden retries.

## Resume Rules

The normal operator resume path is:

- `Paused -> Todo`
- `Failed -> Todo`
- `Blocked -> Todo`

Best practice:

- preserve the workspace by default
- do not rebuild or re-clone unless you explicitly want to discard prior state

When a ticket returns to `Todo`, Symphony should rerun `Bootstrapping` in the same durable issue
workspace.

## Workspace Handling

### Preserve By Default

Across runs, preserve:

- unstaged changes
- staged changes
- local commits
- issue branch state
- durable service data

The next run should see the same box and decide whether to continue, refactor, revert, or replace
what is already there.

### Do Not Reset Casually

Avoid using reset/rebuild as a substitute for diagnosis.

Resetting a workspace destroys:

- valuable debugging context
- partially completed implementation
- local agent progress
- token efficiency

If a future `Reset Workspace` action exists, treat it as a destructive operator tool, not a normal
retry mechanism.

## Token Efficiency Practices

- Do not rely on automatic retries to recover from provider problems.
- Pause explicitly instead of looping invisibly.
- Preserve the workspace so the next run can inspect prior edits instead of re-deriving them.
- Prefer deterministic repo lifecycle commands over agent improvisation for setup.
- Use Linear comments to explain pause/fail reasons so the next operator action is obvious.
- Avoid moving a ticket back into active flow until the actual failure cause is addressed.

## Branching Practices

- Each issue should start from one canonical issue branch.
- The issue branch should be created during initial provisioning.
- The base branch should come from repo configuration, not machine-local assumptions.
- The agent may create temporary or alternate branches inside the issue workspace if helpful.
- Do not silently fall back to the default branch on later runs.

## Observability Practices

Use Linear for:

- state transitions
- operator-facing comments
- the high-level narrative of why work stopped or resumed

Use the dashboard for:

- prompts
- visible agent messages
- tool calls
- terminal output
- file changes and diffs
- git snapshots
- lifecycle and state-transition artifacts

If Linear is the communication system of record, every `Paused` and `Failed` transition should be
explained there.

## What To Avoid

- do not leave a ticket bouncing through retries invisibly
- do not treat a new run as permission to refresh from trunk
- do not use `Blocked` and `Paused` interchangeably
- do not let the agent move tickets to `Done`
- do not collapse dashboard observability into hidden chain-of-thought requirements
- do not assume a provider interruption means repo progress was lost

## Recommended Operator Flow

1. Move ready work into `Todo`.
2. Let Symphony claim into `Bootstrapping`.
3. Let the agent work in `In Progress`.
4. If the ticket lands in `Paused`, fix the platform issue first.
5. If the ticket lands in `Failed`, fix the startup/bootstrap issue first.
6. If the ticket lands in `Blocked`, inspect the repo/work problem.
7. Move back to `Todo` when ready to resume.
8. Move to `Done` only after review is complete and you are comfortable destroying the hot box.

## Next-Pass Priorities

Two follow-up areas are especially valuable:

- Codex event typing and normalization:
  treat Codex messages, tool events, approvals, file changes, and turn summaries as first-class
  typed artifacts rather than loosely parsed payload blobs.
- Codex TypeScript SDK evaluation:
  evaluate whether the SDK can simplify thread management and event typing while preserving the
  fully autonomous runtime model.
