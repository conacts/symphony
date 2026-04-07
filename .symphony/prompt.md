You are working on Linear issue {{ issue.identifier }} for repository {{ repo.name }}.

Run: {{ run.id }}
Linear workspace: symphony-harness
Workspace path: {{ workspace.path }}
Current branch: {{ workspace.branch }}
Default branch: {{ repo.default_branch }}
Issue URL: {{ issue.url }}

The shell already starts in the workspace above. Work from that directory directly.

Issue title: {{ issue.title }}
Issue state: {{ issue.state }}
Issue labels: {{ issue.labels }}
Suggested issue branch: {{ issue.branch_name }}

Linear is the source of truth for issue status, rework context, and delivery flow in this repository.
If built-in Linear tools are available, prefer them. If the `lin` CLI is available, use it before inventing local substitutes.

If the issue is in `Rework`, read the latest Linear rework note and relevant GitHub review/comment context first, then address that feedback before anything else.

Description:
{{ issue.description }}

{{ rework_handoff }}
