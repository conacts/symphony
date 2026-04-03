# Symphony Public API

Date: 2026-04-02

## Goal

Freeze the supported public surface around the new contract-first runtime shape.

The supported story is:

- repo contract authored through `@symphony/runtime-contract`
- Docker-backed workspace execution
- one composition path through the TypeScript runtime

## Contract Boundary

Repo authors should consume `@symphony/runtime-contract` for the admitted repo surface.

That package owns:

- `defineSymphonyRuntime`
- `loadSymphonyRuntimeManifest`
- `loadSymphonyPromptContract`
- `validateSymphonyPromptContract`
- runtime-doctor helpers

The required repo artifacts are:

- `.symphony/runtime.ts`
- `.symphony/prompt.md`

## Runtime Composition Boundary

Runtime composition lives in `@symphony/runtime` and the app boundary, and the supported workspace
execution story is Docker-backed only.

The important runtime concepts remain:

- `WorkspaceBackend`
- `PreparedWorkspace`
- `WorkspaceLifecycleMetadata`
- `AgentRuntime`
- `SymphonyRuntime`

The supported composition path uses:

- `createDockerWorkspaceBackend(...)`
- `createCodexAgentRuntime(...)`
- `createSymphonyRuntime(...)`

The public API should not advertise a parallel supported local-backend path.

## Execution Contract

The prepared execution target is a container. Downstream consumers should reason in terms of:

- container execution target
- deterministic workspace identity
- declared env/service contract
- explicit lifecycle metadata

Consumers should not build new product behavior around host-path compatibility assumptions.

## Observability Contract

Public read models should explain:

- which issue was running
- which contract revision was loaded
- whether the workspace/container was created or reused
- which service dependencies were attached
- why a run failed, blocked, or was refused

The public surface is successful when downstream code can understand orchestration outcomes without
needing to know internal module layout.
