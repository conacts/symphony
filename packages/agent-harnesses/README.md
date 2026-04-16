# @symphony/agent-harnesses

Execution harness package for running Pi inside Symphony-managed workspaces.

## Owns

- Pi runtime definition and launch settings.
- SDK runner process contracts, process spawning, and result transport.
- Shared session and protocol types used at the harness boundary.

## Does not own

- Workflow routing policy.
- Orchestrator lifecycle authority.
- Workspace provisioning itself.

## Current State

This package is the execution boundary for the active Pi-only runtime path. It should expose a
small, typed surface for starting a run, streaming updates, and returning a terminal outcome
without carrying product workflow logic.
