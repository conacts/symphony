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
            workspacePath: "/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            hostPath: "/tmp/symphony-COL-123",
            shell: "bash",
            user: "1000:1000"
          },
          materialization: {
            kind: "bind_mount",
            hostPath: "/tmp/symphony-COL-123",
            containerPath: "/workspace"
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
      runtimeWorkspacePath: "/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      shell: "bash",
      user: "1000:1000"
    });
  });

  it("maps container workspaces into the manifest working directory", () => {
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
            workspacePath: "/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            hostPath: "/tmp/symphony-COL-123",
            shell: "bash",
            user: "1000:1000"
          },
          materialization: {
            kind: "bind_mount",
            hostPath: "/tmp/symphony-COL-123",
            containerPath: "/workspace"
          },
          networkName: "symphony-network-col-123",
          services: [],
          envBundle: ambientEnvBundle(),
          manifestLifecycle: null,
          path: null,
          created: false,
          workerHost: "docker-host"
        },
        workspaceRoot,
        "apps/api"
      )
    ).toEqual({
      kind: "container",
      hostLaunchPath: "/tmp/symphony-COL-123/apps/api",
      hostWorkspacePath: "/tmp/symphony-COL-123",
      runtimeWorkspacePath: "/workspace/apps/api",
      containerId: "container-123",
      containerName: "symphony-col-123",
      shell: "bash",
      user: "1000:1000"
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
            workspacePath: "/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            hostPath: null,
            shell: "sh",
            user: "1000:1000"
          },
          materialization: {
            kind: "volume",
            volumeName: "symphony-col-123",
            containerPath: "/workspace",
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
      runtimeWorkspacePath: "/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      shell: "sh",
      user: "1000:1000"
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
          workspacePath: "/workspace",
          containerId: "container-123",
          containerName: null,
          hostPath: "/tmp/symphony-COL-123",
          shell: "sh",
          user: "1000:1000"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/workspace"
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
          shell: "sh",
          user: "1000:1000"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/workspace"
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
          workspacePath: "/workspace",
          containerId: "container-123",
          containerName: "symphony-col-123",
          hostPath: "/tmp/symphony-COL-123",
          shell: "",
          user: "1000:1000"
        },
        materialization: {
          kind: "bind_mount",
          hostPath: "/tmp/symphony-COL-123",
          containerPath: "/workspace"
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
