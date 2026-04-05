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
    const selection = createRuntimeWorkspaceBackend(buildRuntimeEnv({
      dockerWorkspaceImage: null,
      dockerMaterializationMode: "bind_mount",
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null,
      sourceRepo: null
    }));

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
        "gh",
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
    const selection = createRuntimeWorkspaceBackend(buildRuntimeEnv({
      dockerWorkspaceImage: "example.com/custom/symphony-runner:dev",
      dockerMaterializationMode: "bind_mount",
      dockerWorkspacePath: "/home/agent/workspace",
      dockerContainerNamePrefix: "symphony-test",
      dockerShell: "sh",
      sourceRepo: null
    }));

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
        "gh",
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
    const selection = createRuntimeWorkspaceBackend(buildRuntimeEnv({
      dockerWorkspaceImage: "example.com/custom/symphony-runner:dev",
      dockerMaterializationMode: "volume",
      dockerWorkspacePath: "/home/agent/workspace",
      dockerContainerNamePrefix: "symphony-test",
      dockerShell: "sh",
      sourceRepo: null
    }));

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
        "gh",
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
    const selection = createRuntimeWorkspaceBackend(buildRuntimeEnv({
      dockerWorkspaceImage: null,
      dockerMaterializationMode: "bind_mount",
      dockerWorkspacePath: null,
      dockerContainerNamePrefix: null,
      dockerShell: null,
      sourceRepo: null
    }));

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
        "gh",
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

function buildRuntimeEnv(
  overrides: Partial<Parameters<typeof createRuntimeWorkspaceBackend>[0]>
): Parameters<typeof createRuntimeWorkspaceBackend>[0] {
  return {
    dockerWorkspaceImage: null,
    dockerMaterializationMode: "bind_mount",
    dockerWorkspacePath: null,
    dockerContainerNamePrefix: null,
    dockerShell: null,
    dockerSharedPostgresContainerName: "symphony-shared-postgres",
    dockerSharedPostgresImage: "postgres:16",
    dockerSharedPostgresHost: "host.docker.internal",
    dockerSharedPostgresHostPort: 55_432,
    dockerSharedPostgresContainerPort: 5_432,
    dockerSharedPostgresAdminDatabase: "postgres",
    dockerSharedPostgresAdminUsername: "postgres",
    dockerSharedPostgresAdminPassword: "postgres",
    dockerSharedPostgresDatabasePrefix: "symphony",
    dockerSharedPostgresRolePrefix: "symphony",
    sourceRepo: null,
    ...overrides
  };
}
