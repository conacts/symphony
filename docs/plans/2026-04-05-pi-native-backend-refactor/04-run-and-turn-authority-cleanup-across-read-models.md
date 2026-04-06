# Slice 4: Run and Turn Authority Cleanup Across Read Models

Date: 2026-04-05

## Problem Statement

Run and turn totals, statuses, and metrics are still computed in overlapping ways across runtime,
analytics, forensics, and read models. That makes token truth, failure semantics, and derived
issue-level metrics harder to trust.

## Solution

Cleanly separate authoritative runtime facts from derived analytics facts, then simplify read models
to derive issue, run, and turn summaries from the authoritative sources.

## User Stories

1. As an operator, I want run and turn totals to agree across all backend surfaces, so that the
   dashboard does not show conflicting data.
2. As a backend developer, I want one place to define token and status semantics, so that new
   metrics do not require fixing four packages.
3. As a future ADR author, I want clear authority boundaries, so that durable architecture
   decisions are easy to document.

## Implementation Decisions

- Normalize token math into shared utilities or shared typed objects.
- Remove duplicate rollup fields where they can be derived reliably from authoritative rows.
- Keep issue-level aggregation a derived read-model concern, not a new write-time authority.
- Reduce read-store dependence on projection-loss recovery logic once Pi-native typed tables exist.
- Deprecate redundant compatibility surfaces after the simplified read path is stable.

## Testing Decisions

- Good tests assert cross-surface agreement for run, turn, and issue totals.
- Add regression tests for cached-token inclusion, failure status derivation, and historical-read
  compatibility.
- Verify that run and issue aggregates match the same authoritative underlying data.

## Out of Scope

- frontend rendering changes
- broader runtime-health UX work

## Further Notes

- This slice is where upstream data consumers should start to become noticeably simpler.
