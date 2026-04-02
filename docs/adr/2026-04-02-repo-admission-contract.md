# ADR: Repo Admission Contract

Date: 2026-04-02

## Status

Accepted

## Context

Symphony is not a best-effort automation layer. It is a strict orchestration platform that should
accept only repositories that conform to an explicit contract.

Without a formal admission contract, failures are discovered too late:

- at dispatch time
- during workspace setup
- on real Linear tickets

That creates noisy operations and weakens the platform's fail-fast posture.

## Decision

A repository is admitted only if it satisfies the Symphony repo contract.

The minimum contract is:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`
- valid lifecycle definitions for bootstrap, migrate, and verify
- a renderable prompt template

Admission validation is a first-class platform capability.

The platform must validate a repository in two places:

1. before the repository is admitted for active orchestration
2. again at runtime before dispatch

The pre-admission check exists to catch contract failures before real tickets are consumed. The
runtime check exists to catch drift, missing host prerequisites, and other setup failures on the
current host.

## Decision Details

Repositories that fail the contract are rejected explicitly.

The platform will not:

- infer missing files from conventions
- silently fall back to alternate repo shapes
- continue with partial or degraded contract support

Unsupported means unsupported.

## Consequences

Positive:

- clear onboarding boundary
- fewer late-discovered setup failures
- simpler operator expectations
- stronger fail-fast behavior

Negative:

- repo integration requires up-front work
- onboarding becomes more rigid by design

## Notes

Repo-internal code quality and application correctness are still owned by the repository. Symphony
validates contract compliance and platform setup, not whether the repo's own application logic is
good.
