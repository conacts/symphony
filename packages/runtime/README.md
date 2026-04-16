# @symphony/runtime

High-level Symphony runtime composition package.

## Owns

- The assembled runtime surface exported to callers.
- Top-level runtime composition that binds orchestration, tracker, workspace, and policy layers.

## Does not own

- Low-level harness transport.
- UI or HTTP route composition.
- DB schema ownership.

## Current State

This package should remain a thin assembly boundary. It is useful when callers need a single
runtime entry point, but the deeper behavior should continue to live in the packages that own it.
