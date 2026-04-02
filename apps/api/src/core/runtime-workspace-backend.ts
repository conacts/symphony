import {
  createDockerWorkspaceBackend,
  createLocalWorkspaceBackend,
  resolveSymphonyDockerWorkspaceImage,
  symphonyDockerWorkspaceBuildCommand,
  symphonyDockerWorkspaceRequiredTools,
  type SymphonyDockerWorkspaceImageSelectionSource,
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
        materializationKind: "bind_mount" | "volume";
        selectionSource: "env";
        image: string;
        imageSelectionSource: SymphonyDockerWorkspaceImageSelectionSource;
        buildCommand: string;
        requiredTools: readonly string[];
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
    | "dockerMaterializationMode"
    | "dockerWorkspacePath"
    | "dockerContainerNamePrefix"
    | "dockerShell"
  >,
  options: {
    runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
  } = {}
): SymphonyRuntimeWorkspaceBackendSelection {
  if (env.workspaceBackend === "docker") {
    const { image, imageSelectionSource } = resolveSymphonyDockerWorkspaceImage(
      env.dockerWorkspaceImage
    );

    return {
      backend: createDockerWorkspaceBackend({
        image,
        materializationMode: env.dockerMaterializationMode,
        workspacePath: env.dockerWorkspacePath ?? undefined,
        containerNamePrefix: env.dockerContainerNamePrefix ?? undefined,
        shell: env.dockerShell ?? undefined,
        runtimeManifest: options.runtimeManifest ?? null
      }),
      metadata: {
        backendKind: "docker",
        executionTargetKind: "container",
        materializationKind: env.dockerMaterializationMode,
        selectionSource: "env",
        image,
        imageSelectionSource,
        buildCommand: symphonyDockerWorkspaceBuildCommand,
        requiredTools: symphonyDockerWorkspaceRequiredTools,
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
