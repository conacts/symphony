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
    | "dockerGitUserName"
    | "dockerGitUserEmail"
    | "dockerSharedPostgresContainerName"
    | "dockerSharedPostgresImage"
    | "dockerSharedPostgresHost"
    | "dockerSharedPostgresHostPort"
    | "dockerSharedPostgresContainerPort"
    | "dockerSharedPostgresAdminDatabase"
    | "dockerSharedPostgresAdminUsername"
    | "dockerSharedPostgresAdminPassword"
    | "dockerSharedPostgresDatabasePrefix"
    | "dockerSharedPostgresRolePrefix"
    | "sourceRepo"
  >,
  options: {
    runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
    dockerHostFileMounts?: Array<{
      sourcePath: string;
      containerPath: string;
      readOnly?: boolean;
    }>;
    dockerContainerEnv?: Record<string, string>;
  } = {}
): SymphonyRuntimeWorkspaceBackendSelection {
  const { image, imageSelectionSource } = resolveSymphonyDockerWorkspaceImage(
    env.dockerWorkspaceImage
  );

  return {
    backend: createDockerWorkspaceBackend(
      {
        image,
        materializationMode: env.dockerMaterializationMode,
        workspacePath: env.dockerWorkspacePath ?? undefined,
        sourceRepoPath: env.sourceRepo ?? undefined,
        containerNamePrefix: env.dockerContainerNamePrefix ?? undefined,
        shell: env.dockerShell ?? undefined,
        ...(env.dockerGitUserName
          ? { gitUserName: env.dockerGitUserName }
          : {}),
        ...(env.dockerGitUserEmail
          ? { gitUserEmail: env.dockerGitUserEmail }
          : {}),
        containerEnv: options.dockerContainerEnv,
        hostFileMounts: options.dockerHostFileMounts,
        runtimeManifest: options.runtimeManifest ?? null,
        sharedPostgres: {
          containerName: env.dockerSharedPostgresContainerName,
          image: env.dockerSharedPostgresImage,
          host: env.dockerSharedPostgresHost,
          hostPort: env.dockerSharedPostgresHostPort,
          containerPort: env.dockerSharedPostgresContainerPort,
          adminDatabase: env.dockerSharedPostgresAdminDatabase,
          adminUsername: env.dockerSharedPostgresAdminUsername,
          adminPassword: env.dockerSharedPostgresAdminPassword,
          databasePrefix: env.dockerSharedPostgresDatabasePrefix,
          rolePrefix: env.dockerSharedPostgresRolePrefix
        }
      } as Parameters<typeof createDockerWorkspaceBackend>[0]
    ),
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
