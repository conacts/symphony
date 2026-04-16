# @symphony/runtime-run-ledger

File-backed runtime run ledger used for exported run narratives and deterministic fixtures.

## Owns

- File-backed run and turn ledger persistence.
- Ledger record types and export helpers.
- Fixture builders for tests that need recorded runtime narratives.

## Does not own

- Canonical control-plane state.
- DB-backed read models.
- Live runtime orchestration.

## Current State

This package is useful for durable run artifacts and test fixtures. It should complement the main
DB-backed runtime truth, not compete with it.
