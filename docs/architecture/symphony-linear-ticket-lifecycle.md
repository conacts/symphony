# Symphony Linear Ticket Lifecycle

Date: 2026-03-28

## Purpose

Document the operator-facing Linear state flow for admitted Coldets-team Symphony tickets.

This is the guide for a person using Linear directly or through the available tool surface to decide
where a ticket should live before, during, and after Symphony agent execution.

## Scope

This guide applies to admitted projects on the `Coldets` team.

Current repo-owned admission policy:

- team-scoped polling on `Coldets` (`COL`)
- hard-excluded project: `Coldets Draft Work`
- issues with no Linear project are ignored
- ticket label `symphony:disabled` is a full opt-out

Symphony currently runs with:

- team-scoped polling against admitted `Coldets` projects,
- five concurrent agents overall,
- one concurrent `Approved` merge session at a time,
- per-issue git worktrees under the configured Symphony workspace root,
- one Postgres database per issue workspace on the shared local server,
- default PR creation through `gh`,
- automatic workspace cleanup when an issue reaches a terminal state.

## State Contract

`WORKFLOW.md` currently treats these states as active:

- `Todo`
- `In Progress`
- `Rework`
- `Approved`

It treats these states as terminal:

- `Done`
- `Duplicate`
- `Canceled`
- `Closed`
- `Cancelled`

The current Coldets team workflow visibly uses:

- `Backlog`
- `Todo`
- `In Progress`
- `In Review`
- `Approved`
- `Rework`
- `Blocked`
- `Done`
- `Duplicate`
- `Canceled`

`Closed` and `Cancelled` are included in the terminal contract for compatibility, but they are not
part of the current visible team status set.

## Recommended Lifecycle

### `Backlog`

Use `Backlog` for ideas, drafts, or tickets that are not ready for agent execution.

Symphony does not poll `Backlog`, so this is the safe parking state.

Startup/bootstrap failures should also land here. When Symphony cannot finish workspace startup, it
should stop retrying automatically, return the ticket to `Backlog`, and wait for a human to move it
back into an active state once the prerequisite is fixed.

### `Todo`

Use `Todo` for agent-ready work.

This is the recommended state for handing a new ticket to Symphony. The ticket description should
already be specific enough for the agent to act without hidden context.

In the current repo-owned workflow, Symphony moves a claimed `Todo` issue to `In Progress` before
agent execution starts.

### `In Progress`

Use `In Progress` when the ticket is actively being worked, either by a human or by Symphony.

This is still an active Symphony state. Leaving a ticket here keeps it eligible for continued agent
execution.

This is the expected visible state for an issue once Symphony has actually started active work.

### `In Review`

Use `In Review` once the ticket has a reviewable outcome, usually a GitHub PR.

This is a non-active Symphony state. `In Review` means the work is parked for review and Symphony
should stop active execution until a human or an admitted GitHub review signal explicitly requeues
the issue.

Use `In Review` when a human is currently reviewing the work.

### `Rework`

Use `Rework` when a human reviewed the work and wants another implementation pass.

This is an active Symphony state. When Symphony claims an issue from `Rework`, the expected
behavior is:

- move the issue to `In Progress`,
- inspect the linked PR if present,
- read unresolved review comments,
- read the latest issue comments,
- treat that material as the current rework brief.

### `Approved`

Use `Approved` once a human has decided the PR should land and wants Symphony to perform the final
merge handoff.

This is an active Symphony state, but it is merge-only. When Symphony claims an issue from
`Approved`, it should:

- rebase the PR branch onto the current PR base branch,
- resolve conflicts, keeping both sides' content for non-duplicative Markdown conflicts,
- run post-rebase validation,
- push the rebased branch,
- merge the PR,
- move the issue to `Done`,
- or move it back to `In Review` with an explanation if merge execution fails.

### `Done`

Use `Done` when the work is accepted and no more Symphony activity is needed.

`Done` is the normal completion state. Moving a ticket to `Done` stops active orchestration for that
issue and triggers workspace cleanup.

### `Duplicate`

Use `Duplicate` when another ticket supersedes the work.

This is terminal and also triggers cleanup.

### `Canceled`

Use `Canceled` when the work should stop without being completed.

This is terminal and also triggers cleanup.

## Ownership Boundaries

Human-owned transitions:

