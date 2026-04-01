import { describe, expect, it } from "vitest";
import { resolveCodexRuntimeLaunchTarget } from "./codex-runtime-launch-target.js";

describe("codex runtime launch target", () => {
  it("maps host-path workspaces directly into host execution", () => {
    expect(
      resolveCodexRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "local",
        executionTarget: {
          kind: "host_path",
          path: "/tmp/symphony-COL-123"
        },
        materialization: {
          kind: "directory",
          hostPath: "/tmp/symphony-COL-123"
        },
        path: "/tmp/symphony-COL-123",
        created: false,
        workerHost: null
      })
    ).toEqual({
      kind: "host_path",
      hostWorkspacePath: "/tmp/symphony-COL-123",
      runtimeWorkspacePath: "/tmp/symphony-COL-123"
    });
  });

  it("maps container workspaces into docker exec launch targets", () => {
    expect(
      resolveCodexRuntimeLaunchTarget(
        {
          issueIdentifier: "COL-123",
          workspaceKey: "COL-123",
          backendKind: "docker",
          executionTarget: {
            kind: "container",
            workspacePath: "/home/agent/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            hostPath: "/tmp/symphony-COL-123"
          },
          materialization: {
            kind: "bind_mount",
            hostPath: "/tmp/symphony-COL-123",
            containerPath: "/home/agent/workspace"
          },
          path: null,
          created: false,
          workerHost: "docker-host"
        },
        {
          containerShell: "bash"
        }
      )
    ).toEqual({
      kind: "container",
      hostWorkspacePath: "/tmp/symphony-COL-123",
      runtimeWorkspacePath: "/home/agent/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      shell: "bash"
    });
  });

  it("fails closed on container targets without a host-backed materialization path", () => {
    expect(() =>
      resolveCodexRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "docker",
        executionTarget: {
          kind: "container",
          workspacePath: "/home/agent/workspace",
          containerId: "container-123",
          containerName: "symphony-col-123",
          hostPath: null
        },
        materialization: {
          kind: "volume",
          volumeName: "symphony-col-123",
          containerPath: "/home/agent/workspace",
          hostPath: null
        },
        path: null,
        created: false,
        workerHost: "docker-host"
      })
    ).toThrowError(/host-backed workspace path/i);
  });

  it("fails closed on container targets without a container name", () => {
    expect(() =>
      resolveCodexRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "docker",
        executionTarget: {
          kind: "container",
          workspacePath: "/home/agent/workspace",
          containerId: "container-123",
          containerName: null,
          hostPath: "/tmp/symphony-COL-123"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/home/agent/workspace"
        },
        path: null,
        created: false,
        workerHost: "docker-host"
      })
    ).toThrowError(/container name/i);
  });

  it("fails closed on container targets without a runtime workspace path", () => {
    expect(() =>
      resolveCodexRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "docker",
        executionTarget: {
          kind: "container",
          workspacePath: "",
          containerId: "container-123",
          containerName: "symphony-col-123",
          hostPath: "/tmp/symphony-COL-123"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/home/agent/workspace"
        },
        path: null,
        created: false,
        workerHost: "docker-host"
      })
    ).toThrowError(/container workspace path/i);
  });
});
