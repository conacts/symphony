import type {
  PreparedWorkspace,
  WorkspaceLifecycleMetadata
} from "./workspace-contracts.js";

export function summarizePreparedWorkspace(
  workspace: PreparedWorkspace | null
): WorkspaceLifecycleMetadata | null {
  if (!workspace) {
    return null;
  }

  return {
    issueIdentifier: workspace.issueIdentifier,
    workspaceKey: workspace.workspaceKey,
    backendKind: workspace.backendKind,
    workerHost: workspace.workerHost,
    executionTargetKind: workspace.executionTarget.kind,
    materializationKind: workspace.materialization.kind,
    hostRepoMetadataAvailable: workspaceHostPath(workspace) !== null,
    prepareDisposition: workspace.prepareDisposition,
    containerDisposition: workspace.containerDisposition,
    networkDisposition: workspace.networkDisposition,
    afterCreateHookOutcome: workspace.afterCreateHookOutcome,
    hostPath: workspaceHostPath(workspace),
    runtimePath: workspaceRuntimePath(workspace),
    containerId: workspace.executionTarget.containerId,
    containerName: workspace.executionTarget.containerName,
    networkName: workspace.networkName,
    services: workspace.services,
    envBundleSummary: workspace.envBundle.summary,
    manifestLifecycle: workspace.manifestLifecycle,
    path: workspace.path
  };
}

export function workspaceHostPath(
  workspace: PreparedWorkspace | null
): string | null {
  if (!workspace) {
    return null;
  }

  if (workspace.executionTarget.hostPath) {
    return workspace.executionTarget.hostPath;
  }

  switch (workspace.materialization.kind) {
    case "bind_mount":
      return workspace.materialization.hostPath;
    case "volume":
      return workspace.materialization.hostPath;
  }
}

export function workspaceRuntimePath(
  workspace: PreparedWorkspace | null
): string | null {
  if (!workspace) {
    return null;
  }

  return workspace.executionTarget.workspacePath;
}
