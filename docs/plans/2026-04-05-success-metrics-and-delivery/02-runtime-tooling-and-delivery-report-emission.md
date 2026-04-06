# Slice 2: Runtime Tooling and Delivery Report Emission

Date: 2026-04-05

## Goal

Make delivery reporting an explicit runtime action rather than a passive backend concept by
exposing a first-class `report_issue_delivery` tool on the active Pi runtime transport and
recording its typed output against the active run.

## Problem

Slice 1 created a canonical persistence model for delivery reports, but the live Pi runtime still
cannot emit those reports in a typed, measurable way during execution. Without a runtime tool, the
system still has to infer delivery success from logs, tracker state, or PR side effects.

## Scope

- expose `report_issue_delivery` as a dynamic Pi app-server tool
- wire the API runtime to execute that tool against the new delivery-report store
- treat a successful delivery report as the explicit end-of-run delivery boundary
- update the runtime prompt guidance so the agent knows the tool is required

## Non-Goals

- executive/diagnostic metric aggregates
- frontend delivery metric UI
- GitHub PR validation or Linear comment mirroring

## Deliverables

- Pi dynamic tool schema for `report_issue_delivery`
- API-side dynamic tool executor for delivery reports and existing Linear GraphQL access
- runtime transport selection that can use the Pi app-server path when configured
- prompt guidance that makes `report_issue_delivery` the required completion boundary

## Validation

- app-server start requests advertise the delivery-report tool
- delivery tool calls persist typed rows in `symphony_issue_delivery_reports`
- successful `completed` delivery reports produce normal runtime completion
- runs that end without an explicit delivery report do not silently count as normal success
