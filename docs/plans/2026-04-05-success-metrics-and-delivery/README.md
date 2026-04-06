# Success Metrics and Delivery Reporting Plan

Date: 2026-04-05

## Goal

Define and implement exact, issue-level success measurement for Symphony using explicit delivery
reporting instead of loose inference from logs, comments, or git state.

## Why This Exists

We now have a clearer understanding of what Symphony should optimize for:

- successful issue completion at acceptable cost
- delivery success measured at the issue level, not the run level
- explicit PR creation as the completion boundary

The current backend does not have a canonical typed record for delivery outcomes. That makes it too
easy to infer success from noisy signals and too hard to compute reliable executive metrics.

## Execution Order

1. Slice 1: Delivery reporting backend foundation
2. Slice 2: Pi/runtime transport wiring for explicit delivery reporting
3. Slice 3: Success metric aggregate layer
4. Slice 4: Frontend success metrics and time-bounded charts

## Commit Policy

- Commit after each completed slice.
- Prefer buildable slices.
- Avoid `--no-verify` unless a package boundary cut would otherwise force misleading compatibility
  code.
- If a non-green commit is ever required, restore verification in the next slice immediately.

## Deliverables

- a typed delivery-report persistence model
- explicit issue/run delivery projections in backend read models
- later runtime tool enforcement for `report_issue_delivery`
- executive and diagnostic success metrics built on the new delivery authority
