# Symphony Evaluation Setup

Date: 2026-03-28

## Purpose

Document the repo-owned, in-repo Symphony evaluation workflow for local and server-hosted runs.

For the operator-facing Linear state flow and ticket-placement guidance, see `docs/architecture/symphony-linear-ticket-lifecycle.md`.
For the TypeScript control-plane parity checklist and cutover gates, see
`docs/architecture/symphony-typescript-parity-readiness.md`.

## Repo-Owned Files

- `WORKFLOW.md`
- `scripts/symphony/run-local.sh`
- `scripts/symphony/run-typescript-local.sh`
- `scripts/symphony/check-typescript-parity.sh`
- `symphony/README.md`
- `symphony/elixir/README.md`
- `docs/adr/2026-03-20-symphony-local-evaluation-workflow.md`
- `docs/adr/2026-03-24-linear-agent-review-handoff-state-model.md`
- `docs/adr/2026-03-26-symphony-approved-merge-handoff.md`
- `docs/adr/2026-03-24-repo-owned-symphony-source-and-upstream-sync.md`
- `docs/adr/2026-03-24-symphony-fail-closed-worktree-validation.md`
- `docs/adr/2026-03-24-symphony-startup-failures-return-to-backlog.md`
- `docs/adr/2026-03-27-symphony-github-review-signals-reactivate-rework.md`
- `docs/adr/2026-03-28-symphony-team-scope-with-project-exclusions.md`
- `docs/architecture/symphony-typescript-parity-readiness.md`

## Workflow Contract

- Tracker: Linear team `Coldets` (`COL`)
- Linear scope: team-scoped polling across admitted `Coldets` projects
- Hard-excluded project: `Coldets Draft Work` (`1b690484-2122-4421-b160-1cfed2f8097c`)
- Project-backed only: issues with no Linear project membership are ignored
- Active states: `Todo`, `In Progress`, `Rework`, `Approved`
- Claim transition: `Todo` / `Rework` -> `In Progress`
- Startup failure transition: `In Progress` -> `Backlog` with no automatic retry
- Terminal states: `Closed`, `Cancelled`, `Canceled`, `Duplicate`, `Done`
- Poll interval: `5000ms`
- Workspace root: `$SYMPHONY_WORKSPACE_ROOT`
- Max concurrent agents: `5`
- Max concurrent `Approved` merge sessions: `1`
- Max turns per invocation: `20`
- Codex command: `codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh app-server`
- Approval policy: `never`
- Thread sandbox: `danger-full-access`
- Optional GitHub review ingress:
  - repo: `openai/symphony`
  - webhook secret: `$GITHUB_WEBHOOK_SECRET`
  - API token: `$GITHUB_TOKEN`
  - state path: `$SYMPHONY_GITHUB_STATE_PATH`

Model pinning note:

- If you explicitly pin Codex Spark in this workflow, use `gpt-5.3-codex-spark`.
- `codex-5.3-spark` is not accepted by the local Codex CLI when authenticated through the current ChatGPT-account flow.

## Launcher Defaults

`./scripts/symphony/run-local.sh` exports these defaults before starting Symphony:

- `SYMPHONY_SOURCE_REPO=$REPO_ROOT`
- `SYMPHONY_WORKSPACE_ROOT=$HOME/code/workspaces/symphony`
- `SYMPHONY_INSTALL_ROOT=$REPO_ROOT/symphony/elixir`
- `SYMPHONY_PR_BASE_REF=<repo default branch unless overridden>`

Requirements:

- `LINEAR_API_KEY`
- `GITHUB_WEBHOOK_SECRET` when GitHub review ingress is enabled
- `GITHUB_TOKEN` when GitHub review ingress is enabled
- `mise`
- `codex`
- `gh`
- `~/.codex/auth.json` for the standard Codex CLI auth flow
- GitHub CLI auth (`gh auth login`) or equivalent stored GitHub credentials
- a built in-repo Symphony runtime at `$SYMPHONY_INSTALL_ROOT`

The launcher also always passes:

- `--i-understand-that-this-will-be-running-without-the-usual-guardrails`

Observability and forensics defaults:

