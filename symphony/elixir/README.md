# Symphony Elixir

This directory contains the current Elixir/OTP implementation of Symphony, based on
[`SPEC.md`](../SPEC.md) at the repository root.

> [!WARNING]
> Symphony Elixir is prototype software intended for evaluation only and is presented as-is.
> We recommend implementing your own hardened version based on `SPEC.md`.

## Coldets Usage

In Coldets, this runtime lives at `symphony/elixir` inside the main repo and is launched through the
repo-owned wrapper at `./scripts/symphony/run-local.sh`.

That means:

- `../../WORKFLOW.md` is the canonical Coldets workflow contract
- `../../scripts/symphony/` owns Coldets worktree bootstrap and cleanup
- `./WORKFLOW.md` remains a Symphony-local reference/example workflow for standalone usage and tests
- `SYMPHONY_INSTALL_ROOT` now defaults to this in-repo directory

Typical local flow from the Coldets repo root:

```bash
cd symphony/elixir
mise trust
mise install
mise exec -- mix setup
mise exec -- mix build
cd ../..
./scripts/symphony/run-local.sh
```

## How it works

1. Polls Linear for candidate work
2. Creates a workspace per issue
3. Launches Codex in [App Server mode](https://developers.openai.com/codex/app-server/) inside the
   workspace
4. Sends a workflow prompt to Codex
5. Keeps Codex working on the issue until the work is done

During app-server sessions, Symphony can also serve a client-side `linear_graphql` tool as a
fallback for raw Linear GraphQL operations when Linear MCP is unavailable or too limited for a
specific operation.

In the Coldets repo-owned deployment, Symphony can also ingest a narrow GitHub webhook contract to
move linked Linear issues from `In Review` back to `Rework` when:

1. an allowed GitHub reviewer submits `changes_requested`
2. an allowed top-level PR comment begins with `/rework`

If a claimed issue moves to a terminal state (`Done`, `Canceled`, or `Duplicate`),
Symphony stops the active agent for that issue and cleans up matching workspaces.
If an agent fails before handoff, Symphony posts a concise comment on the Linear issue with the
failure summary and a trimmed error excerpt so operators can see the blocker without inspecting the
service logs first.

## How to use it

1. Make sure your codebase is set up to work well with agents: see
   [Harness engineering](https://openai.com/index/harness-engineering/).
2. Get a new personal token in Linear via Settings → Security & access → Personal API keys, and
   set it as the `LINEAR_API_KEY` environment variable.
3. Copy this directory's `WORKFLOW.md` to your repo.
4. Optionally copy the `commit`, `push`, `pull`, and `linear` skills to your repo.
   - Prefer Linear MCP for routine issue and comment editing.
   - Use the repo-local `linear` skill or `linear_graphql` fallback only for raw GraphQL operations
     that MCP does not expose cleanly.
5. Customize the copied `WORKFLOW.md` file for your project.
   - To get your project's slug, right-click the project and copy its URL. The slug is part of the
     URL.
   - The checked-in reference workflow assumes these Linear states exist:
     `Backlog`, `Todo`, `In Progress`, `Rework`, `Blocked`, `In Review`, `Done`, `Canceled`, and
     `Duplicate`.
   - If you want Symphony to move issues into an execution state on pickup, configure
     `tracker.claim_transition_to_state` plus `tracker.claim_transition_from_states`.
6. Follow the instructions below to install the required runtime dependencies and start the service.

## Prerequisites

We recommend using [mise](https://mise.jdx.dev/) to manage Elixir/Erlang versions.

```bash
mise install
mise exec -- elixir --version
```

## Run

```bash
cd symphony/elixir
mise trust
mise install
mise exec -- mix setup
mise exec -- mix build
```

From the Coldets repo root, the normal launcher is:

```bash
./scripts/symphony/run-local.sh
```

That wrapper supplies the repo-owned workflow path and defaults `SYMPHONY_INSTALL_ROOT` to this
directory. It also fails fast if `bin/symphony` is missing or older than the checked-in Elixir
source/config files, so rebuild after pulling runtime changes:

```bash
cd symphony/elixir
mise exec -- mix setup
mise exec -- mix build
```

## Configuration

Pass a custom workflow file path to `./bin/symphony` when starting the service:

```bash
./bin/symphony /path/to/custom/WORKFLOW.md
```

If no path is passed, Symphony defaults to `./WORKFLOW.md`.

Optional flags:

- `--logs-root` tells Symphony to write logs and the local forensic SQLite journal under a
  different directory (default: `./log`)
- `--port` also starts the Phoenix observability service (default: disabled)

The `WORKFLOW.md` file uses YAML front matter for configuration, plus a Markdown body used as the
Codex session prompt.

Minimal example:

```md
---
tracker:
  kind: linear
  team_key: "COL"
  excluded_project_ids: ["linear-project-id-to-exclude"]
  dispatchable_states: ["Todo", "In Progress", "Rework"]
  claim_transition_to_state: "In Progress"
  claim_transition_from_states: ["Todo", "Rework"]
workspace:
  root: ~/code/workspaces
hooks:
  after_create: |
    git clone git@github.com:your-org/your-repo.git .
agent:
  max_concurrent_agents: 10
  max_turns: 20
codex:
  command: codex app-server
---

You are working on a Linear issue {{ issue.identifier }}.

Title: {{ issue.title }} Body: {{ issue.description }}
```

Notes:

- If a value is missing, defaults are used.
- `tracker.claim_transition_to_state` and `tracker.claim_transition_from_states` let Symphony move
  an issue into a target workflow state before dispatching the agent. This is useful for flows like
  `Todo -> In Progress` or `Rework -> In Progress` at claim time.
- Use either `tracker.project_slug` or `tracker.team_key` for Linear scope.
  - `tracker.project_slug` keeps the legacy single-project mode.
  - `tracker.team_key` admits the whole team scope, and `tracker.excluded_project_ids` can hard
    exclude specific Linear projects by ID.
- `tracker.dispatchable_states` controls which workflow states Symphony will actively pick up and
  continue. This is intentionally narrower than the full business workflow; paused states like
  `Blocked` and `In Review` should usually stay out of the dispatch list.
- Safer Codex defaults are used when policy fields are omitted:
  - `codex.approval_policy` defaults to `{"reject":{"sandbox_approval":true,"rules":true,"mcp_elicitations":true}}`
  - `codex.thread_sandbox` defaults to `workspace-write`
  - `codex.turn_sandbox_policy` defaults to a `workspaceWrite` policy rooted at the current issue workspace
- Supported `codex.approval_policy` values depend on the targeted Codex app-server version. In the current local Codex schema, string values include `untrusted`, `on-failure`, `on-request`, and `never`, and object-form `reject` is also supported.
- Supported `codex.thread_sandbox` values: `read-only`, `workspace-write`, `danger-full-access`.
- When `codex.turn_sandbox_policy` is set explicitly, Symphony passes the map through to Codex
  unchanged. Compatibility then depends on the targeted Codex app-server version rather than local
  Symphony validation.
- `agent.max_turns` caps how many back-to-back Codex turns Symphony will run in a single agent
  invocation when a turn completes normally but the issue is still in an active state. Default: `20`.
- Coldets-style issue label overrides can select the Codex runtime profile per ticket:
  - `symphony:model:gpt-5.4`
  - `symphony:model:gpt-5.4-mini`
  - `symphony:model:gpt-5.3-codex-spark`
  - `symphony:reasoning:low|medium|high|xhigh`
  - when unset, defaults remain `gpt-5.4` plus `xhigh`
- Additional issue labels can narrow Symphony behavior:
  - `symphony:no-auto-rework` disables automatic GitHub review-driven requeue
  - `symphony:disabled` fully disables Symphony dispatch and GitHub-driven requeue
- If the Markdown body is blank, Symphony uses a default prompt template that includes the issue
  identifier, title, and body.
- Use `hooks.after_create` to bootstrap a fresh workspace. For a Git-backed repo, you can run
  `git clone ... .` there, along with any other setup commands you need.
- If a hook needs `mise exec` inside a freshly cloned workspace, trust the repo config and fetch
  the project dependencies in `hooks.after_create` before invoking `mise` later from other hooks.
- `tracker.api_key` reads from `LINEAR_API_KEY` when unset or when value is `$LINEAR_API_KEY`.
- Optional GitHub review-ingress settings can also use env-backed values:
  - `github.webhook_secret: $GITHUB_WEBHOOK_SECRET`
  - `github.api_token: $GITHUB_TOKEN`
  - `github.state_path: $SYMPHONY_GITHUB_STATE_PATH`
- For path values, `~` is expanded to the home directory.
- For env-backed path values, use `$VAR`. `workspace.root` resolves `$VAR` before path handling,
  while `codex.command` stays a shell command string and any `$VAR` expansion there happens in the
  launched shell.

```yaml
tracker:
  api_key: $LINEAR_API_KEY
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
github:
  repo: "conacts/coldets-v2"
  webhook_secret: $GITHUB_WEBHOOK_SECRET
  api_token: $GITHUB_TOKEN
  state_path: $SYMPHONY_GITHUB_STATE_PATH
hooks:
  after_create: |
    git clone --depth 1 "$SOURCE_REPO_URL" .
codex:
  command: "$CODEX_BIN app-server --model gpt-5.4"
```

- If `WORKFLOW.md` is missing or has invalid YAML at startup, Symphony does not boot.
- If a later reload fails, Symphony keeps running with the last known good workflow and logs the
  reload error until the file is fixed.
- Symphony manages deterministic per-issue workspace directories. The reference workflow bootstraps
  them with `git clone` on first creation and reuses them later; it does not create a `git worktree`
  per agent unless you implement that behavior in your hooks.
- `server.port` or CLI `--port` enables the optional Phoenix LiveView dashboard and JSON API at
  `/`, `/issues`, `/issues/:issue_identifier`, `/runs/:run_id`, `/problem-runs`, `/api/v1/state`,
  `/api/v1/issues`, `/api/v1/issues/:issue_identifier`, `/api/v1/runs/:run_id`,
  `/api/v1/problem-runs`, and `/api/v1/refresh`.
- When GitHub review ingress is enabled, Symphony also serves `POST /api/v1/github/review-events`.
- The run-forensics journal is a local SQLite file under `log/run-journal.sqlite3` by default.
- The journal retains issue, run, turn, and raw event history for 90 days by default and truncates
  oversized raw payloads instead of letting the store grow without bound.

## GitHub Review Ingress

The current repo-owned implementation intentionally keeps GitHub review automation narrow:

1. accepted events:
   - `pull_request_review`
   - `issue_comment`
2. accepted wake signals:
   - formal `changes_requested` review from an allowed login
   - top-level PR comment body begins with `/rework` from an allowed login
   - any remaining text after `/rework` is treated as operator context for the rework pass
3. authoritative PR-to-ticket join:
   - branch `symphony/<issue>`
4. durable ingress behavior:
   - GitHub signature validation via `X-Hub-Signature-256`
   - host-level NDJSON journal and dedupe
   - async downstream processing after persistence

For Coldets host setup, see `../../docs/architecture/symphony-evaluation-setup.md`.

## Web dashboard

The observability UI now runs on a minimal Phoenix stack:

- LiveView for the dashboard at `/`
- LiveView issue/run forensics pages at `/issues`, `/issues/:issue_identifier`, `/runs/:run_id`,
  and `/problem-runs`
- JSON API for operational debugging under `/api/v1/*`
- Bandit as the HTTP server
- Phoenix dependency static assets for the LiveView client bootstrap

The forensics surface is intentionally issue-centric:

- `Issue`: top-level browse unit
- `Run`: one Symphony attempt for that issue
- `Turn`: one Codex turn within the run
- `Event`: one recorded raw protocol event within that turn

Each run stores:

- rendered prompts per turn
- raw Codex event envelopes
- thread/turn/session identifiers
- start/end repo snapshots with commit hash, `git status --short`, diffstat, and truncated patch
- terminal run outcome such as `paused_max_turns`, `rate_limited`, `startup_failed`, or `stalled`

## Project Layout

- `lib/`: application code and Mix tasks
- `test/`: ExUnit coverage for runtime behavior
- `WORKFLOW.md`: in-repo workflow contract used by local runs
- `../templates/`: local Symphony templates such as the PR-body format contract
- `../.codex/`: repository-local Codex skills and setup helpers

## Testing

```bash
make all
```

Run the real external end-to-end test only when you want Symphony to create disposable Linear
resources and launch a real `codex app-server` session:

```bash
cd elixir
export LINEAR_API_KEY=...
make e2e
```

Optional environment variables:

- `SYMPHONY_LIVE_LINEAR_TEAM_KEY` defaults to `SYME2E`
- `SYMPHONY_LIVE_SSH_WORKER_HOSTS` uses those SSH hosts when set, as a comma-separated list

`make e2e` runs two live scenarios:
- one with a local worker
- one with SSH workers

If `SYMPHONY_LIVE_SSH_WORKER_HOSTS` is unset, the SSH scenario uses `docker compose` to start two
disposable SSH workers on `localhost:<port>`. The live test generates a temporary SSH keypair,
mounts the host `~/.codex/auth.json` into each worker, verifies that Symphony can talk to them
over real SSH, then runs the same orchestration flow against those worker addresses. This keeps
the transport representative without depending on long-lived external machines.

Set `SYMPHONY_LIVE_SSH_WORKER_HOSTS` if you want `make e2e` to target real SSH hosts instead.

The live test creates a temporary Linear project and issue, writes a temporary `WORKFLOW.md`, runs
a real agent turn, verifies the workspace side effect, requires Codex to comment on and close the
Linear issue, then marks the project completed so the run remains visible in Linear.

## FAQ

### Why Elixir?

Elixir is built on Erlang/BEAM/OTP, which is great for supervising long-running processes. It has an
active ecosystem of tools and libraries. It also supports hot code reloading without stopping
actively running subagents, which is very useful during development.

### What's the easiest way to set this up for my own codebase?

Launch `codex` in your repo, give it the URL to the Symphony repo, and ask it to set things up for
you.

## License

This project is licensed under the [Apache License 2.0](../LICENSE).
