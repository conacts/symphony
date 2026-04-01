# Symphony Public API

Date: 2026-04-01

## Goal

Freeze a minimal, opinionated public API for Symphony without changing current runtime behavior.

This is a shape decision, not a runtime rewrite. The root surface is intentionally small and
prefers stable facade types over local implementation details.

## Front Door

```ts
import {
  createLocalWorkspaceBackend,
  createCodexAgentRuntime,
  createGitHubReviewPublisher,
  createSymphonyRuntime,
  type PreparedWorkspace,
  type WorkspaceBackend,
  type WorkspaceBackendKind,
  type WorkspaceCleanupInput,
  type WorkspaceContext,
  type WorkspaceExecutionTarget,
  type WorkspaceHookInput,
  type WorkspaceMaterializationMetadata,
  type WorkspacePrepareInput,
  type AgentRuntime,
  type ReviewProvider,
  type ReviewPublisher,
  type SymphonyRuntime
} from "@symphony/core";
```

## Frozen Concepts

- `WorkspaceBackend`
  Stable issue-workspace port. This is now a real lifecycle contract with explicit prepare,
  hook, and cleanup operations.
- `WorkspaceBackendKind`, `WorkspaceExecutionTarget`, `WorkspaceMaterializationMetadata`
  Stable execution-model DTOs that describe where the prepared workspace will execute and how the
  workspace is materialized.
- `WorkspacePrepareInput`, `PreparedWorkspace`, `WorkspaceHookInput`,
  `WorkspaceCleanupInput`, `WorkspaceContext`
  Stable workspace-lifecycle DTOs that make the seam concrete for both callers and future
  backend implementations. `PreparedWorkspace.path` remains only as a compatibility alias for
  local host-path workspaces; `executionTarget` is the intended contract.
- `AgentRuntime`
  Stable agent-execution port with explicit lifecycle methods:
  `startRun(input: AgentRunInput): Promise<AgentRunLaunch>` and
  `stopRun(input: AgentStopInput): Promise<void>`.
- `AgentRunInput`, `AgentRunLaunch`, `AgentStopInput`
  Stable runtime DTOs that make agent launch and shutdown behavior explicit without exposing
  orchestration internals.
- `ReviewProvider`
  Optional adapter that turns provider-specific review input into a normalized runtime review via
  `review(request)`.
- `ReviewRequest`, `ReviewFinding`, `ReviewResult`
  Stable review DTOs for normalized review generation. `ReviewResult` is the canonical
  runtime-level review shape and is made up of typed `ReviewFinding` entries. Public review
  contracts may extend this shape, but they must still carry normalized findings.
- `ReviewPublisher`
  Stable port for publishing a normalized review result to an external destination via
  `publishReview(input)`.
- `PublishReviewInput`, `PublishReviewResult`
  Stable publication DTO names for the outbound review seam.
- `SymphonyRuntime`
  Composition root for tracker + workspace backend + agent runtime + optional review plumbing.
  Today it is an additive wrapper around `SymphonyOrchestrator`, but it does not expose the
  orchestrator instance on the public surface.

## Opinionated Factories

- `createLocalWorkspaceBackend()`
  Public factory for the default local filesystem-backed workspace implementation. It adapts the
  existing local workspace manager into the `WorkspaceBackend` contract rather than re-exporting
  the manager shape directly.
- `createCodexAgentRuntime(runtime)`
  Public adapter for the concrete Codex runtime implementation. The concrete implementation still
  lives in `apps/api/src/core/codex-agent-runtime.ts`, but callers now depend on the real
  `AgentRuntime` contract rather than an orchestration type alias.
- `createGitHubReviewPublisher()`
  Public adapter for outbound review publication. It standardizes the `ReviewPublisher`
  contract but does not wrap the current webhook ingress or requeue processor.
- `createSymphonyRuntime()`
  Additive composition helper that returns a stable runtime object and delegates orchestration to
  `SymphonyOrchestrator` internally.

## Current Mapping

- `WorkspaceBackend` -> explicit lifecycle interface:
  `prepareWorkspace`, `runBeforeRun`, `runAfterRun`, `cleanupWorkspace`
