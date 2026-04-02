# ADR: Docker-Only Execution

Date: 2026-04-02

## Status

Accepted

## Context

Symphony previously carried multiple execution stories at once:

- local host-path workspaces
- Docker-backed workspaces
- legacy worktree-era and shared-local-resource assumptions in code and docs

That split made the platform harder to reason about, harder to validate, and harder to document.
The product direction is now explicit: Symphony is a single-host control plane for Linear-driven
sub-agent orchestration, and isolated Docker execution is mandatory.

## Decision

Symphony supports only Docker-backed issue execution.

The platform will:

- create and manage isolated Docker-backed issue environments
- treat Docker preflight and setup as mandatory platform-owned behavior
- remove local workspace backends and local/worktree compatibility paths
- remove multi-backend selection from the runtime happy path and public product story

## Consequences

Positive:

- one execution model
- simpler runtime contracts
- simpler documentation
- fewer fallbacks and less ambiguous behavior
- fail-fast semantics become easier to enforce

Negative:

- no compatibility path for repos that only work in a host-local execution model
- Docker availability becomes a hard platform prerequisite

## Non-Goals

This decision does not define:

- migration sequencing for deleting legacy code
- future support for alternative execution models

Those can be reconsidered later, but they are not part of the current product contract.
