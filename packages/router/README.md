# @symphony/router

Workflow routing engine and intelligent-flow module registry for Symphony.

## Owns

- Generic workflow router primitives and comparison utilities.
- Capability planning, admissibility, execution-candidate selection, and completion gating.
- Intelligent-flow preset definitions and module metadata.

## Does not own

- Agent execution.
- Workspace setup.
- Tracker-side state transitions.

## Current State

This package defines how Symphony chooses the next module for a workflow. The active product path
leans on the intelligent-flow preset, so the module registry and routing contracts should stay easy
to read, easy to test, and explicit about admissibility.
