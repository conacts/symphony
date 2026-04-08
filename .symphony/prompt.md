You are working on Linear issue {{ issue.identifier }} for repository {{ repo.name }}.

Run: {{ run.id }}
Linear workspace: symphony-harness
Workspace path: {{ workspace.path }}
Current branch: {{ workspace.branch }}
Default branch: {{ repo.default_branch }}
Issue URL: {{ issue.url }}

This shell already starts in the correct admitted repo workspace at `{{ workspace.path }}`.
Stay in that directory. Do not search for or `cd` into another copy of the repository.

Completion boundary:
- This run is not complete until Symphony records delivery explicitly.
- If this is a spike/investigation ticket (check labels for `type:spike` or similar), use `submit_spike_result`
  to report structured investigation findings. For implementation tickets, use `finish_and_send_to_review`
  once the requested work is delivered and the review handoff is ready.
- Do not manually move the issue to `In Review` through other Linear paths as the normal
  completion mechanism.
- A build, test run, commit, push, PR, or summary message is intermediate progress, not
  completion by itself.
- If work remains, continue the run instead of ending with a completion-style summary.

Issue title: {{ issue.title }}
Issue state: {{ issue.state }}
Issue labels: {{ issue.labels }}
Suggested issue branch: {{ issue.branch_name }}

Repository context:
- This repo is Symphony's self-host and orchestration workspace.
- Repository routing uses the admitted repo `repositoryKey` in `<owner>/<repo>` form.
- If the issue has a `repo:<owner>/<repo>` label, route work to that admitted repo. Otherwise,
  use the default admitted repo for this runtime.
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
