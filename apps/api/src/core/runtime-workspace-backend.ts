import {
  createDockerWorkspaceBackend,
  resolveSymphonyDockerWorkspaceImage,
  symphonyDockerWorkspaceBuildCommand,
  symphonyDockerWorkspaceRequiredTools,
  type SymphonyDockerWorkspaceImageSelectionSource,
  type WorkspaceBackend
} from "@symphony/workspace";
import type { SymphonyLoadedRuntimeManifest } from "@symphony/runtime-contract";
import type { SymphonyRuntimeAppEnv } from "./env.js";

export type SymphonyRuntimeWorkspaceBackendSelection = {
  backend: WorkspaceBackend;
  metadata: {
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
    | "dockerWorkspaceImage"
    | "dockerMaterializationMode"
    | "dockerWorkspacePath"
    | "dockerContainerNamePrefix"
    | "dockerShell"
    | "sourceRepo"
  >,
  options: {
    runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
    dockerHostFileMounts?: Array<{
      sourcePath: string;
      containerPath: string;
      readOnly?: boolean;
    }>;
  } = {}
): SymphonyRuntimeWorkspaceBackendSelection {
  const { image, imageSelectionSource } = resolveSymphonyDockerWorkspaceImage(
    env.dockerWorkspaceImage
  );

  return {
    backend: createDockerWorkspaceBackend({
      image,
      materializationMode: env.dockerMaterializationMode,
      workspacePath: env.dockerWorkspacePath ?? undefined,
      sourceRepoPath: env.sourceRepo ?? undefined,
      containerNamePrefix: env.dockerContainerNamePrefix ?? undefined,
      shell: env.dockerShell ?? undefined,
      hostFileMounts: options.dockerHostFileMounts,
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
