import type {
  AgentRuntimeLaunchTarget,
  PreparedWorkspace
} from "@symphony/core";

export type CodexRuntimeLaunchTarget = AgentRuntimeLaunchTarget;

export function resolveCodexRuntimeLaunchTarget(
  workspace: PreparedWorkspace
): CodexRuntimeLaunchTarget {
  if (workspace.executionTarget.kind === "host_path") {
    return {
      kind: "host_path",
      hostWorkspacePath: workspace.executionTarget.path,
      runtimeWorkspacePath: workspace.executionTarget.path
    };
  }

  const hostWorkspacePath =
    workspace.executionTarget.hostPath ??
    (workspace.materialization.kind === "bind_mount"
      ? workspace.materialization.hostPath
      : null);

  if (!hostWorkspacePath) {
    throw new TypeError(
      "Container Codex execution requires a host-backed workspace path. Volume-only execution targets remain deferred."
    );
  }

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
    hostWorkspacePath,
    runtimeWorkspacePath,
    containerId: workspace.executionTarget.containerId,
    containerName,
    shell
  };
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
