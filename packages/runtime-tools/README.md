# @symphony/runtime-tools

`@symphony/runtime-tools` owns the shared execution semantics for Symphony's explicit run-result
commands.

The CLI in `apps/cli` and the internal runtime-tools API both delegate to this package so result
behavior stays consistent across transports.

## Owns

- delivery report execution for implementation and rework runs
- merge-result execution for approved merge runs
- spike-result execution for investigation-style outcomes
- cancel execution for explicit issue cancellation
- shared argument normalization
- shared JSON result/error payloads
- issue-state transition behavior tied to those commands

## Command Contract

These are the live command semantics reflected by this package:

- `symphony tool finish`
- `symphony tool merge-result`
- `symphony tool spike-result`
- `symphony tool cancel`

The CLI flags live in `apps/cli`, but the normalized payload rules and behavioral outcomes live here.

## Current Behaviors

`finish`

- requires an active persisted run
- accepts `completed`, `blocked`, or `partial`
- records the delivery report
- moves the issue to `In Review` only when status is `completed`

`merge-result`

- requires an active persisted run
- accepts `merged` or `blocked`
- records the merge outcome on the issue timeline
- leaves merge-state transitions to orchestration after the result is recorded

`spike-result`

- requires a summary plus detailed findings
- posts a structured Linear comment
- moves the issue to the provided target state or the configured default pause state

`cancel`

- requires a reason
- posts a cancellation comment
- moves the issue to the provided target state or the default canceled state

## Source Of Truth

- implementation: [`src/index.ts`](src/index.ts)
- CLI wrappers: [`../../apps/cli/src/commands/tool`](../../apps/cli/src/commands/tool)
- durable decision record: [`../../docs/adr/2026-04-08-runtime-result-command-contract.md`](../../docs/adr/2026-04-08-runtime-result-command-contract.md)