- `Backlog -> Todo`
- manual `In Review -> Rework`
- `In Review -> Approved`
- `In Review -> Done`
- any move to `Canceled` or `Duplicate`

Symphony-owned transitions:

- `Todo -> In Progress`
- `Rework -> In Progress`
- `In Progress -> In Review`
- `In Review -> Rework` when the admitted GitHub review-signal contract accepts a requeue event
- `Approved -> Done`
- `Approved -> In Review`

## Operator Rules

### 1. Put agent tickets in an admitted Coldets project

If a ticket is meant for the server-hosted Symphony worker, it must live in a `Coldets` team
project that follows the Symphony state contract and is not explicitly excluded.

Current hard-excluded project:

- `Coldets Draft Work`

Issues with no Linear project are also ignored by the current workflow.

### 2. Use `Coldets Draft Work` as the non-Symphony parking lane

Use `Coldets Draft Work` for draft, exploratory, or intentionally human-owned tickets that should
stay outside Symphony automation by default.

That project is hard-excluded by the repo-owned workflow, so moving an issue there is stronger than
simply leaving it in a non-active state.

### 3. Use `Todo` as the normal dispatch state

If you want Symphony to pick up new work, move the ticket to `Todo`.

`In Progress` also remains eligible, but `Todo` is the clearest queueing signal.

After claim, the expected behavior is `Todo -> In Progress` before active implementation begins.

### 4. Treat `In Review` as parked human review

`In Review` means "reviewable and parked for review", not "resume the agent automatically".

General comments on the PR or Linear issue do not reactivate work by themselves.

The repo-owned Symphony host now admits a narrow GitHub-driven requeue seam:

- formal `changes_requested` reviews from allowed logins
- top-level PR comments beginning with `/rework` from allowed logins; remaining text becomes
  operator context for the rework pass

Those signals may move the issue from `In Review` to `Rework`.

Ticket-local labels can further narrow that behavior:

- `symphony:no-auto-rework` disables automatic GitHub review-driven requeue, but explicit
  `/rework` still wins
- `symphony:disabled` disables both dispatch and GitHub-driven requeue

If the agent should change code again, move the issue to `Rework`.

If the work is approved and ready for merge execution, move the issue to `Approved`.

If you want Symphony to stop and clean up the workspace entirely, move the issue to a terminal
state such as `Done`, `Duplicate`, or `Canceled`.

### 5. Use `Rework` as the explicit implementation requeue state

If a reviewer wants another agent pass, move the issue to `Rework`.

That is the explicit wake-up signal for Symphony after review handoff.

When Symphony claims the issue, the orchestrator moves it back to `In Progress` before active
implementation begins.

The repo-owned host may also perform `In Review -> Rework` automatically when the admitted GitHub
review-signal contract accepts a webhook event for the linked PR.

### 6. Use `Approved` as the explicit merge handoff state

If a reviewer is satisfied with the PR and wants Symphony to land it, move the issue to
`Approved`.

That is the explicit merge signal after review handoff. The issue stays in `Approved` during the
merge phase rather than moving back to `In Progress`.

The repo-owned workflow also caps `Approved` concurrency to one agent at a time to reduce rebase
races between multiple simultaneously approved PRs.

### 7. Keep ticket descriptions self-contained

The issue body should state:

- the exact outcome you want,
- important constraints,
- the validation to run,
- whether the change should stay minimal,
- any explicit non-goals.

Do not rely on private chat context or unwritten assumptions.

### 8. Expect PR creation by default and merge execution only from `Approved`

The current `WORKFLOW.md` tells the agent to:

- move `Todo` and `Rework` issues to `In Progress` at claim time through the workflow transition
  config,
- move startup/bootstrap failures back to `Backlog` without automatic retries,
- inspect PR review context and latest issue comments when resuming from `Rework`,
- keep Linear comments concise and orchestration-focused,
- commit on the current issue branch,
- push that branch,
- create or reuse a GitHub PR with `gh`,
- include the PR URL in the final response,
- add the PR URL back to Linear and move the issue to `In Review` when implementation is ready for
  human review,
- and, when the issue is in `Approved`, leave a short Linear status note that merge execution has
  started, rebase against the PR base branch, run
  `pnpm build && pnpm test && pnpm lint`, push with `--force-with-lease`, merge via
  `gh pr merge --squash --delete-branch`, then move the issue to `Done`.

