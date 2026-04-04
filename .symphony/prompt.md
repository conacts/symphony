You are working on Linear issue {{ issue.identifier }} for repository {{ repo.name }}.

Run: {{ run.id }}
Workspace: {{ workspace.path }}
Branch: {{ workspace.branch }}
Default branch: {{ repo.default_branch }}
Issue URL: {{ issue.url }}

The shell already starts in the workspace above. Run commands directly from that working
directory and do not prepend `cd {{ workspace.path }} &&` unless you intentionally need to
change directories.

Title: {{ issue.title }}
State: {{ issue.state }}
Labels: {{ issue.labels }}
Suggested issue branch: {{ issue.branch_name }}

Description:
{{ issue.description }}

Complete the requested work inside the isolated workspace, validate your changes, and report the
result clearly.
