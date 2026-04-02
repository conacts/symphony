# Symphony Public API

Date: 2026-04-01

## Goal

Freeze a minimal, opinionated public API for Symphony without changing current runtime behavior.

This is a shape decision, not a runtime rewrite. The root surface is intentionally small and
prefers stable facade types over local implementation details.

## Front Door

```ts
import {
  createDockerWorkspaceBackend,
  createLocalWorkspaceBackend,
  createCodexAgentRuntime,
  createGitHubReviewPublisher,
  createSymphonyRuntime,
  summarizePreparedWorkspace,
  type PreparedWorkspace,
  type WorkspaceBackend,
  type WorkspaceBackendKind,
  type WorkspaceCleanupInput,
  type WorkspaceCleanupResult,
  type WorkspaceContainerDisposition,
  type WorkspaceContext,
  type WorkspaceExecutionTarget,
  type WorkspaceLifecycleMetadata,
  type WorkspaceHookInput,
  type WorkspaceHookResult,
  type WorkspaceMaterializationMetadata,
  type WorkspacePrepareDisposition,
  type WorkspacePrepareInput,
  type AgentRuntime,
  type AgentRuntimeLaunchTarget,
  type ReviewProvider,
  type ReviewPublisher,
  type SymphonyRuntime
} from "@symphony/core";
```

Repo-local runtime manifests now use a separate explicit authoring surface:

```ts
import {
  defineSymphonyRuntime,
  loadSymphonyRuntimeManifest
} from "@symphony/core/runtime-manifest";
```

That subpath freezes the manifest authoring and loading contract without widening the default
`@symphony/core` barrel. See
`docs/architecture/runtime-manifest-contract.md` for the v1 manifest shape and loader rules.

## Frozen Concepts

- `WorkspaceBackend`
  Stable issue-workspace port. This is now a real lifecycle contract with explicit prepare,
  hook, and cleanup operations.
- `WorkspaceBackendKind`, `WorkspaceExecutionTarget`, `WorkspaceMaterializationMetadata`
  Stable execution-model DTOs that describe where the prepared workspace will execute and how the
  workspace is materialized.
- `WorkspacePrepareDisposition`, `WorkspaceContainerDisposition`,
  `WorkspaceLifecycleMetadata`
  Stable observability DTOs that describe whether a workspace was created or reused, whether a
  managed container was started or reused, and the normalized host/runtime/container summary that
  observers and serializers consume.
- `WorkspacePrepareInput`, `PreparedWorkspace`, `WorkspaceHookInput`,
  `WorkspaceCleanupInput`, `WorkspaceContext`
  Stable workspace-lifecycle DTOs that make the seam concrete for both callers and future
  backend implementations. `PreparedWorkspace.path` remains only as a compatibility alias for
  local host-path workspaces; `executionTarget` is the intended contract. `PreparedWorkspace`
  also now carries explicit lifecycle metadata:
  `prepareDisposition`, `containerDisposition`, and `afterCreateHookOutcome`.
- `WorkspaceHookResult`, `WorkspaceCleanupResult`
  Stable lifecycle-result DTOs that make before/after-run and cleanup outcomes explicit rather
  than inferred from side effects.
- `AgentRuntime`
  Stable agent-execution port with explicit lifecycle methods:
  `startRun(input: AgentRunInput): Promise<AgentRunLaunch>` and
  `stopRun(input: AgentStopInput): Promise<void>`.
- `AgentRunInput`, `AgentRunLaunch`, `AgentStopInput`, `AgentRuntimeLaunchTarget`
  Stable runtime DTOs that make agent launch and shutdown behavior explicit without exposing
  orchestration internals. `AgentRunLaunch.launchTarget` makes the actual Codex execution target
  explicit for both local and Docker-backed runs.
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
- `createDockerWorkspaceBackend()`
  Public factory for the experimental Docker-backed workspace implementation. It owns container
  prepare/reuse/hook/cleanup lifecycle and returns container-shaped `PreparedWorkspace` metadata,
  but it does not make Docker the default backend. `apps/api` can now pair it with the
  execution-target-aware Codex runtime to execute against
  `PreparedWorkspace.executionTarget.kind === "container"` on an explicit opt-in path.
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
- `createDockerWorkspaceBackend` -> Docker-backed `WorkspaceBackend` that prepares a bind-mounted
  host workspace, starts or reuses a deterministic container, runs hooks via `docker exec`, and
  tears the container/workspace down during cleanup
