# ADR: Runtime Result Command Contract

Date: 2026-04-08

## Status

Accepted

## Context

Symphony requires an explicit result boundary for every run, but that boundary had been described in
too many places:

- planning docs
- lifecycle specs
- prompt prose
- transport-specific implementation notes

That drift made it easy for docs to describe obsolete tools or incomplete command sets.

## Decision

Symphony's agent-facing result surface is the `symphony tool` CLI namespace.

The durable command contract is:

- `symphony tool finish` for implementation and rework runs
- `symphony tool merge-result` for approved merge runs
- `symphony tool spike-result` for investigation-style outcomes that should leave findings and pause the issue
- `symphony tool cancel` for explicit issue cancellation with a required reason

Result semantics are defined by the shared implementation in `@symphony/runtime-tools`.

The CLI and the internal runtime-tools API are transport wrappers around that shared package. The
command contract is therefore shared even when the harness proxies through the control-plane API.

Implementation/rework completion rules:

- `finish --status completed` records delivery and moves the issue to `In Review`
- `finish --status blocked` records the stop reason and does not auto-transition to `In Review`
- `finish --status partial` records incomplete delivery and is treated as a non-success outcome

Approved merge completion rules:

- `merge-result --status merged` records the merge result and lets orchestration complete the issue into `Done`
- `merge-result --status blocked` records the blocked merge result and moves the issue to `Blocked`

## Consequences

Positive:

- one stable shell-facing result surface
- prompt guidance, runtime enforcement, and analytics can all point at the same commands
- shared behavior lives in code instead of in transport-specific prose

Negative:

- CLI packaging and invocation must stay reliable because prompt guidance depends on it
- adding or changing result commands now requires updating prompt guidance, ADRs, and command tests together
