import {
  createDockerWorkspaceBackend,
  createLocalWorkspaceBackend,
  type WorkspaceBackend
} from "@symphony/core";
import type { SymphonyLoadedRuntimeManifest } from "@symphony/core/runtime-manifest";
import type { SymphonyRuntimeAppEnv } from "./env.js";

export type SymphonyRuntimeWorkspaceBackendSelection = {
  backend: WorkspaceBackend;
  metadata:
    | {
        backendKind: "local";
        executionTargetKind: "host_path";
        materializationKind: "directory";
        selectionSource: "env";
        sourceRepo: string | null;
        manifestPath: string | null;
      }
    | {
        backendKind: "docker";
        executionTargetKind: "container";
        materializationKind: "bind_mount";
        selectionSource: "env";
        image: string;
        workspacePath: string | null;
        containerNamePrefix: string | null;
        shell: string | null;
        manifestPath: string | null;
      };
};

export function createRuntimeWorkspaceBackend(
  env: Pick<
    SymphonyRuntimeAppEnv,
    | "sourceRepo"
    | "workspaceBackend"
    | "dockerWorkspaceImage"
    | "dockerWorkspacePath"
    | "dockerContainerNamePrefix"
    | "dockerShell"
  >,
  options: {
    runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
  } = {}
): SymphonyRuntimeWorkspaceBackendSelection {
  if (env.workspaceBackend === "docker") {
    const image = requireDockerWorkspaceImage(env.dockerWorkspaceImage);

    return {
      backend: createDockerWorkspaceBackend({
        image,
        workspacePath: env.dockerWorkspacePath ?? undefined,
        containerNamePrefix: env.dockerContainerNamePrefix ?? undefined,
        shell: env.dockerShell ?? undefined,
        runtimeManifest: options.runtimeManifest ?? null
      }),
      metadata: {
        backendKind: "docker",
        executionTargetKind: "container",
        materializationKind: "bind_mount",
        selectionSource: "env",
        image,
        workspacePath: env.dockerWorkspacePath,
        containerNamePrefix: env.dockerContainerNamePrefix,
        shell: env.dockerShell,
        manifestPath: options.runtimeManifest?.manifestPath ?? null
      }
    };
  }

  return {
    backend: createLocalWorkspaceBackend({
      repoOwnedSourceRepo: env.sourceRepo
    }),
    metadata: {
      backendKind: "local",
      executionTargetKind: "host_path",
      materializationKind: "directory",
      selectionSource: "env",
      sourceRepo: env.sourceRepo,
      manifestPath: options.runtimeManifest?.manifestPath ?? null
    }
  };
}

function requireDockerWorkspaceImage(image: string | null): string {
  if (typeof image === "string" && image.trim() !== "") {
    return image.trim();
  }

  throw new TypeError(
    "Docker workspace execution requires SYMPHONY_DOCKER_WORKSPACE_IMAGE."
  );
}
