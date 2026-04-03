import path from "node:path";
import type {
  AgentRuntimeLaunchTarget
} from "@symphony/core";
import type { PreparedWorkspace } from "@symphony/workspace";

export type CodexRuntimeLaunchTarget = AgentRuntimeLaunchTarget;
export const codexContainerLaunchDirectoryName = "codex-launch";

export function resolveCodexRuntimeLaunchTarget(
  workspace: PreparedWorkspace,
  workspaceRoot: string
): CodexRuntimeLaunchTarget {
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
      buildCodexContainerLaunchPath(workspaceRoot, workspace.workspaceKey),
    hostWorkspacePath,
    runtimeWorkspacePath,
    containerId: workspace.executionTarget.containerId,
    containerName,
    shell
  };
}

export function buildCodexContainerLaunchPath(
  workspaceRoot: string,
  workspaceKey: string
): string {
  return path.join(
    path.resolve(workspaceRoot),
    ".symphony-runtime",
    codexContainerLaunchDirectoryName,
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
