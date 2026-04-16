# @symphony/forensics

Read-side runtime forensics and operator analysis over recorded Symphony execution data.

## Owns

- Forensics issue aggregates, filters, and derived success metrics.
- Read-model composition over stored runs, logs, and timelines.

## Does not own

- Lifecycle authority.
- Runtime execution.
- Primary DB write paths.

## Current State

This package should explain what happened after the fact. It can derive useful operator signals,
but it must not become the authority for workflow truth.
