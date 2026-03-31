---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  team_key: "COL"
  excluded_project_ids:
    - "1b690484-2122-4421-b160-1cfed2f8097c"
  active_states:
    - "Todo"
    - "In Progress"
    - "Rework"
    - "Approved"
  claim_transition_to_state: "In Progress"
  claim_transition_from_states:
    - "Todo"
    - "Rework"
  startup_failure_transition_to_state: "Backlog"
  terminal_states:
    - "Closed"
    - "Cancelled"
    - "Canceled"
    - "Duplicate"
    - "Done"
polling:
  interval_ms: 5000
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
github:
  repo: "openai/symphony"
  webhook_secret: $GITHUB_WEBHOOK_SECRET
  api_token: $GITHUB_TOKEN
  state_path: $SYMPHONY_GITHUB_STATE_PATH
  allowed_review_logins:
    - "chatgpt-codex-connector[bot]"
    - "conacts"
  allowed_rework_comment_logins:
    - "conacts"
agent:
  max_concurrent_agents: 5
  max_concurrent_agents_by_state:
    approved: 1
  max_turns: 20
codex:
  command: codex --config shell_environment_policy.inherit=all --model gpt-5.4 --config model_reasoning_effort=xhigh app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
---

You are working on Linear issue {{ issue.identifier }} in the Symphony workflow.

Title: {{ issue.title }}

Description:
{{ issue.description }}

## Repo Expectations

1. Follow `AGENTS.md` at the repo root.
2. Keep changes reproducible through the real API + CLI loop whenever feasible.
3. Update ADRs, living docs, and the rubric when the change affects durable behavior, boundaries, or engineering standards.
4. Do not add CLI retries; retries belong in API-only paths.
5. Treat communication-decision audit failures as hard failures in smoke validation.

## Issue Workflow

1. If `{{ issue.state }}` is `Approved`, this is a merge-only session:

   **Phase 1 — Rebase and resolve conflicts:**
   a. Find the existing PR for branch `symphony/{{ issue.identifier }}` using `gh pr view symphony/{{ issue.identifier }}`.
   b. Leave a brief **Linear status note** that the approved merge session has started and Symphony is rebasing the PR branch before merge.
   c. Determine the base branch from the PR when it exists. If there is no PR, use `SYMPHONY_PR_BASE_REF` when it is set; otherwise use the repository default branch.
   d. Run `git fetch origin <base-ref>` and `git rebase origin/<base-ref>`.
   e. If the rebase conflicts:
      - For Markdown conflicts, keep both sides' non-duplicative content and restore clean formatting.
      - For code conflicts, resolve against the PR intent plus the latest base-branch behavior.
      - If you cannot resolve confidently, leave a **Linear comment** explaining what is blocked, move the issue back to `In Review`, and stop without merging.

   **Phase 2 — Validate, push, and merge:**
   f. Run `pnpm build && pnpm test && pnpm lint`, plus any stricter ticket-provided validation that still matters after the rebase. If validation fails and the required fix is non-trivial, leave a **Linear comment** explaining the failure, move the issue back to `In Review`, and stop without merging.
   g. Push the rebased branch with `git push --force-with-lease`.
   h. Merge the PR with `gh pr merge symphony/{{ issue.identifier }} --squash --delete-branch`.
   i. If the Linear tool surface is available, leave a brief **Linear status note** confirming the merge commit SHA and passed validation, then move the issue to `Done`. If that is not possible, say so explicitly in your final response.
2. If this issue was resumed from `Rework`, follow a two-phase approach:

   **Phase 1 — Research (before any code changes):**
   a. Find the existing PR for branch `symphony/{{ issue.identifier }}` using `gh pr view symphony/{{ issue.identifier }}`.
   b. Read ALL GitHub PR review comments using `gh pr view symphony/{{ issue.identifier }} --comments`.
   c. Read the latest Linear issue comments for additional context.
   d. Understand the review feedback fully before touching code.
   e. Leave a **Linear comment** summarizing: what feedback was found, what you plan to change, and your approach. This comment must demonstrate genuine understanding of the review concerns — not a generic acknowledgment like "addressing review comments." For example: "Review requested extracting the retry logic into a shared helper and adding edge-case coverage for empty input. Plan: move the backoff calculation to `packages/shared/retry.ts`, add unit tests for the zero-items case, and update the existing integration test."

   **Phase 2 — Implementation:**
   a. Make the code changes to address the feedback.
   b. As you address each PR review comment, reply to it via `gh` explaining how it was addressed, then resolve the conversation using `gh api`. Every review comment that was acted on should be resolved before moving to `In Review`.
   c. Commit and push all changes (see the commit and push rule below).
   d. Leave a **GitHub PR comment** detailing the work completed — what was changed, how each piece of review feedback was addressed, and any decisions made. This must be substantive, not boilerplate.
   e. Leave a **Linear status note** summarizing the rework pass and linking the PR.
   f. Move the issue to `In Review`.
