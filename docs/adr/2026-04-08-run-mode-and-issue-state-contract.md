# ADR: Run Mode And Issue State Contract

Date: 2026-04-08

## Status

Accepted

## Context

Run-mode semantics and Linear state ownership had been spread across multiple long-form docs. Those
docs drifted from the orchestrator and prompt code, especially around merge runs and explicit
completion behavior.

## Decision

Symphony uses the following issue-state contract.

Dispatch and active states:

- `Todo`
- `Bootstrapping`
- `In Progress`
- `Rework`
- `Approved`

Non-dispatch states:

- `Backlog`
- `In Review`
- `Blocked`
- `Paused`
- `Failed`

Terminal states:

- `Done`
- `Canceled`

Run-mode derivation is explicit:

- `Rework` maps to the `rework` run mode
- `Approved` maps to the `approved_merge` run mode
- all other active execution states use the default implementation run mode

State ownership is explicit:

- `Bootstrapping` is runtime-owned prepare/rehydrate work before normal implementation
- `Paused` is a platform/provider-owned interruption
- `Failed` is a platform-owned refusal or setup failure before the run becomes a normal work session
- `Blocked` is a repo/agent-owned stop, including blocked merge outcomes
- `In Review` is the successful delivery boundary for implementation and rework runs
- `Done` and `Canceled` are terminal teardown states

Rework semantics are explicit:

- review feedback moves the issue into `Rework`
- `Rework` creates a new run, not another turn inside the old run
- Symphony may reuse the preserved workspace when that workspace is still valid

Approved merge semantics are explicit:

- `Approved` is merge-only execution, not general implementation
- merge runs enter `In Progress` while merge automation is active
- a successful merge run finishes in `Done`
- blocked or failed merge automation finishes in `Blocked`

This ADR builds on [`2026-04-02-linear-failure-state-semantics.md`](2026-04-02-linear-failure-state-semantics.md) for the specific meaning of `Failed`.

## Consequences

Positive:

- prompts, orchestrator behavior, and operator expectations share one workflow model
- merge automation and implementation runs are no longer documented as the same lifecycle
- state ownership is clearer for humans and forensics

Negative:

- the workflow is intentionally strict and requires users to learn the difference between `Paused`, `Failed`, and `Blocked`
- merge automation now has a visibly distinct path that must stay aligned with prompt and tracker behavior
