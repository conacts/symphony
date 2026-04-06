# Slice 5: Frontend Distillation Over the Pi-Native Backend

Date: 2026-04-05

## Problem Statement

The dashboard currently renders only part of the Pi data we can capture, and some UI surfaces still
reflect older assumptions about token totals, tool semantics, and runtime metadata.

## Solution

Do one focused frontend sweep after the backend stabilizes so issue, run, turn, and runtime-health
views consume the new typed Pi-native backend model.

## User Stories

1. As an operator, I want true token breakdowns, so that I can distinguish generated cost from
   cache-heavy runs.
2. As an investigator, I want Pi response metadata on run and turn pages, so that I can understand
   model/provider behavior.
3. As a reviewer, I want edit/write/command cards to use typed backend metadata, so that transcript
   views stop depending on text inference.
4. As a product owner, I want issue-level aggregation to reflect the same Pi-native truths as run
   detail pages.

## Implementation Decisions

- Keep the frontend pass after backend stabilization to avoid repeated contract churn.
- Render cached input and other Pi-native token fields explicitly.
- Promote message-end metadata to run and turn detail surfaces.
- Replace inferred edit/write/command displays with typed backend fields where available.
- Keep UI-level compatibility small and temporary; data normalization belongs in backend contracts
  and view models.

## Testing Decisions

- Good tests assert visible behavior from typed fixtures, not implementation details.
- Add UI tests for token breakdowns, response metadata panels, and structured edit/write/command
  surfaces.
- Verify degraded states and historical-read compatibility through view-model tests.

## Out of Scope

- new navigation redesign
- unrelated dashboard feature expansion

## Further Notes

- Once this slice lands, the earlier plan files should be distilled into ADRs and nearby README
  updates, then removed from `docs/plans`.
