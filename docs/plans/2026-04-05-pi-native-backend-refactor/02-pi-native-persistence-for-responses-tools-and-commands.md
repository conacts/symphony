# Slice 2: Pi-Native Persistence for Responses, Tools, and Commands

Date: 2026-04-05

## Problem Statement

The backend already stores raw Pi payloads, but only a narrow subset of Pi response and tool data
is promoted into typed tables. Valuable fields still live in overflow JSON or are recomputed
loosely from projected events.

## Solution

Expand Pi-native persistence so the database stores stable Pi concepts directly: message-end
metadata, command execution context, edit results, write results, and other tool execution details.

## User Stories

1. As an operator, I want true Pi token totals, so that dashboard cost and usage views are
   trustworthy.
2. As a run investigator, I want response model, provider, stop reason, and timing metadata, so
   that I can explain agent behavior without reading raw logs.
3. As a developer, I want edit and write results stored structurally, so that UI surfaces can show
   diffs, line counts, and write sizes without reparsing text.
4. As a debugging operator, I want command working directory, timeout, outcome, and exit metadata
   when available, so that failed runs are easier to diagnose.

## Implementation Decisions

- Keep raw payload retention as an archival source of truth.
- Add or expand Pi-native persistence tables rather than mining JSON in read models.
- Promote Pi token fields beyond `input + output`, including cache read, cache write, and
  Pi-reported totals.
- Treat command execution and edit/write results as first-class persisted entities.
- Prefer append-only typed tables keyed by run, turn, and item identity.
- Preserve historical-read compatibility at the read boundary rather than carrying compatibility
  parsing logic across every package.

## Testing Decisions

- Good tests assert typed persistence and typed reads from realistic Pi payloads.
- Add store/read tests using captured Pi payload fixtures where possible.
- Verify that persisted token totals match Pi-reported totals rather than derived approximations.
- Verify that edit/write metadata survives round-trip from raw payload to typed row to read model.

## Out of Scope

- issue/run dashboard rendering
- runtime ledger naming changes
- run/turn authority collapse

## Further Notes

- This slice should actively deprecate JSON parsing in DB read paths once typed tables exist.
- Backfill from archived raw payload rows should remain possible after the schema lands.
