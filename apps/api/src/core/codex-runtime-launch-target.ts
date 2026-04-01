import type { PreparedWorkspace } from "@symphony/core";

const defaultContainerShell = "sh";

export type CodexRuntimeLaunchTarget =
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

export function resolveCodexRuntimeLaunchTarget(
  workspace: PreparedWorkspace,
  options: {
    containerShell?: string | null;
  } = {}
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

  return {
    kind: "container",
    hostWorkspacePath,
    runtimeWorkspacePath,
    containerId: workspace.executionTarget.containerId,
    containerName,
    shell: normalizeContainerShell(options.containerShell)
  };
}

function normalizeContainerShell(shell: string | null | undefined): string {
  return normalizeOptionalString(shell) ?? defaultContainerShell;
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
