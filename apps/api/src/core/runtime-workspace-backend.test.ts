import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSymphonyDockerWorkspaceImage } from "@symphony/workspace";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime workspace backend selection", () => {
  it("defaults to the docker workspace backend", () => {
    const selection = createRuntimeWorkspaceBackend({
      dockerWorkspaceImage: null,
      dockerMaterializationMode: "bind_mount",
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null
    });

    expect(selection.metadata).toEqual({
      backendKind: "docker",
      executionTargetKind: "container",
      materializationKind: "bind_mount",
      selectionSource: "env",
      image: defaultSymphonyDockerWorkspaceImage,
      imageSelectionSource: "default",
      buildCommand: "pnpm docker:workspace-image:build",
      requiredTools: [
        "bash",
        "codex",
        "git",
        "node",
        "corepack",
        "pnpm",
        "python3",
        "psql",
        "rg"
      ],
      workspacePath: null,
      containerNamePrefix: null,
      shell: null,
      manifestPath: null
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });

  it("creates a docker backend from the explicit Docker config surface", () => {
    const selection = createRuntimeWorkspaceBackend({
      dockerWorkspaceImage: "example.com/custom/symphony-runner:dev",
      dockerMaterializationMode: "bind_mount",
      dockerWorkspacePath: "/home/agent/workspace",
      dockerContainerNamePrefix: "symphony-test",
      dockerShell: "sh"
    });

    expect(selection.metadata).toEqual({
      backendKind: "docker",
      executionTargetKind: "container",
      materializationKind: "bind_mount",
      selectionSource: "env",
      image: "example.com/custom/symphony-runner:dev",
      imageSelectionSource: "env",
      buildCommand: "pnpm docker:workspace-image:build",
      requiredTools: [
        "bash",
        "codex",
        "git",
        "node",
        "corepack",
        "pnpm",
        "python3",
        "psql",
        "rg"
      ],
      workspacePath: "/home/agent/workspace",
      containerNamePrefix: "symphony-test",
      shell: "sh",
      manifestPath: null
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });

  it("surfaces container-owned Docker selection without changing the default mode", () => {
    const selection = createRuntimeWorkspaceBackend({
      dockerWorkspaceImage: "example.com/custom/symphony-runner:dev",
      dockerMaterializationMode: "volume",
      dockerWorkspacePath: "/home/agent/workspace",
      dockerContainerNamePrefix: "symphony-test",
      dockerShell: "sh"
    });

    expect(selection.metadata).toEqual({
      backendKind: "docker",
      executionTargetKind: "container",
      materializationKind: "volume",
      selectionSource: "env",
      image: "example.com/custom/symphony-runner:dev",
      imageSelectionSource: "env",
      buildCommand: "pnpm docker:workspace-image:build",
      requiredTools: [
        "bash",
        "codex",
        "git",
        "node",
        "corepack",
        "pnpm",
        "python3",
        "psql",
        "rg"
      ],
      workspacePath: "/home/agent/workspace",
      containerNamePrefix: "symphony-test",
      shell: "sh",
      manifestPath: null
    });
    expect(selection.backend.prepareWorkspace).toBeTypeOf("function");
  });

  it("defaults Docker image selection to the supported local runner image", () => {
    const selection = createRuntimeWorkspaceBackend({
      dockerWorkspaceImage: null,
      dockerMaterializationMode: "bind_mount",
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null
    });

    expect(selection.metadata).toEqual({
      backendKind: "docker",
      executionTargetKind: "container",
      materializationKind: "bind_mount",
      selectionSource: "env",
      image: defaultSymphonyDockerWorkspaceImage,
      imageSelectionSource: "default",
      buildCommand: "pnpm docker:workspace-image:build",
      requiredTools: [
        "bash",
        "codex",
        "git",
        "node",
        "corepack",
        "pnpm",
        "python3",
        "psql",
        "rg"
      ],
      workspacePath: null,
      containerNamePrefix: null,
      shell: null,
      manifestPath: null
    });
  });
});
