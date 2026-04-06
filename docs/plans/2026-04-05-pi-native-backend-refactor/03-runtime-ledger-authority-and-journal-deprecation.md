# Slice 3: Runtime Ledger Authority and Journal Deprecation

Date: 2026-04-05

## Problem Statement

The backend still carries a split identity between runtime ledger data and analytics projection
data, and some packages still use `journal` naming that reflects an older JSON-file implementation
rather than the current DB-backed runtime ledger.

## Solution

Clarify the authoritative runtime ledger, rename stale journal-era modules, and reduce duplicated
authority across runtime and analytics rollups.

## User Stories

1. As a backend developer, I want one clear authoritative runtime ledger, so that status and token
   ownership are not spread across multiple tables and packages.
2. As a maintainer, I want DB-backed runtime modules named after what they actually are, so that
   the codebase is easier to navigate.
3. As a reviewer, I want compatibility kept to one boundary, so that refactors do not drag old
   terms and assumptions through unrelated modules.

## Implementation Decisions

- Decide which runtime table owns run identity, lifecycle status, timestamps, and aggregate usage.
- Treat analytics detail tables as detail surfaces, not competing run ledgers.
- Rename `run journal` modules and packages toward `runtime run ledger` or `runtime run store`
  terminology.
- Keep compatibility shims temporarily only where package migration order requires them.
- Deprecate stale journal naming and remove it once package imports have moved.

## Testing Decisions

- Good tests assert authoritative lifecycle behavior and package contracts, not naming trivia.
- Add migration-safe tests for renamed runtime ledger modules and exports.
- Keep runtime finalization and readback tests green as authority shifts.

## Out of Scope

- frontend updates
- final issue/run page behavior changes
- broad dashboard redesign

## Further Notes

- This slice may justify a focused `--no-verify` commit if package rename churn crosses too many
  imports at once, but the follow-up integration commit must restore green verification quickly.
