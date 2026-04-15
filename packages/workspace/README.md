# @symphony/workspace

Docker-backed workspace provisioning and metadata package for Symphony execution.

## Owns

- Workspace backend contracts and Docker implementation.
- Materialization, inspection, identity, environment, and path helpers.
- Test-support backends used to verify workspace flows deterministically.

## Does not own

- Agent harness protocol.
- Workflow routing.
- Tracker lifecycle rules.

## Current State

This package owns the sandbox itself, not the agent running inside it. It should make workspace
creation, reuse, and inspection explicit so the runtime can supervise runs without embedding Docker
details everywhere else.
