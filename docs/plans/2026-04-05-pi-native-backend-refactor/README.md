# Pi-Native Backend Refactor Plan

Date: 2026-04-05

## Goal

Complete the transition from a Codex-era projected analytics model to a Pi-native backend model that
uses Pi events and Pi entities as the primary source of truth.

## Why This Exists

The current system works, but it still carries structural assumptions from the older harness model:

- multiple layers parse raw Pi payloads independently
- canonical event projection still drops or flattens Pi-native fields
- runtime, analytics, and read models duplicate token math and status interpretation
- the database still mixes authoritative runtime ledgers with projection-ledger rollups
- package and module naming still reflects the older journal-era persistence story

This plan breaks the refactor into explicit slices so each cut has a clear acceptance boundary and a
clean distillation path into later ADRs.

## Execution Order

1. Slice 1: Pi source contract and centralized decoder
2. Slice 2: Pi-native persistence for responses, tools, and commands
3. Slice 3: Runtime ledger authority and journal deprecation
4. Slice 4: Run and turn authority cleanup across read models
5. Slice 5: Frontend distillation over the stabilized Pi-native backend

## Commit Policy

- Commit after each completed slice.
- Prefer buildable slices when the cut is reasonably contained.
- Allow temporary `--no-verify` commits only when a slice intentionally crosses package boundaries in
  a way that would otherwise force misleading compatibility code.
- If a `--no-verify` commit is used, the next commit in the sequence must restore a green
  verification path or clearly narrow the broken scope.

## Deprecation Policy

Deprecation is explicitly allowed during these slices.

Rules:

- prefer deprecating old projection helpers once the new Pi-native seam exists
- remove stale compatibility code aggressively when historical-read compatibility can be preserved
  at one boundary instead of many
- keep historical persisted data readable, but do not keep Codex-era naming alive in every active
  layer just for sentimentality
- rename or replace `run journal` terminology as ledger-oriented persistence becomes authoritative

## Deliverables

- one slice plan per backend/frontend step
- one committed implementation per slice
- later ADRs distilled from the accepted decisions in these plans
