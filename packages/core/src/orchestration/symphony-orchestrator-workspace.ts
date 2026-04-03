import type { SymphonyJsonObject } from "@symphony/run-journal";
import {
  summarizePreparedWorkspace,
  type PreparedWorkspace,
  type WorkspaceBackend,
  type WorkspaceBackendEventRecorder,
  type WorkspaceLifecycleMetadata
} from "../workspace/workspace-backend.js";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { SymphonyOrchestratorObserver } from "./symphony-orchestrator-types.js";

export function buildWorkspaceLifecyclePayload(
  workspace: PreparedWorkspace | null
): SymphonyJsonObject | null {
  return normalizeWorkspaceLifecycleMetadata(summarizePreparedWorkspace(workspace));
}

export function normalizeWorkspaceLifecycleMetadata(
  workspace: WorkspaceLifecycleMetadata | null
): SymphonyJsonObject | null {
  if (!workspace) {
    return null;
  }

  return {
    issueIdentifier: workspace.issueIdentifier,
    workspaceKey: workspace.workspaceKey,
    backendKind: workspace.backendKind,
    workerHost: workspace.workerHost,
    executionTargetKind: workspace.executionTargetKind,
    materializationKind: workspace.materializationKind,
    hostRepoMetadataAvailable: workspace.hostRepoMetadataAvailable,
    prepareDisposition: workspace.prepareDisposition,
    containerDisposition: workspace.containerDisposition,
    networkDisposition: workspace.networkDisposition,
    afterCreateHookOutcome: workspace.afterCreateHookOutcome,
    hostPath: workspace.hostPath,
    runtimePath: workspace.runtimePath,
    containerId: workspace.containerId,
    containerName: workspace.containerName,
    networkName: workspace.networkName,
    services: workspace.services,
    envBundleSummary: workspace.envBundleSummary,
    manifestLifecycle: workspace.manifestLifecycle,
    path: workspace.path
  };
}

export function createWorkspaceRunnerOptions(
  runnerEnv: Record<string, string | undefined> | undefined,
  workerHost: string | null
): {
  env: Record<string, string | undefined> | undefined;
  workerHost: string | null;
} {
  return {
    env: runnerEnv,
    workerHost
  };
}

export function createWorkspaceLifecycleRecorder(
  observer: SymphonyOrchestratorObserver | null,
  issue: SymphonyTrackerIssue,
  runId: string | null
): WorkspaceBackendEventRecorder {
  return async (event) => {
    await observer?.recordLifecycleEvent({
      issue,
      runId,
      source: "workspace",
      eventType: event.eventType,
      message: event.message,
      payload: event.payload,
      recordedAt: event.recordedAt
    });
  };
}

export async function recordDockerContainerPrepareEvent(input: {
  observer: SymphonyOrchestratorObserver | null;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  workspace: PreparedWorkspace;
}): Promise<void> {
  if (input.workspace.backendKind !== "docker") {
    return;
  }

  const eventType =
    input.workspace.containerDisposition === "reused"
      ? "docker_container_reused"
      : input.workspace.containerDisposition === "recreated"
        ? "docker_container_recreated"
        : "docker_container_started";

  await input.observer?.recordLifecycleEvent({
    issue: input.issue,
    runId: input.runId,
    source: "workspace",
    eventType,
    message:
      input.workspace.containerDisposition === "reused"
        ? "Docker container reused for the prepared workspace."
        : input.workspace.containerDisposition === "recreated"
          ? "Docker container recreated for the prepared workspace."
          : "Docker container started for the prepared workspace.",
    payload: {
      workspace: buildWorkspaceLifecyclePayload(input.workspace)
    }
  });
}

export async function recordDockerContainerCleanupEvent(input: {
  observer: SymphonyOrchestratorObserver | null;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  cleanup: Awaited<ReturnType<WorkspaceBackend["cleanupWorkspace"]>>;
}): Promise<void> {
  if (input.cleanup.backendKind !== "docker") {
    return;
  }

  const eventType =
    input.cleanup.containerRemovalDisposition === "removed"
      ? "docker_container_removed"
      : input.cleanup.containerRemovalDisposition === "missing"
        ? "docker_container_missing"
        : null;

  if (!eventType) {
    return;
  }

  await input.observer?.recordLifecycleEvent({
    issue: input.issue,
    runId: input.runId,
    source: "workspace",
    eventType,
    message:
      input.cleanup.containerRemovalDisposition === "removed"
        ? "Docker container removed during workspace cleanup."
        : "Docker container was already missing during workspace cleanup.",
    payload: {
      cleanup: input.cleanup
    }
  });
}
