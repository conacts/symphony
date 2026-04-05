import path from "node:path";
import type {
  AgentRuntimeLaunchTarget
} from "@symphony/orchestrator";
import type { PreparedWorkspace } from "@symphony/workspace";

export type SymphonyRuntimeLaunchTarget = AgentRuntimeLaunchTarget;
export const runtimeContainerLaunchDirectoryName = "codex-launch";

export function resolveRuntimeLaunchTarget(
  workspace: PreparedWorkspace,
  workspaceRoot: string
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

  return {
    kind: "container",
    hostLaunchPath:
      hostWorkspacePath ??
      buildRuntimeContainerLaunchPath(workspaceRoot, workspace.workspaceKey),
    hostWorkspacePath,
    runtimeWorkspacePath,
    containerId: workspace.executionTarget.containerId,
    containerName,
    shell
  };
}

export function buildRuntimeContainerLaunchPath(
  workspaceRoot: string,
  workspaceKey: string
): string {
  return path.join(
    path.resolve(workspaceRoot),
    ".symphony-runtime",
    runtimeContainerLaunchDirectoryName,
    workspaceKey
  );
}

function normalizeRequiredString(
  value: string | null | undefined,
  label: string
): string {
  const normalized = normalizeOptionalString(value);
  if (normalized) {
    return normalized;
  }

  throw new TypeError(`Container Codex execution requires a ${label}.`);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}
