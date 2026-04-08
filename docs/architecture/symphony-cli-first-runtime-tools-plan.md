# Symphony CLI-First Runtime Tools Plan

## Goal

Replace Symphony's runtime-injected tools with real CLI commands that are available inside the workspace box and executed like any other agent command.

First pass scope:

- `symphony tool finish`
- `symphony tool spike-result`

## Why

The current dynamic-tool approach has three problems:

1. tool availability depends on runtime transport wiring
2. the tools are not discoverable as real commands inside the box
3. the mental model is wrong for the agent because the command does not exist in the shell

A CLI-first model fixes that:

- the agent runs a real command
- the command is available inside the workspace runtime
- Symphony can observe it through normal command execution telemetry
- the implementation no longer depends on dynamic tool injection

## Architecture

### App Ownership

Use `apps/cli` for the executable surface.

`apps/cli` should own:

- oclif configuration
- commands
- hook wiring
- CLI packaging
- JSON output formatting

Shared logic should remain in reusable packages so the CLI stays thin.

### Execution Boundary

Agent-facing CLI commands must run inside the workspace container or workspace execution target, not on the API host.

That means:

- the CLI must be available inside the workspace box
- the agent should invoke it through the same isolated command path it already uses
- runtime context should be passed explicitly through env vars or flags

### Command Style

Agent-facing commands should be:

- narrow
- JSON-first
- explicit
- stable

The CLI should optimize for programmatic invocation, not only human ergonomics.

## Phases

### Phase 1: Scaffold `apps/cli`

Deliverables:

- `apps/cli` oclif app
- TypeScript build/test/lint wiring
- `tool` command namespace
- JSON output helper
- minimal lifecycle hooks:
  - `init`
  - `prerun`
  - `finally`

Constraints:

- no runtime plugin marketplace
- no generalized tool registry
- no business logic migration yet

### Phase 2: Extract Shared Runtime Tool Logic

Move reusable logic out of `apps/api/src/core/runtime-dynamic-tools.ts` into a shared package.

Candidate extracted logic:

- argument normalization
- delivery report execution
- spike result execution
- issue state transition handling
- shared result/error formatting

Goal:

- API dynamic tools and CLI commands call the same implementation during migration

### Phase 3: Implement `symphony tool finish`

Target behavior:

- validate command arguments
- validate runtime context
- record delivery report
- move completed work to `In Review`
- emit structured JSON
- exit non-zero on failure

Expected invocation shape:

```bash
symphony tool finish \
  --status completed \
  --summary "Opened PR with requested changes." \
  --pr-url https://github.com/... \
  --branch-name codex/col-123
```

### Phase 4: Implement `symphony tool spike-result`

Target behavior:

- validate the structured spike result payload
- post a detailed Linear comment for the active issue
- move the issue to the configured pause state by default
- emit structured JSON
- exit non-zero on failure

Expected invocation shape:

```bash
symphony tool spike-result \
  --summary "Recommended the Agent OS spike." \
  --details-file ./spike-result.md
```

### Phase 5: Make Commands Available Inside the Box

First version:

- invoke through `pnpm exec symphony ...`

Later version:

- install the CLI directly into the workspace image so the agent can run `symphony ...`

Recommendation:

- start with `pnpm exec`
- move to direct binary installation only after the behavior is proven

### Phase 6: Prompt and Runtime Integration

Update the Symphony prompt and runtime guidance so the agent uses CLI commands rather than dynamic runtime tools.

Keep the old dynamic tools temporarily as fallback during migration.

### Phase 7: Telemetry

Track CLI usage through normal command execution analytics:

- command name
- sanitized arguments
- exit code
- duration
- resource profile
- parsed success/failure result

### Phase 8: Migration Completion

Rollout order:

1. scaffold `apps/cli`
2. extract shared tool logic
3. implement `tool finish`
4. implement `tool spike-result`
5. make CLI available in the workspace box
6. update prompt/runtime guidance
7. validate in a real agent run
8. remove dynamic-tool injection once stable

## Runtime Context Contract

Expected env for agent-facing commands:

- `SYMPHONY_RUN_ID`
- `SYMPHONY_ISSUE_ID`
- `SYMPHONY_ISSUE_IDENTIFIER`
- optional `SYMPHONY_TURN_ID`
- `LINEAR_API_KEY` where needed

Commands should fail clearly when required context is missing.

## Risks

### Command Availability

If the command is not reliably available inside the box, the migration fails.

### Context Drift

If run and turn context are not passed explicitly, CLI commands will become fragile.

### Logic Duplication

If API and CLI implementations diverge during migration, behavior will drift.

### Overbuilding

The first pass should remain limited to the two commands above.

## Recommendation

Use `apps/cli` with oclif for the command surface.

Keep commands thin, JSON-first, and box-local.

The first real milestone should deliver:

- `apps/cli`
- `symphony tool finish`
- `symphony tool spike-result`
- workspace-box invocation through `pnpm exec`
