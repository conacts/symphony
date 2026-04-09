import path from "node:path";
import type {
  AgentRuntimeLaunchTarget
} from "@symphony/orchestrator";
import type { PreparedWorkspace } from "@symphony/workspace";

export type SymphonyRuntimeLaunchTarget = AgentRuntimeLaunchTarget;
const runtimeContainerLaunchDirectoryName = "pi-launch";

export function resolveRuntimeLaunchTarget(
  workspace: PreparedWorkspace,
  workspaceRoot: string,
  runtimeWorkingDirectory = "."
): SymphonyRuntimeLaunchTarget {
  const hostWorkspacePath =
    workspace.executionTarget.hostPath ??
    (workspace.materialization.kind === "bind_mount"
      ? workspace.materialization.hostPath
      : null);

  const containerName = normalizeRequiredString(
    workspace.executionTarget.containerName,
    "container name"
  );
  const runtimeWorkspacePath = normalizeRequiredString(
    workspace.executionTarget.workspacePath,
    "container workspace path"
  );
  const shell = normalizeRequiredString(
    workspace.executionTarget.shell,
    "container shell"
  );
  const normalizedWorkingDirectory = normalizeWorkingDirectory(
    runtimeWorkingDirectory
  );
  const runtimeLaunchPath = resolveRuntimeLaunchPath(
    runtimeWorkspacePath,
    normalizedWorkingDirectory
  );
  const hostLaunchPath =
    hostWorkspacePath !== null
      ? resolveHostLaunchPath(hostWorkspacePath, normalizedWorkingDirectory)
      : buildRuntimeContainerLaunchPath(
          workspaceRoot,
          workspace.workspaceKey,
          normalizedWorkingDirectory
        );

  return {
    kind: "container",
    hostLaunchPath,
    hostWorkspacePath,
    runtimeWorkspacePath: runtimeLaunchPath,
    containerId: workspace.executionTarget.containerId,
    containerName,
    shell,
    user: workspace.executionTarget.user
  };
}

export function buildRuntimeContainerLaunchPath(
  workspaceRoot: string,
  workspaceKey: string,
  workingDirectory = "."
): string {
  const launchRoot = path.join(
    path.resolve(workspaceRoot),
    ".symphony-runtime",
    runtimeContainerLaunchDirectoryName,
    workspaceKey
  );

  return resolveHostLaunchPath(launchRoot, normalizeWorkingDirectory(workingDirectory));
}

function resolveHostLaunchPath(
  hostWorkspacePath: string,
  workingDirectory: string
): string {
  return workingDirectory === "."
    ? hostWorkspacePath
    : path.join(hostWorkspacePath, workingDirectory);
}

function resolveRuntimeLaunchPath(
  runtimeWorkspacePath: string,
  workingDirectory: string
): string {
  return workingDirectory === "."
    ? runtimeWorkspacePath
    : path.posix.join(runtimeWorkspacePath, workingDirectory);
}

function normalizeWorkingDirectory(value: string): string {
  const normalized = value.trim();
  return normalized === "" ? "." : normalized.replace(/[\\/]+$/u, "");
}

function normalizeRequiredString(
  value: string | null | undefined,
  label: string
): string {
  const normalized = normalizeOptionalString(value);
  if (normalized) {
    return normalized;
  }

  throw new TypeError(`Container Pi execution requires a ${label}.`);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}
