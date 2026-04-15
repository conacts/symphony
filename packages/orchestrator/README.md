# @symphony/orchestrator

Core orchestration package for dispatching, supervising, and completing Symphony agent work.

## Owns

- Agent runtime abstraction used by the higher-level Symphony runtime.
- Worker session lifecycle contracts and dispatch coordination.
- Orchestrator-side monitoring, retries, failures, and run-state transitions.

## Does not own

- Tracker API integration details.
- Router module selection policy.
- Dashboard or transport contracts.

## Current State

This package coordinates work across the runtime boundary. It should keep dispatch and supervision
explicit, shallow, and strongly typed so the surrounding apps can compose it without inheriting
extra policy.