- `--logs-root` now also controls the local SQLite forensic journal path
- default journal path: `log/run-journal.sqlite3`
- default retention window: 90 days
- default web surfaces when `server.port` is enabled:
  - runtime dashboard: `/`
  - issue index: `/issues`
  - issue detail: `/issues/:issue_identifier`
  - run detail: `/runs/:run_id`
  - problem runs: `/problem-runs`
  - JSON API: `/api/v1/issues`, `/api/v1/issues/:issue_identifier`, `/api/v1/runs/:run_id`, `/api/v1/problem-runs`

## Issue Label Overrides

Symphony now supports per-ticket Codex profile overrides through Linear labels.

Supported label namespaces:

- `symphony:model:gpt-5.4`
- `symphony:model:gpt-5.4-mini`
- `symphony:model:gpt-5.3-codex-spark`
- `symphony:reasoning:low`
- `symphony:reasoning:medium`
- `symphony:reasoning:high`
- `symphony:reasoning:xhigh`

Behavior:

1. If no Symphony profile labels are present, runtime defaults stay `gpt-5.4` plus `xhigh`.
2. Model and reasoning labels are independent; set one or both.
3. Multiple distinct labels in the same namespace fail closed instead of guessing.
4. Unsupported values under either namespace fail closed instead of being ignored.
5. Additional control labels now exist:
   - `symphony:no-auto-rework` disables automatic GitHub review-driven `In Review -> Rework`
   - `symphony:disabled` fully disables Symphony dispatch and GitHub-driven requeue

## Hook Behavior

Workflow-state behavior:

1. `In Review` is a non-active handoff state for Symphony even though it remains a visible Coldets
   team status.
2. `Rework` is the explicit implementation requeue state. When Symphony claims that state, the agent
   should already find the issue moved back to `In Progress` by Symphony before changing code.
3. `Approved` is the explicit merge handoff state. When Symphony claims that state, the agent must
   stay in merge-only mode: leave an initial Linear status note, rebase against the current PR base
   branch, resolve conflicts, run validation, merge, and then either move the issue to `Done` or
   return it to `In Review`.
4. General PR comments and Linear comments are review content, not wake-up signals. The repo-owned
   host now admits a narrow GitHub-driven `In Review -> Rework` seam for:
   - formal `changes_requested` reviews from allowed logins
   - top-level PR comments that begin with `/rework` from allowed logins; remaining text becomes
     operator context for the rework pass
   - Linear label `symphony:no-auto-rework` disables automatic review-driven requeue for that
     ticket, but explicit `/rework` still wins
   - Linear label `symphony:disabled` blocks both dispatch and GitHub-driven requeue for that
     ticket
5. Once a PR exists, GitHub PR discussion is the preferred review thread; Linear stays focused on
   orchestration, PR linking, and concise operator notes.
6. `WORKFLOW.md` now configures claim-time state transitions so the orchestrator moves `Todo` and
   `Rework` into `In Progress` before agent dispatch, while `Approved` stays in place for the merge
   phase.
7. The repo-owned merge validation gate is `pnpm build && pnpm test && pnpm lint` after the rebase,
   plus any stricter ticket-provided validation that still applies.
8. `WORKFLOW.md` caps `Approved` concurrency to one agent at a time through
   `agent.max_concurrent_agents_by_state.approved = 1`.
9. Workspace/bootstrap startup failures do not enter the retry queue. Symphony leaves a failure
   comment, attempts to move the ticket to `Backlog`, cleans the partial workspace, and waits for a
   human to move the issue back into an active state after the prerequisite is fixed.

GitHub review-ingress behavior:

1. The webhook endpoint is `POST /api/v1/github/review-events`.
2. The current repo-owned host accepts only `pull_request_review` and `issue_comment`.
3. It validates GitHub `X-Hub-Signature-256` HMAC before any persistence or processing.
4. It rejects repositories other than `openai/symphony`.
5. It writes accepted deliveries to a host-level NDJSON journal before processing review signals.
6. The default state-path contract is host-level rather than repo-local so restart-safe dedupe does
   not depend on a mutable worktree checkout.
7. Accepted `In Review -> Rework` transitions leave concise Linear notes.
8. `/rework` additionally leaves a short GitHub acknowledgment comment, and any trailing operator
   context is echoed into the Linear requeue note for the resumed rework pass.

Run-forensics behavior:

1. The forensic store is host-local and operational only. It is not a Core V1 product database.
2. The top-level browse model is issue-centric:
   - one issue has many runs
   - one run has many turns
   - one turn has many recorded events