- `createLocalWorkspaceBackend` -> adapter over `createLocalSymphonyWorkspaceManager`
- `PreparedWorkspace` -> stable workspace DTO returned from
  `WorkspaceBackend.prepareWorkspace()` with explicit `backendKind`, `executionTarget`, and
  `materialization`
- `AgentRuntime` -> explicit lifecycle interface:
  `startRun`, `stopRun`
- `createCodexAgentRuntime` -> adapter over the concrete Codex runtime implementation
- `ReviewProvider` -> explicit review-generation interface:
  `review`
- `ReviewPublisher` -> explicit review-publication interface:
  `publishReview`
- `ReviewResult` is the normalized review base shape for both provider output and publisher input
- `createSymphonyRuntime` -> `new SymphonyOrchestrator(...)`

The Codex runtime and GitHub review publisher are the intentional exceptions. Their concrete
implementations are not moved in this change.

The current GitHub webhook ingress and Linear requeue path remain internal. If they are extracted
later, they belong behind an inbound adapter/provider seam, not behind `ReviewPublisher`.

The local filesystem workspace manager still exists as the implementation behind the adapter, but
it is no longer the root happy-path API for consumers of `@symphony/core`. Expert consumers can
reach it explicitly through `@symphony/core/workspace/local`.

## Non-Goals

- No runtime behavior changes
- No movement of the current Codex runtime implementation into `@symphony/core`
- No movement of the current GitHub webhook ingress implementation into `ReviewPublisher`
- No change to `apps/api/src/core/runtime-services.ts`
- No exposure of `SymphonyOrchestrator` on the public runtime facade

## Runtime Wiring Rules

- `publishReview()` requires a configured `ReviewPublisher` and throws on misconfiguration.
- `runReview()` requires both a configured `ReviewProvider` and `ReviewPublisher` and throws on
  misconfiguration.
- `runReview()` may still return `null` when the configured provider intentionally yields no
  review for the supplied request.
- `ingestReview()` remains a compatibility alias for `runReview()`, but `runReview()` is the
  intended public runtime method.

## Root Vs Subpaths Later

Keep at root:

- `WorkspaceBackend`, `WorkspaceBackendKind`, `WorkspaceExecutionTarget`,
  `WorkspaceMaterializationMetadata`, `WorkspacePrepareInput`, `PreparedWorkspace`,
  `WorkspaceHookInput`, `WorkspaceCleanupInput`, `WorkspaceContext`
- `AgentRuntime`, `AgentRunInput`, `AgentRunLaunch`, `AgentStopInput`
- `ReviewProvider`, `ReviewRequest`, `ReviewFinding`, `ReviewResult`
- `ReviewPublisher`, `PublishReviewInput`, `PublishReviewResult`, `SymphonyRuntime`
- `createLocalWorkspaceBackend`, `createCodexAgentRuntime`, `createGitHubReviewPublisher`,
  `createSymphonyRuntime`
- workflow-loading entry points needed to stand up a runtime:
  `loadSymphonyWorkflow`, `parseSymphonyWorkflow`, `defaultSymphonyWorkflowPath`,
  `defaultSymphonyPromptTemplate`, `SymphonyWorkflowError`, and the resolved workflow config types

Move to subpaths later:

- tracker-specific implementations and helpers
- workspace implementation details such as the local manager, command-runner types, path
  sanitizers, and local manager errors
- GitHub-specific event and signal types
- orchestration internals such as `SymphonyOrchestrator`, observer contracts, retry state, and
  Codex event plumbing

Current expert-only subpaths:

- `@symphony/core/workspace/local`
  Local filesystem workspace manager implementation and related expert-only types.
- `@symphony/core/meta`
  Core package metadata and runtime-config types that are intentionally off the root happy path.
- `@symphony/core/tracker`
  Tracker implementations, issue helpers, and tracker-specific DTOs.
- `@symphony/core/github`
  GitHub review event types and the GitHub review processor.
- `@symphony/core/orchestration`
  Orchestrator internals, observer contracts, snapshots, and Codex completion/update plumbing.
- `@symphony/core/journal`
  Run-journal implementations and journal/export DTOs.
- `@symphony/core/forensics`
  Forensics read-model helpers and related expert-only types.