Once a PR exists, substantive reviewer correspondence should happen primarily on the GitHub PR.
Linear should stay focused on orchestration status, PR linking, and brief operator notes.

### 9. GitHub Review Automation Is Narrow By Design

The repo-owned Symphony host currently accepts only these GitHub wake signals:

1. `pull_request_review` with review state `changes_requested` from an allowed login
2. top-level PR `issue_comment` body beginning with `/rework` from an allowed login

It intentionally ignores:

1. inline diff comments
2. review thread replies
3. plain PR comments without `/rework`
4. approvals
5. dismissed reviews
6. any accepted signal when the linked issue is not currently `In Review`
7. any accepted signal when the linked issue is in `Coldets Draft Work`
8. any accepted signal when the linked issue has `symphony:disabled`

The authoritative PR-to-ticket join remains the branch name `symphony/<issue>`.

### 10. Accepted GitHub Requeue Signals Leave Audit Notes

When Symphony accepts a GitHub review signal and moves a ticket from `In Review` to `Rework`, it
should leave a concise Linear status note summarizing:

1. the accepted signal type
2. the GitHub actor
3. the PR URL
4. the observed head SHA when available

When the accepted signal is `/rework`, Symphony should also leave a short GitHub acknowledgment
comment on the PR conversation.

### 11. Keep the source checkout clean before dispatching new work

The Symphony bootstrap step now expects a clean source checkout by default.

If the source repo is dirty, bootstrap should fail unless
`SYMPHONY_OVERLAY_SOURCE_DIFFS=1` is explicitly enabled to intentionally copy those local
changes into the new worktree.

### 12. Use terminal states to release workspaces

Worktree cleanup happens when the issue reaches a terminal state.

If a ticket should stop consuming local workspace/process attention, move it to `Done`, `Duplicate`,
or `Canceled`.

### 13. Use issue-scoped local service URLs when running worktree-local servers

Generated workspace env files now carry issue-scoped `portless` API URLs.

If a ticket needs a local API process for validation, prefer those generated URLs and service names
over hard-coded localhost ports so multiple worktrees can coexist on the same host.

### 14. Expect one local database per issue workspace

Generated workspace env files now override `DATABASE_URL` per issue workspace.

That means data created during one Symphony ticket should stay inside that ticket's database and be
dropped during terminal-state cleanup.

## Suggested Human Workflow

1. Create the issue in an admitted `Coldets` project.
2. Write a self-contained description with goal, constraints, and validation.
3. Use `Coldets Draft Work` if the ticket should stay out of Symphony automation for now.
4. Leave it in `Backlog` until it is ready.
5. Move it to `Todo` to dispatch it to Symphony.
6. Expect Symphony to move it to `In Progress` once active work starts.
7. Use the Linear issue for orchestration notes and use the PR as the primary review thread once it
   exists.
8. Review the PR while the issue sits in `In Review`.
9. If implementation changes are needed, move the issue to `Rework`.
10. If the PR is approved to land, move the issue to `Approved`.
11. Expect Symphony to rebase, validate, merge, and move the issue to `Done`.
12. If you want to close work without running the merge handoff, move the issue directly to `Done`.

## Suggested Rework Loop

1. Review the PR and leave concrete follow-up instructions on the PR and, if needed, a brief
   operator note on the Linear issue.
2. Move the issue from `In Review` to `Rework`.
3. Expect Symphony to claim it, read the latest review context, and move it to `In Progress`.
4. When the next reviewable state is ready, Symphony moves it back to `In Review`.
5. Move it to `Approved` or `Done` only when the work is accepted.

## Suggested Approval Loop

1. Review the PR and confirm it is ready to land.
2. Move the issue from `In Review` to `Approved`.
3. Expect Symphony to rebase against the current PR base branch, resolve trivial Markdown
   conflicts, run validation, and merge the PR.
4. If the merge session succeeds, Symphony moves the issue to `Done` with a short merge note.
5. If the merge session hits ambiguous conflicts or non-trivial validation failures, Symphony moves
   the issue back to `In Review` with an explanation.

## Current Non-Goals

The current workflow does not yet provide:

- automatic approval or merge without a human moving the ticket to `Approved`,
- automatic issue completion based on GitHub merge detection outside the `Approved` handoff,
- comment-driven wakeups from PR or Linear review threads,
- queue prioritization beyond Linear state plus the current concurrency caps,
- issue-scoped QStash isolation for fully parallel local smoke queues.
