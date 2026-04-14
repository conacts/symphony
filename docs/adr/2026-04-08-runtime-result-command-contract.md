# ADR: Runtime Result Command Contract

Date: 2026-04-08

## Status

Accepted, but superseded in part for intelligent-flow on 2026-04-14

## Context

Symphony requires an explicit result boundary for every run, but that boundary had been described in
too many places:

- planning docs
- lifecycle specs
- prompt prose
- transport-specific implementation notes

That drift made it easy for docs to describe obsolete tools or incomplete command sets.

The later intelligent-flow cleanup changed one important thing:

- structured terminal module results are now the authoritative completion boundary for the active intelligent-flow path

This ADR therefore remains historical guidance for legacy or manual runtime-tool surfaces, not the
primary completion contract for intelligent-flow.

## Decision

Historically, Symphony's agent-facing result surface was the `symphony tool` CLI namespace.

For the active intelligent-flow path, that is no longer the primary completion boundary.

The durable completion contract for intelligent-flow is:

- the run emits a structured terminal module result
- the host derives routed lifecycle signals from that result
- workflow progression settles through routed signal and command history

Historically, the durable CLI command contract was:

- `symphony tool finish` for implementation and rework runs
- `symphony tool merge-result` for approved merge runs
- `symphony tool spike-result` for investigation-style outcomes that should leave findings and pause the issue
- `symphony tool cancel` for explicit issue cancellation with a required reason

Result semantics are defined by the shared implementation in `@symphony/runtime-tools`.

The CLI and the internal runtime-tools API are transport wrappers around that shared package. The
command contract is therefore shared even when the harness proxies through the control-plane API.

Historical implementation/rework completion rules:

- `finish --status completed` records delivery and moves the issue to `In Review`
- `finish --status blocked` records the stop reason and does not auto-transition to `In Review`
- `finish --status partial` records incomplete delivery and is treated as a non-success outcome

Historical approved-merge completion rules:

- `merge-result --status merged` records the merge result and lets orchestration complete the issue into `Done`
- `merge-result --status blocked` records the blocked merge result and moves the issue to `Blocked`

## Consequences

Positive:

- the historical CLI contract is documented explicitly
- legacy/manual result tooling still has one place to point at

Negative:

- older docs that cite this ADR without the intelligent-flow supersession note will be misleading
- legacy/manual result tooling still requires maintenance until it is fully removed
