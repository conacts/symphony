# ADR: Contract Snapshot Semantics

Date: 2026-04-02

## Status

Accepted

## Context

Symphony allows the agent to work with full power inside the isolated issue environment. That means
the agent may edit contract files such as `.symphony/runtime.ts` and `.symphony/prompt.md`.

If those edits change the currently running session's behavior mid-run, the platform becomes
non-deterministic and harder to reason about.

## Decision

Contract files are snapshotted at dispatch.

The current run uses the snapshot captured when the run starts.

The relevant contract files are:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

Edits made by the agent during a run:

- are allowed as normal repo changes
- do not affect the current run
- take effect only on a later run

## Consequences

Positive:

- deterministic run behavior
- no mid-run contract drift
- agents can still evolve the repo contract as code

Negative:

- operators and agents must understand that contract edits are forward-looking, not live updates

## Notes

This decision applies to contract evaluation and prompt rendering behavior. It does not limit the
agent's ability to edit those files in the repository for future sessions.