3. Each run stores rendered prompts, raw Codex event envelopes, thread/turn/session ids, and a
   start/end repo snapshot.
4. Repo snapshots are best-effort and include commit hash, dirty flag, `git status --short`,
   diffstat, and a truncated patch.
5. Oversized raw event payloads are truncated before storage rather than making the journal
   unbounded.
6. The current problem-run surface is keyed to non-success outcomes such as:
   - `paused_max_turns`
   - `rate_limited`
   - `startup_failed`
   - `stalled`
   - other failure outcomes emitted by the orchestrator
7. The run-detail page supports direct JSON export by copying the nested run document from the API.

This repo no longer owns host-repo worktree bootstrap, validation, or cleanup scripts. If a target
application wants per-issue worktrees or repo-specific lifecycle hooks, that integration should be
owned by the target repository rather than duplicated here.

## Environment Model

Current evaluation hosts are expected to provide one of these env sources:

- preferred: checked-in `.env.example` files plus ignored app-local `.env.local` files under the
  kept Symphony apps,
- fallback: direct shell exports for local evaluation when you want to avoid local env files.

Notes:

1. New Symphony worktrees receive workspace-local generated env files rather than symlinks, so later edits to the source repo env inputs do not silently mutate already-bootstrapped issue workspaces.
2. Generated workspace env files now carry issue-scoped `DATABASE_URL`, API `portless` helper values, and API URL overrides.
3. `.symphony/workspace.env` is a worktree-local metadata file used by cleanup; keep `.symphony/` ignored.
4. In v1, Symphony worktrees share one local QStash service per machine instead of attempting one QStash instance per worktree.
5. Portless proxy routing is currently fixed to the local-core default port (`1355`) rather than a Symphony-specific override.

## Vercel Preview Ownership

- Deployable Vercel apps in this repo should use dedicated app-root projects when they are linked.
- Symphony agents should not run `vercel`, `vercel deploy`, or other direct deployment commands from a worktree. Preview deployments are expected to come from Git/PR integration after the branch is pushed.
- App-local `.vercel/project.json` files are retained so worktree bootstrap can refresh shared env and operators/agents can run inspection commands such as `vercel env ls`, `vercel env pull`, and `vercel inspect` against the existing project.

## Recommended Host Layout

If you want server behavior to mirror a developer machine closely, use this shape:

- source repo: `/home/<user>/code/symphony`
- Symphony runtime root: `/home/<user>/code/symphony/symphony/elixir`
- workspace root: `/home/<user>/code/workspaces/symphony`

Matching env values:

- `SYMPHONY_INSTALL_ROOT=/home/<user>/code/symphony/symphony/elixir`
- `SYMPHONY_SOURCE_REPO=/home/<user>/code/symphony`
- `SYMPHONY_WORKSPACE_ROOT=/home/<user>/code/workspaces/symphony`
- `SYMPHONY_GITHUB_STATE_PATH=/home/<user>/.symphony/state/github-review-events.ndjson`

## GitHub Webhook Setup

To enable GitHub-driven `In Review -> Rework` automation on a server-hosted Symphony node:

1. set `server.port` in `WORKFLOW.md` or pass `--port` when launching Symphony
2. provide:
   - `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_TOKEN`
   - `SYMPHONY_GITHUB_STATE_PATH`
3. configure `WORKFLOW.md` with the `github` block:

```yaml
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
```

4. expose the webhook path `POST /api/v1/github/review-events` over HTTPS
5. register a GitHub repository webhook for:
   - `Pull request reviews`
   - `Issue comments`

Notes:

1. GitHub requires HTTPS for normal webhook delivery, so a public reverse proxy or tunnel should
   terminate TLS in front of the Symphony port.
2. The webhook path is intentionally narrow and should be the only externally exposed Symphony route
   unless you intentionally publish the observability surfaces as well.
3. The current requeue contract ignores general PR traffic and only accepts:
   - `changes_requested` reviews from allowed logins
   - top-level PR comments beginning with `/rework` from allowed logins

## Start

From the repo root:

```bash
./scripts/symphony/run-local.sh
```

The command fails fast if `LINEAR_API_KEY`, `mise`, `codex`, `WORKFLOW.md`, or the built Symphony binary are missing.

If a target repository needs issue worktrees or custom workspace hooks, invoke that repository's
own tooling instead of shelling back into this repo.
