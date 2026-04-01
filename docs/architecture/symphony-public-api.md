# Symphony Public API

Date: 2026-04-01

## Goal

Freeze a minimal, opinionated public API for Symphony without changing current runtime behavior.

This is a shape decision, not a runtime rewrite. Existing exports stay in place for compatibility.
The new root surface is additive and intentionally small.

## Front Door

```ts
import {
  createLocalWorkspaceBackend,
  createCodexAgentRuntime,
  createGitHubReviewPublisher,
  createSymphonyRuntime,
  type WorkspaceBackend,
  type AgentRuntime,
  type ReviewProvider,
  type ReviewPublisher,
  type SymphonyRuntime
} from "@symphony/core";
```

## Frozen Concepts

- `WorkspaceBackend`
  Stable issue-workspace port. Today this is a naming facade over
  `createLocalSymphonyWorkspaceManager`.
- `AgentRuntime`
  Stable agent-execution port. Today this is a naming facade over the existing
  `SymphonyAgentRuntime` shape.
- `ReviewProvider`
  Optional adapter that resolves provider-specific or inbound review input into a runtime-level
  review object.
- `ReviewPublisher`
  Stable port for publishing runtime-generated review output to an external system such as GitHub.
- `SymphonyRuntime`
  Composition root for tracker + workspace backend + agent runtime + optional review plumbing.
  Today it is an additive wrapper around `SymphonyOrchestrator`, but it does not expose the
  orchestrator instance on the public surface.

## Opinionated Factories

- `createLocalWorkspaceBackend()`
  Public name for the local filesystem-backed workspace implementation.
- `createCodexAgentRuntime(runtime)`
  Transitional naming facade. The concrete Codex implementation still lives in
  `apps/api/src/core/codex-agent-runtime.ts`, so the root factory currently standardizes the public
  name without moving behavior yet.
- `createGitHubReviewPublisher()`
  Transitional naming facade for outbound GitHub review publication. It does not wrap the current
  webhook ingress or requeue processor.
- `createSymphonyRuntime()`
  Additive composition helper that returns a stable runtime object and delegates orchestration to
  `SymphonyOrchestrator` internally.

## Current Mapping

- `WorkspaceBackend` -> `SymphonyWorkspaceManager`
- `AgentRuntime` -> `SymphonyAgentRuntime`
- `createLocalWorkspaceBackend` -> `createLocalSymphonyWorkspaceManager`
- `createSymphonyRuntime` -> `new SymphonyOrchestrator(...)`

The Codex runtime and GitHub review publisher are the intentional exceptions. Their concrete
implementations are not moved in this change.

The current GitHub webhook ingress and Linear requeue path remain internal. If they are extracted
later, they belong behind an inbound adapter/provider seam, not behind `ReviewPublisher`.

## Non-Goals

- No runtime behavior changes
- No package export pruning yet
- No movement of the current Codex runtime implementation into `@symphony/core`
- No movement of the current GitHub webhook ingress implementation into `ReviewPublisher`
- No change to `apps/api/src/core/runtime-services.ts`
- No exposure of `SymphonyOrchestrator` on the public runtime facade

## Runtime Wiring Rules

- `publishReview()` requires a configured `ReviewPublisher` and throws on misconfiguration.
- `ingestReview()` requires both a configured `ReviewProvider` and `ReviewPublisher` and throws on
  misconfiguration.
- `ingestReview()` may still return `null` when the configured provider intentionally resolves no
  review from the supplied input.

## Root Vs Subpaths Later

Keep at root:

- `WorkspaceBackend`, `AgentRuntime`, `ReviewProvider`, `ReviewPublisher`, `SymphonyRuntime`
- `createLocalWorkspaceBackend`, `createCodexAgentRuntime`, `createGitHubReviewPublisher`,
  `createSymphonyRuntime`
- workflow-loading entry points needed to stand up a runtime:
  `loadSymphonyWorkflow`, `parseSymphonyWorkflow`, `defaultSymphonyWorkflowPath`,
  `defaultSymphonyPromptTemplate`, `SymphonyWorkflowError`, and the resolved workflow config types

Move to subpaths later:

- tracker-specific implementations and helpers
- workspace implementation details such as command-runner types and local manager errors
- GitHub-specific event and signal types
- orchestration internals such as `SymphonyOrchestrator`, observer contracts, retry state, and
  Codex event plumbing
- journal and forensics exports

Suggested later subpaths:

- `@symphony/core/workflow`
- `@symphony/core/tracker`
- `@symphony/core/workspace`
- `@symphony/core/review/github`
- `@symphony/core/runtime/internal`
- `@symphony/core/journal`
- `@symphony/core/forensics`
