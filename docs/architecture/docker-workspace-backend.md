# Docker Workspace Backend

Date: 2026-04-02

## Goal

Define the only supported workspace backend for Symphony.

Docker is no longer an opt-in experiment. It is the execution contract.

## Core Rules

- Docker is mandatory
- one issue maps to one deterministic workspace identity
- one issue may have at most one active container-backed run
- repo contract drives env, lifecycle, and service needs
- backend setup fails closed before agent dispatch when prerequisites are missing

## Prepare Flow

`prepareWorkspace()` is responsible for:

1. deriving the deterministic workspace identity for the Linear issue
2. materializing the workspace according to the configured Docker materialization mode
3. creating declared service sidecars when the repo contract requires them
4. resolving the injected runtime env bundle from:
   - declared host env
   - runtime bindings
   - service bindings
5. validating the selected image and shell before launch
6. starting or reusing the managed workspace container when reuse is still valid
7. executing declared lifecycle inside the container:
   - `bootstrap`
   - `migrate`
   - `verify`

First-cut service support should stay minimal. Postgres is the expected initial service when a repo
actually needs database access.

## Reuse And Invalidation

One long-lived container per issue is acceptable only with explicit invalidation.

The container must be recreated when any of these change:

- runner image
- runtime contract hash
- mounted auth contract
- declared service contract
- explicit operator reset
- corrupted or missing managed container state

If reuse cannot be justified deterministically, fail closed and recreate instead of guessing.

## Env And Auth

The backend injects runtime inputs through process env and mounted auth material.

It does not:

- write required secret-bearing repo files by default
- ask the repo to fetch platform-owned secrets
- depend on repo-local dotenv fallback on orchestration paths

Declared repo services and env bindings are the source of truth.

## Execution Target

The prepared execution target is a container.

Codex launches through `docker exec` against the prepared workspace path inside the container. The
runtime does not preserve a parallel host-path execution story.

## Cleanup

Cleanup is deterministic and issue-scoped.

Cleanup should remove:

- the managed workspace container
- managed service sidecars
- managed workspace network
- managed workspace materialization when appropriate

Cleanup is triggered when:

- the issue reaches `Done`
- the issue reaches `Canceled`
- an explicit operator reset demands recreation
- setup fails after partial container/service creation

Terminal-state cleanup is final. Symphony should not respawn a fresh issue container after a
terminal transition.

## Failure Semantics

Backend preflight and setup failures are platform-owned failures.

Examples:

- Docker daemon unavailable
- workspace image missing
- shell missing in image
- invalid runtime contract
- missing prompt contract
- unresolved required env

Those failures move the issue to `Failed` with a structured Linear comment before any normal agent
session begins.
