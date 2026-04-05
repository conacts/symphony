import { describe, expect, it } from "vitest";
import {
  buildRuntimeContainerLaunchPath,
  resolveRuntimeLaunchTarget
} from "./agent-runtime-launch-target.js";

const workspaceRoot = "/tmp/workspaces";

describe("agent runtime launch target", () => {
  it("maps container workspaces into docker exec launch targets", () => {
    expect(
      resolveRuntimeLaunchTarget(
        {
          issueIdentifier: "COL-123",
          workspaceKey: "COL-123",
          backendKind: "docker",
          prepareDisposition: "reused",
          containerDisposition: "reused",
          networkDisposition: "reused",
          afterCreateHookOutcome: "skipped",
          executionTarget: {
            kind: "container",
            workspacePath: "/home/agent/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            hostPath: "/tmp/symphony-COL-123",
            shell: "bash"
          },
          materialization: {
            kind: "bind_mount",
            hostPath: "/tmp/symphony-COL-123",
            containerPath: "/home/agent/workspace"
          },
          networkName: "symphony-network-col-123",
          services: [],
          envBundle: ambientEnvBundle(),
          manifestLifecycle: null,
          path: null,
          created: false,
          workerHost: "docker-host"
        },
        workspaceRoot
      )
    ).toEqual({
      kind: "container",
      hostLaunchPath: "/tmp/symphony-COL-123",
      hostWorkspacePath: "/tmp/symphony-COL-123",
      runtimeWorkspacePath: "/home/agent/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      shell: "bash"
    });
  });

  it("maps volume-backed container workspaces into docker exec launch targets", () => {
    expect(
      resolveRuntimeLaunchTarget(
        {
          issueIdentifier: "COL-123",
          workspaceKey: "COL-123",
          backendKind: "docker",
          prepareDisposition: "reused",
          containerDisposition: "reused",
          networkDisposition: "reused",
          afterCreateHookOutcome: "skipped",
          executionTarget: {
            kind: "container",
            workspacePath: "/home/agent/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            hostPath: null,
            shell: "sh"
          },
          materialization: {
            kind: "volume",
            volumeName: "symphony-col-123",
            containerPath: "/home/agent/workspace",
            hostPath: null
          },
          networkName: "symphony-network-col-123",
          services: [],
          envBundle: ambientEnvBundle(),
          manifestLifecycle: null,
          path: null,
          created: false,
          workerHost: "docker-host"
        },
        workspaceRoot
      )
    ).toEqual({
      kind: "container",
      hostLaunchPath: buildRuntimeContainerLaunchPath(workspaceRoot, "COL-123"),
      hostWorkspacePath: null,
      runtimeWorkspacePath: "/home/agent/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      shell: "sh"
    });
  });

  it("fails closed on container targets without a container name", () => {
    expect(() =>
      resolveRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "docker",
        prepareDisposition: "reused",
        containerDisposition: "reused",
        networkDisposition: "reused",
        afterCreateHookOutcome: "skipped",
        executionTarget: {
          kind: "container",
          workspacePath: "/home/agent/workspace",
          containerId: "container-123",
          containerName: null,
          hostPath: "/tmp/symphony-COL-123",
          shell: "sh"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/home/agent/workspace"
        },
        networkName: "symphony-network-col-123",
        services: [],
        envBundle: ambientEnvBundle(),
        manifestLifecycle: null,
        path: null,
        created: false,
        workerHost: "docker-host"
      }, workspaceRoot)
    ).toThrowError(/container name/i);
  });

  it("fails closed on container targets without a runtime workspace path", () => {
    expect(() =>
      resolveRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "docker",
        prepareDisposition: "reused",
        containerDisposition: "reused",
        networkDisposition: "reused",
        afterCreateHookOutcome: "skipped",
        executionTarget: {
          kind: "container",
          workspacePath: "",
          containerId: "container-123",
          containerName: "symphony-col-123",
          hostPath: "/tmp/symphony-COL-123",
          shell: "sh"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/home/agent/workspace"
        },
        networkName: "symphony-network-col-123",
        services: [],
        envBundle: ambientEnvBundle(),
        manifestLifecycle: null,
        path: null,
        created: false,
        workerHost: "docker-host"
      }, workspaceRoot)
    ).toThrowError(/container workspace path/i);
  });

  it("fails closed on container targets without a container shell", () => {
    expect(() =>
      resolveRuntimeLaunchTarget({
        issueIdentifier: "COL-123",
        workspaceKey: "COL-123",
        backendKind: "docker",
        prepareDisposition: "reused",
        containerDisposition: "reused",
        networkDisposition: "reused",
        afterCreateHookOutcome: "skipped",
        executionTarget: {
          kind: "container",
          workspacePath: "/home/agent/workspace",
          containerId: "container-123",
          containerName: "symphony-col-123",
          hostPath: "/tmp/symphony-COL-123",
          shell: ""
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/home/agent/workspace"
        },
        networkName: "symphony-network-col-123",
        services: [],
        envBundle: ambientEnvBundle(),
        manifestLifecycle: null,
        path: null,
        created: false,
        workerHost: "docker-host"
      }, workspaceRoot)
    ).toThrowError(/container shell/i);
  });
});

function ambientEnvBundle() {
  return {
    source: "ambient" as const,
    values: {},
    summary: {
      source: "ambient" as const,
      injectedKeys: [],
      requiredHostKeys: [],
      optionalHostKeys: [],
      repoEnvPath: null,
      projectedRepoKeys: [],
      requiredRepoKeys: [],
      optionalRepoKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    }
  };
}
