# @symphony/db

SQLite-backed persistence layer for Symphony control-plane state and read models.

## Owns

- Schema, migrations, and DB initialization.
- Canonical stores for issues, workflows, runtime runs, logs, analytics, and bindings.
- Snapshot and file-backed DB utilities used by the runtime.

## Does not own

- Tracker-side normalization.
- Router decision logic.
- Dashboard presentation.

## Current State

This package is the control-plane storage authority. It should keep write-time contracts strong and
make read-side consumers pull from explicit stores instead of repairing malformed state later.
