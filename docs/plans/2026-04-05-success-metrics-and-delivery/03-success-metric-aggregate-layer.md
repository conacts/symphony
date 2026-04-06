# Slice 3: Success Metric Aggregate Layer

## Goal
Create a typed backend aggregate layer for issue-level success metrics so the product can measure delivery outcomes exactly before any dashboard UI work begins.

## Why This Slice Exists
Slices 1 and 2 established the source of truth for delivery:

- typed delivery reports
- runtime emission through the Pi app-server path
- exact validation for completed vs blocked delivery claims

That still leaves the product without a stable metrics surface. Today the dashboard can inspect runs and issues, but it cannot ask direct questions such as:

- how many issues were actually delivered?
- what is the median time to delivery?
- how often do retries or max-turn failures block delivery?

This slice turns the delivery-report authority into a first-class aggregate API.

## Scope

### In scope
- add a success-metrics query and response contract
- add a forensics read-model method that computes success metrics from the existing run summaries
- add a dedicated API route for success metrics
- add tests for metric formulas, contract envelopes, and HTTP wiring

### Out of scope
- UI charts or cards
- cost accounting
- PR URL verification against external providers
- intervention metrics

## Product Decisions Locked In
- success is measured at the issue level
- a delivered issue requires a valid `report_issue_delivery(status="completed")`
- `completed` means PR opened
- `max_turns` counts as failure
- `paused` and `stopped` are neutral
- run-level metrics are diagnostic, not the north-star KPI

## Proposed Backend Surface

### Read-model method
- `forensics.successMetrics(query)`

### API route
- `GET /api/v1/success-metrics`

### Aggregate groups
- executive metrics
- diagnostic metrics
- daily trend rows

## Initial Metrics

### Executive
- started issue count
- delivered issue count
- issue delivery rate
- median tokens per delivered issue
- median time to delivered issue seconds
- delivery retry rate
- max-turn failure rate

### Diagnostic
- started run count
- delivered run count
- blocked issue count
- partial issue count
- missing delivery report failure count
- startup failure rate
- rate-limited run rate
- high-machine-pressure run rate
- median cached-input share for delivered issues

### Daily
- started issue count
- delivered issue count
- started run count
- delivered run count
- max-turn failure count
- startup failure count
- rate-limited run count
- total tokens

## Data Sources
- runtime run summaries from the unified run ledger / forensics read-store boundary
- latest delivery report state already projected onto runs
- machine-load summaries already persisted on runs

## Validation Rules
- aggregate only from persisted typed run data
- do not infer delivery from transcript text
- treat missing denominators as zero-rate, not null-rate
- keep date bucketing deterministic using persisted ISO timestamps

## Risks
- older historical runs may lack some newer typed delivery or machine-load fields
- missing-delivery-report failures are still heuristic until runtime records them explicitly as a distinct failure kind
- costs are intentionally excluded until pricing capture is a typed backend field

## Test Plan
- formula-focused aggregate tests with multiple issues and runs
- contract envelope parse test
- HTTP route test for `/api/v1/success-metrics`

## Exit Criteria
- backend exposes a typed success-metrics surface
- formulas are covered by tests
- route is verified through the API app harness
- no frontend changes are required for the backend slice to be considered complete
