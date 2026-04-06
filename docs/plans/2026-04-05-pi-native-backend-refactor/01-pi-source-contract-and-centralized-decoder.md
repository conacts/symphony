# Slice 1: Pi Source Contract and Centralized Decoder

Date: 2026-04-05

## Problem Statement

Pi is the active harness, but the backend still parses Pi payloads in multiple places using
untyped `Record<string, unknown>` access. That causes drift, repeated token parsing logic, and
lossy interpretation of Pi events before persistence.

## Solution

Introduce a single Pi-native decode boundary that converts raw RPC payloads into typed Pi runtime
events, Pi message parts, and Pi usage snapshots. Use that decoder at the harness boundary and
reuse it in runtime-facing ingestion paths.

## User Stories

1. As a backend developer, I want Pi events decoded once, so that event handling logic stops
   drifting across packages.
2. As an analytics developer, I want typed Pi usage objects, so that token math is consistent.
3. As a runtime developer, I want message, tool, queue, and turn events represented as
   discriminated unions, so that code changes are safer and easier to review.
4. As a future maintainer, I want raw Pi payloads preserved while higher layers use typed data, so
   that we can backfill new tables without reintroducing ad hoc JSON parsing everywhere.

## Implementation Decisions

- Add a Pi decoder module at the harness boundary.
- Model stable Pi runtime events as discriminated unions.
- Represent Pi usage explicitly, including cache read and cache write tokens.
- Keep raw payloads available for downstream storage, but stop treating them as the active
  application contract.
- Update the Pi adapter and RPC client to consume decoded Pi events instead of parsing raw payloads
  inline.
- Reuse the same usage extraction helper in the API runtime path.

## Testing Decisions

- Good tests assert decoded external shapes and downstream behavior, not internal helper structure.
- Test the decoder against representative `message_end`, `queue_update`, and usage payloads.
- Keep adapter tests green with both decoded and raw inputs where compatibility is still needed.
- Keep runtime tests green for raw Pi usage forwarding.

## Out of Scope

- DB schema changes beyond what already landed for `pi_message_ends`
- orchestrator-wide migration to the Pi decoder
- frontend changes

## Further Notes

- This slice should deprecate duplicate Pi parsing in the harness layer first.
- Later slices should push the same source contract deeper into DB ingestion and orchestration.
