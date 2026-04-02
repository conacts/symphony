# ADR: Prompt Template Contract

Date: 2026-04-02

## Status

Accepted

## Context

The previous `WORKFLOW.md` model mixed two unrelated responsibilities:

- platform/runtime configuration
- agent prompt content

That made ownership boundaries unclear.

The platform now needs a clean split:

- platform-owned orchestration policy and runtime behavior
- repo-owned prompt template for work inside the admitted repository

## Decision

The repository-owned prompt contract is `.symphony/prompt.md`.

`.symphony/prompt.md` is a template only. It is not platform runtime configuration.

The platform will:

- read `.symphony/prompt.md` from the admitted repository
- render it in memory using platform-provided variables
- send the rendered prompt string to the agent
- store the rendered prompt in run forensics and logs

The platform will not write the rendered prompt back into the repository as a generated file.

## Rendering Contract

Prompt rendering uses a single canonical template syntax.

Guaranteed render variables include:

- `issue.id`
- `issue.identifier`
- `issue.title`
- `issue.description`
- `issue.state`
- `issue.labels`
- `issue.url`
- `issue.branch_name`
- `repo.default_branch`
- `repo.name`
- `run.id`
- `workspace.path`
- `workspace.branch`

Renderability is part of the contract. The platform treats the following as hard failures:

- missing `.symphony/prompt.md`
- invalid template syntax
- missing referenced variables
- empty rendered output

The platform does not validate prompt quality or repo-specific content correctness beyond that
renderability contract.

## Security Boundary

The prompt template may not reference platform secrets or authentication material directly.

Credential handling remains platform-owned. The agent may use platform-provided tools and mounted
auth, but secret material is not part of the prompt variable surface.

## Consequences

Positive:

- clean separation between repo prompt ownership and platform runtime ownership
- explicit prompt rendering behavior
- strong auditability without repo mutation

Negative:

- repos must maintain a valid template
- render failures become explicit platform refusals
