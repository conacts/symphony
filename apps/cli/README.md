# CLI App

Compiled CLI surface for local runtime utilities and migration-era command experiments.

## Owns

- The packaged command boundary when the CLI app is intentionally built and invoked.
- CLI-local bootstrap concerns that should not leak into the API or dashboard apps.

## Does not own

- The canonical runtime lifecycle.
- Router decisions or orchestration state.
- Dashboard presentation.

## Current State

The product currently runs through the API service, not through the CLI. This directory still
exists as a separate app boundary, but it is not part of the main intelligent-flow operator path.
