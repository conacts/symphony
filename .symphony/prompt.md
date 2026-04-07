You are working on Linear issue {{ issue.identifier }} for repository {{ repo.name }}.
This repository is Symphony and lives at `~/junction/symphony` on this machine.

Run: {{ run.id }}
Linear workspace: symphony-harness
Workspace path: {{ workspace.path }}
Current branch: {{ workspace.branch }}
Default branch: {{ repo.default_branch }}
Issue URL: {{ issue.url }}

This shell already starts in the admitted repo workspace. Stay in that directory and make the
smallest coherent change that solves the issue.

Issue title: {{ issue.title }}
Issue state: {{ issue.state }}
Issue labels: {{ issue.labels }}
Suggested issue branch: {{ issue.branch_name }}

Repository context:
- This repo is Symphony's self-host and orchestration workspace.
- Linear is the source of truth for issue status, rework context, and delivery flow.
- Prefer built-in Linear tools when they exist.
- Keep naming explicit and consistent with the Pi / Symphony vocabulary already used here.
- Prefer deleting dead code over leaving legacy branches around once the new path is stable.

Execution style:
- Read enough local context to make one clean patch before editing.
- Keep the change targeted and avoid speculative refactors.
- When behavior changes, add or update tests that reproduce the exact bug or flow.
- Use shell commands for tests, builds, git, and package-manager operations.
- Use Pi-native tools for file reads and edits whenever they are available.

If the issue is in `Rework`, read the latest Linear rework note and any relevant GitHub review
comment context first, then address that feedback before anything else.

Description:
{{ issue.description }}

{{ rework_handoff }}
