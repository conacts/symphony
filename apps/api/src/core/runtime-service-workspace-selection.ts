import {
  defaultSymphonyDockerWorkspacePreflightTimeoutMs,
  preflightSymphonyDockerWorkspaceImage,
  type SymphonyDockerWorkspacePreflightResult,
  type WorkspaceBackend
} from "@symphony/workspace";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import type {
  DockerGitHubCliAuthContract,
  DockerPiAuthContract
} from "./runtime-auth-contract.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";
import { createRepositoryScopedWorkspaceBackend } from "./runtime-workspace-backend-selector.js";

type DockerHostFileMount = {
  sourcePath: string;
  containerPath: string;
  readOnly?: boolean;
};

type RuntimeWorkspaceBackendSelection = ReturnType<
  typeof createRuntimeWorkspaceBackend
>;

export type RuntimeWorkspaceBackendSelectionResult = {
  workspaceBackend: WorkspaceBackend;
  workspaceBackendPayload: Record<string, unknown>;
  primarySelection: RuntimeWorkspaceBackendSelection;
};

export function resolveRuntimeWorkspaceBackendSelection(input: {
  env: SymphonyRuntimeAppEnv;
  admittedRepositories: AdmittedRuntimeRepository[];
  primaryRepositoryKey: string;
  workspaceRoot: string;
  dockerHostFileMounts: DockerHostFileMount[];
  dockerGitHubCliAuth: DockerGitHubCliAuthContract;
  dockerLinearLaunchEnv: Record<string, string>;
  dockerPiAuth: DockerPiAuthContract;
}): RuntimeWorkspaceBackendSelectionResult {
  const workspaceBackendSelections = input.admittedRepositories.map(
    (repository) => ({
      repositoryKey: repository.repositoryKey,
      selection: createRuntimeWorkspaceBackend(
        {
          ...input.env,
          sourceRepo: repository.repoRoot
        },
        {
          dockerHostFileMounts: input.dockerHostFileMounts,
          dockerContainerEnv: buildDockerWorkspaceContainerEnv({
            dockerGitHubCliAuth: input.dockerGitHubCliAuth,
            dockerLinearLaunchEnv: input.dockerLinearLaunchEnv,
            dockerPiAuth: input.dockerPiAuth
          }),
          runtimeManifest: repository.runtimeManifest
        }
      )
    })
  );
  const primarySelection =
    workspaceBackendSelections.find(
      (entry) => entry.repositoryKey === input.primaryRepositoryKey
    )?.selection ??
    (() => {
      throw new TypeError(
        `Workspace backend selection missing for repository ${JSON.stringify(
          input.primaryRepositoryKey
        )}.`
      );
    })();
  const workspaceBackendsByRepository = new Map(
    workspaceBackendSelections.map((entry) => [
      entry.repositoryKey,
      entry.selection.backend
    ])
  );
  const workspaceBackend =
    workspaceBackendsByRepository.size > 1
      ? createRepositoryScopedWorkspaceBackend({
          admittedRepositories: input.admittedRepositories,
          backends: workspaceBackendsByRepository
        })
      : primarySelection.backend;

  return {
    workspaceBackend,
    workspaceBackendPayload: buildWorkspaceBackendPayload({
      workspaceRoot: input.workspaceRoot,
      metadata: primarySelection.metadata,
      dockerGitHubCliAuth: input.dockerGitHubCliAuth,
      dockerLinearLaunchEnv: input.dockerLinearLaunchEnv,
      dockerPiAuth: input.dockerPiAuth
    }),
    primarySelection
  };
}

export function buildWorkspaceBackendPayload(input: {
  workspaceRoot: string;
  metadata: Record<string, unknown>;
  dockerGitHubCliAuth: DockerGitHubCliAuthContract;
  dockerLinearLaunchEnv: Record<string, string>;
  dockerPiAuth: DockerPiAuthContract;
}): Record<string, unknown> {
  const {
    workspaceRoot,
    metadata,
    dockerGitHubCliAuth,
    dockerLinearLaunchEnv,
    dockerPiAuth
  } = input;

  return {
    workspaceRoot,
    ...metadata,
    dockerGitHubCliAuthMode:
      dockerGitHubCliAuth.authEnvKey !== null
        ? "env"
        : dockerGitHubCliAuth.mount !== null
          ? "mount"
          : "none",
    dockerGitHubCliAuthEnvKey: dockerGitHubCliAuth.authEnvKey,
    dockerLinearApiKeyInjected:
      Object.prototype.hasOwnProperty.call(dockerLinearLaunchEnv, "LINEAR_API_KEY"),
    dockerPiAuthMounted: dockerPiAuth.mount !== null,
    dockerPiProviderEnvKey: dockerPiAuth.providerEnvKey,
    dockerPiProviderEnvMounted:
      dockerPiAuth.providerEnvKey !== null &&
      Object.prototype.hasOwnProperty.call(
        dockerPiAuth.launchEnv,
        dockerPiAuth.providerEnvKey
      )
  };
}

export function buildDockerWorkspaceContainerEnv(input: {
  dockerGitHubCliAuth: DockerGitHubCliAuthContract;
  dockerLinearLaunchEnv: Record<string, string>;
  dockerPiAuth: DockerPiAuthContract;
}): Record<string, string> {
  const {
    dockerGitHubCliAuth,
    dockerLinearLaunchEnv,
    dockerPiAuth
  } = input;

  return {
    ...dockerGitHubCliAuth.launchEnv,
    ...dockerPiAuth.launchEnv,
    ...dockerLinearLaunchEnv
  };
}

export async function preflightDockerWorkspaceBackendSelection(input: {
  image: string;
  shell: string | null;
}): Promise<SymphonyDockerWorkspacePreflightResult> {
  return await preflightSymphonyDockerWorkspaceImage({
    image: input.image,
    shell: input.shell,
    timeoutMs: defaultSymphonyDockerWorkspacePreflightTimeoutMs
  });
}
