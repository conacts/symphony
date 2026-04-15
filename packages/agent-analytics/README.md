# @symphony/agent-analytics

Typed analytics event catalog and helpers for Symphony agent execution.

## Owns

- Canonical analytics event names and payload shapes.
- Shared analytics typing used by runtime storage and read-side analysis.

## Does not own

- DB persistence.
- Forensics aggregation.
- Router or orchestrator state transitions.

## Current State

This package stays intentionally small. It should define analytics vocabulary cleanly and let the
DB, read models, and operator surfaces consume that vocabulary without inventing competing shapes.
