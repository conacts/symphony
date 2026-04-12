import type {
  SymphonyRuntimeConfigResult
} from "@symphony/contracts";
import type { SymphonyWorkspaceBindingCatalog } from "@symphony/db";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import type { SymphonyRuntimeBootstrapBinding } from "./runtime-bootstrap-contract.js";
import type {
  DockerGitHubCliAuthContract,
  DockerPiAuthContract
} from "./runtime-auth-contract.js";

export function buildRuntimeConfigSnapshot(input: {
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  bootstrapBinding: SymphonyRuntimeBootstrapBinding;
  admittedRepositories: AdmittedRuntimeRepository[];
  bindingCatalog: SymphonyWorkspaceBindingCatalog | null;
  dockerGitHubCliAuth: DockerGitHubCliAuthContract;
  dockerLinearLaunchEnv: Record<string, string>;
  dockerPiAuth: DockerPiAuthContract;
}): SymphonyRuntimeConfigResult {
  const {
    runtimePolicy,
    bootstrapBinding,
    admittedRepositories,
    bindingCatalog,
    dockerGitHubCliAuth,
    dockerLinearLaunchEnv,
    dockerPiAuth
  } = input;

  return {
    runtime: {
      repositoryKey: bootstrapBinding.defaultRepositoryKey,
      githubRepository: bootstrapBinding.defaultRepositoryKey,
      trackerKind: runtimePolicy.tracker.kind,
      trackerTeamKey:
        runtimePolicy.tracker.kind === "linear"
          ? runtimePolicy.tracker.teamKey
          : null,
      agentHarness: runtimePolicy.agent.harness,
      workspaceRoot: runtimePolicy.workspace.root
    },
    credentials: {
      linearApiKeyConfigured: Object.prototype.hasOwnProperty.call(
        dockerLinearLaunchEnv,
        "LINEAR_API_KEY"
      ),
      githubCliAuthMode: readGitHubCliAuthMode(dockerGitHubCliAuth),
      githubCliAuthEnvKey: dockerGitHubCliAuth.authEnvKey,
      piAuthMode: readPiAuthMode(dockerPiAuth),
      piProviderEnvKey: dockerPiAuth.providerEnvKey
    },
    bootstrap: {
      kind: bootstrapBinding.kind,
      repositorySource:
        bootstrapBinding.repositorySource.kind === "persisted_workspace_bindings"
          ? {
              kind: bootstrapBinding.repositorySource.kind,
              source: bootstrapBinding.repositorySource.source,
              sourceRepos: [...bootstrapBinding.repositorySource.sourceRepos],
              bindingScope: {
                organizationId:
                  bootstrapBinding.repositorySource.bindingScope.organizationId,
                linearWorkspaceIdentityId:
                  bootstrapBinding.repositorySource.bindingScope
                    .linearWorkspaceIdentityId
              }
            }
          : {
              kind: bootstrapBinding.repositorySource.kind,
              source: bootstrapBinding.repositorySource.source,
              sourceRepos: [...bootstrapBinding.repositorySource.sourceRepos]
            },
      defaultRepositoryKey: bootstrapBinding.defaultRepositoryKey,
      manifestPath: bootstrapBinding.manifestPath,
      bindingScope:
        bootstrapBinding.bindingScope === null
          ? null
          : {
              organizationId: bootstrapBinding.bindingScope.organizationId,
              linearWorkspaceIdentityId:
                bootstrapBinding.bindingScope.linearWorkspaceIdentityId
            },
      presetSelection: {
        presetId: bootstrapBinding.presetSelection.presetId,
        source: bootstrapBinding.presetSelection.source,
        repositoryKey: bootstrapBinding.presetSelection.repositoryKey,
        manifestPath: bootstrapBinding.presetSelection.manifestPath
      }
    },
    admittedRepositories: admittedRepositories.map((repository) => ({
      repositoryKey: repository.repositoryKey,
      repoRoot: repository.repoRoot,
      linearTeamKey: repository.linearBinding.teamKey,
      manifestPath: repository.runtimeManifest.manifestPath,
      promptPath: repository.promptContract.promptPath
    })),
    bindingCatalog:
      bindingCatalog === null
        ? null
        : {
            organizationId: bindingCatalog.organizationId,
            linearWorkspaceIdentityId: bindingCatalog.linearWorkspaceIdentityId,
            repositories: bindingCatalog.repositories.map((repository) => ({
              repositoryWorkspaceBindingId:
                repository.repositoryWorkspaceBindingId,
              githubInstallationIdentityId:
                repository.githubInstallationIdentityId,
              githubRepositoryIdentityId:
                repository.githubRepositoryIdentityId,
              repositoryKey: repository.repositoryKey,
              linearWorkspaceIdentityId: repository.linearWorkspaceIdentityId,
              source: repository.source,
              teamBindings: repository.teamBindings.map((binding) => ({
                repositoryTeamBindingId: binding.repositoryTeamBindingId,
                linearTeamIdentityId: binding.linearTeamIdentityId,
                linearTeamId: binding.linearTeamId,
                linearTeamKey: binding.linearTeamKey,
                source: binding.source
              })),
              projectBindings: repository.projectBindings.map((binding) => ({
                repositoryProjectBindingId: binding.repositoryProjectBindingId,
                linearProjectIdentityId: binding.linearProjectIdentityId,
                linearProjectId: binding.linearProjectId,
                source: binding.source
              }))
            }))
          }
  };
}

function readGitHubCliAuthMode(
  contract: DockerGitHubCliAuthContract
): "env" | "mount" | "none" {
  if (contract.authEnvKey !== null) {
    return "env";
  }

  if (contract.mount !== null) {
    return "mount";
  }

  return "none";
}

function readPiAuthMode(
  contract: DockerPiAuthContract
): "provider_env" | "auth_json" | "none" {
  if (contract.mount !== null) {
    return "auth_json";
  }

  if (
    contract.providerEnvKey !== null &&
    Object.prototype.hasOwnProperty.call(
      contract.launchEnv,
      contract.providerEnvKey
    )
  ) {
    return "provider_env";
  }

  return "none";
}
