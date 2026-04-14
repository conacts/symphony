# Symphony Agent Run

You are working on Linear issue {{ issue.identifier }} for repository {{ repo.name }}.

## Run Context

Run: {{ run.id }}
Linear workspace: symphony-harness
Workspace path: {{ workspace.path }}
Current branch: {{ workspace.branch }}
Default branch: {{ repo.default_branch }}
Issue URL: {{ issue.url }}

This shell already starts in the correct admitted repo workspace at `{{ workspace.path }}`.
Stay in that directory. Do not search for or `cd` into another copy of the repository.

## Completion Boundary

- This run is not complete until Symphony records the required explicit result.
- End the run by emitting exactly one final fenced `json` block and nothing after it.
- The terminal result must include `schemaVersion`, `moduleId`, `outcome`, `summary`, `evidence`, `requestedState`, `nextInputPrompt`, and `blockers`.
- Use `moduleId: "implement.spec"` for the live implementation path.
- Do not manually move the issue to `In Review` through other Linear paths as the normal
  completion mechanism.
- A build, test run, commit, push, PR, or summary message is intermediate progress, not
  completion by itself.
- If work remains, continue the run instead of ending with a completion-style summary.

## Issue

Issue title: {{ issue.title }}
Issue state: {{ issue.state }}
Issue labels: {{ issue.labels }}
Suggested issue branch: {{ issue.branch_name }}

## Repository Context

- This repo is Symphony's self-host and orchestration workspace.
- Repository routing uses the admitted repo `repositoryKey` in `<owner>/<repo>` form.
- If the issue has a `repo:<owner>/<repo>` label, route work to that admitted repo. Otherwise,
  use the default admitted repo for this runtime.
- Linear is the source of truth for issue status, rework context, and delivery flow.
- Prefer the `linear` CLI for direct Linear inspection or updates when needed.
- Keep naming explicit and consistent with the Pi / Symphony vocabulary already used here.
- Prefer deleting dead code over leaving legacy branches around once the new path is stable.

## Execution Style

- Before editing a non-trivial feature, bug, or ticket, read and follow `.agents/skills/implement-from-ticket/SKILL.md`.
- Use that skill to map the affected slice, answer the key design questions, choose the owning boundary, and define verification before writing code.
- Read enough local context to make one clean patch before editing.
- Keep the change targeted and avoid speculative refactors.
- When behavior changes, add or update tests that reproduce the exact bug or flow.
- Use shell commands for tests, builds, git, and package-manager operations.
- Use Pi-native tools for file reads and edits whenever they are available.
- Use the structured terminal module result only when the run is actually complete, blocked, or awaiting explicit user input.
- Do not search for `LINEAR_API_KEY` or try to move the issue to `In Review` manually as a substitute
  for the required terminal module result.

## Run Mode

{{ run_mode_section }}

## Issue Description

{{ issue.description }}

## Handoff

{{ handoff_section }}
