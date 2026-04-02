# Subagent Prompt 04: Build Gates And Dashboard Sidelining

You are implementing the build/script/gating cleanup slice for this repository’s replacement cut.

You are not alone in the codebase. Other workers may be editing nearby areas. Do not revert their
changes. Adjust to them.

## Objective

Remove non-critical-path surfaces from default repository build/dev/verify flows so the platform
core can harden independently.

This includes:

- sidelining dashboard participation from default scripts/gates
- removing or deprecating legacy script names that encode the old contract
- tightening root task wiring to the new platform story

## Ownership

You own:

- `package.json`
- `turbo.json`
- `apps/web/package.json`

You may make minimal supporting edits to nearby config if required to keep scripts coherent, but do
not change runtime code or documentation beyond small references that must stay accurate.

## Expected Outcomes

- default root build/dev/verify no longer assume the dashboard is part of the critical path
- surviving convenience scripts are clearly non-contract
- global task wiring no longer depends on `WORKFLOW.md` as a required orchestration artifact

## Constraints

- do not broaden this slice into dashboard feature work
- do not introduce new fallback scripts that preserve the old contract by accident
- keep the new script surface small and explicit

## Acceptance Criteria

- root scripts reflect the Docker-only, contract-first platform direction
- the dashboard is no longer part of default critical-path scripts unless there is a strong,
  documented reason
- `turbo.json` global dependencies and pass-through env stop blessing old contract artifacts where
  possible
- any retained convenience script is clearly non-contract

## Notes

- The user explicitly wants the dashboard on the sideline until the core platform work is complete.
- This slice is about gating and maintenance burden, not deleting the entire web app unless that is
  necessary to keep the repo coherent.

## Validation

Run targeted validation for script/config integrity only:

- root script smoke checks where feasible
- affected package script checks