- `PreparedWorkspace` -> stable workspace DTO returned from
  `WorkspaceBackend.prepareWorkspace()` with explicit `backendKind`,
  `prepareDisposition`, `containerDisposition`, `afterCreateHookOutcome`,
  `executionTarget`, and `materialization`
- `AgentRuntime` -> explicit lifecycle interface:
  `startRun`, `stopRun`
- `createCodexAgentRuntime` -> adapter over the concrete Codex runtime implementation. In
  `apps/api`, the concrete Codex runtime now resolves a launch target from `PreparedWorkspace` and
  supports both host-path execution and bind-mounted container execution through `docker exec`.
- `AgentRunLaunch.launchTarget` -> normalized runtime launch summary returned from
  `startRun()`
- `summarizePreparedWorkspace` -> helper that collapses backend-specific `PreparedWorkspace`
  detail into the normalized `WorkspaceLifecycleMetadata` shape used by observers, serializers,
  and journal metadata
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

## Runtime Selection For This Stage

- Docker execution remains opt-in at the app boundary.
- `apps/api` selects the workspace backend with `SYMPHONY_WORKSPACE_BACKEND`.
  `local` stays the default.
- `SYMPHONY_WORKSPACE_BACKEND=docker` requires
  `SYMPHONY_DOCKER_WORKSPACE_IMAGE`.
- Optional app-level Docker tuning for this stage:
  `SYMPHONY_DOCKER_WORKSPACE_PATH`,
  `SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX`,
  `SYMPHONY_DOCKER_SHELL`
- The Codex runtime reads only the prepared workspace contract at run time. When it sees
  `executionTarget.kind === "container"`, it launches Codex through `docker exec`, uses the
  container workspace path as the Codex thread cwd, and still uses the host bind-mounted path for
  repo snapshots and cwd validation.

## Observability Contract

This stage intentionally treats runtime/workspace visibility as part of the public seam.

The normalized workspace summary that downstream code should consume is:

```ts
type WorkspaceLifecycleMetadata = {
  issueIdentifier: string;
  workspaceKey: string;
  backendKind: "local" | "docker";
  workerHost: string | null;
  executionTargetKind: "host_path" | "container";
  materializationKind: "directory" | "bind_mount" | "volume";
  prepareDisposition: "created" | "reused";
  containerDisposition: "started" | "reused" | "recreated" | "not_applicable";
  afterCreateHookOutcome: "completed" | "skipped";
  hostPath: string | null;
  runtimePath: string | null;
  containerId: string | null;
  containerName: string | null;
  path: string | null;
};
```

The normalized launch-target summary returned from `AgentRuntime.startRun()` is:

```ts
type AgentRuntimeLaunchTarget =
  | {
      kind: "host_path";
      hostWorkspacePath: string;
      runtimeWorkspacePath: string;
    }
  | {
      kind: "container";
      hostWorkspacePath: string;
      runtimeWorkspacePath: string;
      containerId: string | null;
      containerName: string;
      shell: string;
    };
```

For container-backed runs, `launchTarget.shell` is now derived from
`PreparedWorkspace.executionTarget.shell`, which is authored by the workspace backend during
prepare. That keeps the surfaced launch target tied to the actual backend/runtime contract rather
than a parallel app-config value.

Lifecycle outcomes are explicit rather than inferred:

- Prepare: `prepareDisposition`, `containerDisposition`, `afterCreateHookOutcome`
- Before/after run hooks: `WorkspaceHookResult`
- Cleanup:
  `beforeRemoveHookOutcome`, `workspaceRemovalDisposition`,
  `containerRemovalDisposition`

These shapes are what `apps/api` serializes into runtime state, runtime issue, and journal-backed
read models.

## Non-Goals

- No movement of the current Codex runtime implementation into `@symphony/core`
- No movement of the current GitHub webhook ingress implementation into `ReviewPublisher`
- No broad `apps/api/src/core/runtime-services.ts` redesign beyond explicit backend selection
- No exposure of `SymphonyOrchestrator` on the public runtime facade
- No default Docker cutover
- No workflow-level backend selection yet
- No support yet for volume-only container execution targets in the Codex runtime

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
  `createDockerWorkspaceBackend`, `createSymphonyRuntime`
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
