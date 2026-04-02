# Subagent Prompt 03: Legacy Deletion And Docs Cleanup

You are implementing the legacy-deletion and documentation slice for this repository’s replacement
cut.

You are not alone in the codebase. Other workers may be editing nearby areas. Do not revert their
changes. Adjust to them.

## Objective

Remove stale architectural stories from the repository and make the documentation tell one story:

- Docker-only execution
- `.symphony/runtime.ts` + `.symphony/prompt.md` contract
- no local/worktree orchestration contract
- no Elixir/oracle framing

## Ownership

You own:

- `docs/**`
- `symphony/**`

You may delete legacy files within your owned surface when they are clearly outside the new product
shape.

Avoid touching `apps/api`, `packages/core`, root build scripts, or package configuration except for
doc references that must stay coherent.

## Expected Outcomes

- outdated local/worktree documentation is removed or rewritten
- parity/oracle/evaluation-era framing is removed from active docs
- Elixir artifacts are deleted in this cut if they are no longer needed for any active repository
  purpose, or isolated as immediate follow-up deletion if a narrow blocker remains
- docs align with the ADRs and the repo integration handoff

## Constraints

- do not preserve documentation for unsupported platform paths “just in case”
- do not leave contradictory architecture notes in place
- keep the docs terse and decisive

## Acceptance Criteria

- docs no longer describe local/worktree orchestration as a supported story
- docs no longer treat Elixir as the active oracle/comparison model
- docs point at the repo contract and Docker-only direction consistently
- legacy files in `symphony/elixir` are either removed or reduced to a clearly temporary boundary
  with explicit justification

## Notes

- The user explicitly does not want timeless ADRs polluted with transient cleanup details.
- Keep ADRs durable; move cleanup specifics into architecture docs or removal commits instead.

## Validation

Run only the validation relevant to your slice:

- link/reference sanity via targeted search
- any doc-specific checks already available in the repo