3. Symphony should already have moved `Todo` or `Rework` into `In Progress` before active implementation. If the Linear tool surface is available and the issue is still in one of those states, move it to `In Progress`. If that is not possible, say so in your final response.
4. General PR comments or Linear comments do not reactivate parked work by themselves. `In Review` is a non-active handoff state, but the repo-owned host now admits a narrow GitHub review-signal seam that may move `In Review -> Rework` for:
   - formal `changes_requested` reviews from allowed logins
   - top-level PR comments that begin with `/rework` from allowed logins; any remaining text becomes operator context for the rework pass
   - Linear label `symphony:no-auto-rework` disables automatic GitHub review-driven requeue for that ticket, but explicit `/rework` still takes precedence unless `symphony:disabled` is also present
   - Linear label `symphony:disabled` fully disables Symphony dispatch and review-driven requeue for that ticket
   Otherwise, humans must move the issue to `Rework` for another implementation pass or to `Approved` for merge execution.
5. Once a PR exists, use the GitHub PR as the primary review thread for substantive implementation discussion.
6. When implementation is ready, commit the work on the current issue branch, push it, and create or reuse a GitHub PR with `gh`. When `SYMPHONY_PR_BASE_REF` is set, use it as the PR base; otherwise use the repository default branch.
7. Do not run `vercel`, `vercel deploy`, or any other direct deployment command from a Symphony worktree. Linked app-local Vercel metadata is for env sync and inspection only.
8. Do not merge the PR, enable auto-merge, or close the Linear issue as accepted work during implementation or rework sessions. Exception: when the issue is in `Approved`, merging the PR and moving the issue to `Done` is the expected behavior.
9. If the Linear tool surface is available, add the PR URL back to the issue and move the issue to `In Review` when implementation is ready for human review. If that is not possible, say so explicitly in your final response.
10. Include the PR URL and the validation you ran in your final response. If you merged from `Approved`, also include the merge commit SHA.
11. When the session involved meaningful friction, include a short `Issues experienced` section in your final response that covers the concrete struggle, the root cause, and what would reduce that class of struggle next time.

## Commit and Push Rule

Every working session that modifies code MUST commit and push before the session ends or any state transition occurs. This is non-negotiable.

- Before moving to `In Review`, verify: `git status` shows a clean working tree and `git push` has succeeded.
- Before merging from `Approved`, verify: `git status` shows a clean working tree, `git push --force-with-lease` has succeeded, and post-rebase validation passed.
- If a rework session addressed review feedback but produced no code changes, leave a Linear comment explaining what was reviewed and why no changes were needed. Do not silently move back to `In Review`.
- Never move to `In Review` with uncommitted or unpushed changes. If you changed code, it must be on the remote before the state transition.

## PR Description Quality

There is no rigid PR template, but every PR body must meet these expectations:

- Write for a reviewer who is not deeply familiar with the codebase context.
- Explain **why** the change was made, not just what files were touched.
- Summarize the approach and call out key decisions or trade-offs.
- Describe how the change was validated (commands run, tests passed, behavior verified).
- On rework passes where the PR already has a body, update the PR body to reflect the latest state of the implementation. Do not leave a stale description that contradicts the current code.

## Status Note and Comment Policy

Leave Linear status comments for major milestones and every issue state transition you perform. At minimum, leave a Linear status note when:
- You create the first PR.
- You move the issue to `In Review`.
- You move the issue to `Done` from `Approved`.
- Scope or implementation direction changes materially.
- You discover a blocker that changes the delivery plan.

**In Review status notes must be substantive.** When moving to `In Review`, include:
- What was implemented or changed (not just "moved to In Review").
- Link to the PR.
- What validation was run.
- Any meaningful issues experienced during implementation and how they were resolved.
- Any open questions or known limitations for the reviewer.

**GitHub PR comments for rework completion must be substantive.** When you finish addressing review feedback:
- Leave a comment on the PR explaining what was changed and how each piece of feedback was addressed.
- Reference the specific review comments you acted on.
- This is not a checkbox exercise — the comment should give the reviewer confidence that the feedback was understood and addressed thoughtfully.

**Done status notes from `Approved` must be substantive.** When moving to `Done`, include:
- The merge commit SHA.
- Link to the PR.
- The validation that passed after the rebase.

Do not duplicate the automatic pickup note that Symphony leaves when it moves `Todo` or `Rework` into `In Progress`.

## Completion Bar Before In Review

All of the following must be true before moving to `In Review`:

- All code changes from this session are committed and pushed (`git status` clean, `git push` succeeded).
- If rework: all addressed PR review comments have been replied to and resolved via `gh`.
- If rework: a substantive GitHub PR comment explains how review feedback was addressed.
- The PR body accurately describes the current state of the implementation.
- The changed behavior is validated for the latest commit.
- All required ticket-provided validation items are complete.
- PR feedback sweep is complete and no actionable comments remain.
- The branch is pushed and the PR is linked on the issue.
- The issue is ready for a human to review without additional Symphony follow-up.

## Completion Bar Before Done From Approved

All of the following must be true before moving to `Done` from `Approved`:

- The branch is rebased onto the current PR base branch or configured base ref.
- Any conflicts were resolved confidently; otherwise the issue went back to `In Review`.
- `pnpm build && pnpm test && pnpm lint` passed for the rebased branch, plus any stricter ticket-provided validation that still applied.
- `git push --force-with-lease` succeeded.
- The PR merged successfully.
- The `Done` status note includes the merge commit SHA and validation summary.

Leave the workspace in a reviewable state.
