# @symphony/tracker

Tracker abstraction and Linear-backed implementation for Symphony issue lifecycle management.

## Owns

- Canonical tracker issue shape used by the runtime.
- Linear normalization, queries, operations, and config mapping.
- Tracker-side helpers for dispatchable, terminal, and in-scope issue checks.

## Does not own

- Router policy.
- Workspace execution.
- Operator UI presentation.

## Current State

The active implementation is Linear-backed. This package should make tracker state transitions and
issue normalization explicit so the rest of the runtime can reason about one consistent tracker
contract.
