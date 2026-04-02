# ADR: Linear Failure State Semantics

Date: 2026-04-02

## Status

Accepted

## Context

Platform-owned failures need to be visible, queryable, and operationally distinct from:

- normal repo-internal test failures
- human review outcomes
- generic blocked work

Without a dedicated failure state, platform setup/refusal errors are mixed into states that imply
very different things.

## Decision

Linear must expose a dedicated `Failed` state for Symphony platform failures.

The platform moves a ticket into `Failed` when Symphony cannot or must not start the run because of
a platform-owned refusal or setup failure.

Examples include:

- Docker preflight failure
- missing or invalid `.symphony/runtime.ts`
- missing or invalid `.symphony/prompt.md`
- prompt render failure
- missing required platform prerequisites such as required platform-owned auth material

The platform also leaves a structured Linear comment describing:

- the failure class
- the failed contract or prerequisite
- whether the failure is retryable
- the exact next operator action

## Non-Platform Failures

Repo-internal application failures are not platform failures.

Examples include:

- repository tests failing
- repository build failing
- repository smoke validation failing

Those outcomes remain part of the repo-owned implementation workflow and do not automatically map
to `Failed`.

## Consequences

Positive:

- platform failures become operationally visible
- failure queues are queryable
- blocked/review semantics remain clean

Negative:

- Linear workflow requires an additional state
- operators must learn the distinction between platform failures and repo failures
