import { describe, expect, it } from "vitest";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";

describe("runtime workspace backend selection", () => {
  it("defaults to the local workspace backend", () => {
    const selection = createRuntimeWorkspaceBackend({
      sourceRepo: "/tmp/source-repo",
      workspaceBackend: "local",
      dockerWorkspaceImage: null,
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null
    });

    expect(selection.metadata).toEqual({
      backendKind: "local",
      executionTargetKind: "host_path",
      materializationKind: "directory",
      selectionSource: "env",
      sourceRepo: "/tmp/source-repo"
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });

  it("creates a docker backend only when explicitly selected", () => {
    const selection = createRuntimeWorkspaceBackend({
      sourceRepo: "/tmp/source-repo",
      workspaceBackend: "docker",
      dockerWorkspaceImage: "alpine:3.20",
      dockerWorkspacePath: "/home/agent/workspace",
      dockerContainerNamePrefix: "symphony-test",
      dockerShell: "sh"
    });

    expect(selection.metadata).toEqual({
      backendKind: "docker",
      executionTargetKind: "container",
      materializationKind: "bind_mount",
      selectionSource: "env",
      image: "alpine:3.20",
      workspacePath: "/home/agent/workspace",
      containerNamePrefix: "symphony-test",
      shell: "sh"
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });
});
