# Slice 1: Delivery Reporting Backend Foundation

Date: 2026-04-05

## Problem Statement

Symphony currently has no canonical typed record for delivery outcomes. That means issue
completion, PR creation, and blocked/partial outcomes would need to be inferred from transcript
text, git state, or external comments. Those signals are noisy and hard to validate.

## Solution

Add a first-class delivery reporting persistence layer that stores append-only issue delivery
reports and projects the latest effective delivery state into the backend read models used by
forensics and the dashboard.

## User Stories

1. As a product owner, I want issue completion to be measured exactly, so that success metrics are
   not distorted by transcript guesswork.
2. As a backend developer, I want delivery reports stored in a dedicated typed table, so that
   future metric and UI work reads structured data rather than parsing logs.
3. As an analytics developer, I want issue and run summaries to include delivery status and PR URL,
   so that success can be rolled up cleanly from runs into issues.
4. As a future maintainer, I want this slice to land before live tool wiring, so that the
   transport/tool integration can target a clean persistence API instead of inventing one later.

## Implementation Decisions

- Add a new `symphony_issue_delivery_reports` table as an append-only ledger.
- Create a dedicated DB store for recording and reading delivery reports.
- Project the latest delivery report per run into run summaries.
- Derive issue-level delivery state from the latest effective report across runs for that issue.
- Record delivery report events into the issue timeline for operator visibility.
- Keep this slice transport-agnostic: the live Pi tool integration is explicitly out of scope here.

## Testing Decisions

- Add DB store tests for recording delivery reports and reading latest-per-run/latest-per-issue
  behavior.
- Extend forensics contract tests for new delivery fields.
- Extend read-model tests so issue/run summaries prove delivery status and PR URL propagation.
- Keep tests focused on behavior and effective-state projection rather than internal query shapes.

## Out of Scope

- the live `report_issue_delivery` Pi tool
- runtime enforcement that a run cannot claim completion without a delivery report
- frontend/dashboard presentation work
- cost modeling and daily success charts

## Further Notes

- This slice should create the canonical backend seam that later runtime tooling writes into.
- PR URL validation should be kept lightweight here; stronger transport/runtime validation can land
  when the actual tool is wired.
