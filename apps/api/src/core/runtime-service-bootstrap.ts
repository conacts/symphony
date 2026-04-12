import {
  type SymphonyLoadedPromptContract,
  type SymphonyLoadedRuntimeManifest
} from "@symphony/runtime-contract";
import {
  createSymphonyRepositoryBindingStore,
  initializeSymphonyDb,
  type SymphonyWorkspaceBindingCatalog
} from "@symphony/db";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import {
  resolveHarnessProviderEnvKey
} from "@symphony/agent-harnesses";
import { SymphonyRuntimePolicyError } from "@symphony/runtime-policy";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import type { SymphonyLoadedRuntimePromptTemplate } from "./runtime-app-types.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import type {
  SymphonyRuntimeBootstrapBinding,
  SymphonyRuntimeBootstrapRepositorySource
} from "./runtime-bootstrap-contract.js";
export type {
  SymphonyRuntimeBootstrapBinding,
  SymphonyRuntimeBootstrapRepositorySource
} from "./runtime-bootstrap-contract.js";
import { validateSourceRepoRuntimeManifest } from "./runtime-manifest-startup-validator.js";
import { loadSymphonyRuntimePolicyConfig } from "./runtime-policy-config.js";
import { loadAdmittedRuntimeRepositories } from "./runtime-admitted-repositories.js";
import {
  resolveRepositoryForLinearScope,
  resolveRepositoryForPersistedBindingScope
} from "./runtime-repository-routing.js";
import {
  resolveRuntimeWorkflowPresetSelection,
  type SymphonyRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";

type RuntimeServiceBootstrapResult = {
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  harnessProviderEnvKey: string | null;
  bootstrapBinding: SymphonyRuntimeBootstrapBinding;
  repositorySource: SymphonyRuntimeBootstrapRepositorySource;
  repositoryBindingCatalog: SymphonyWorkspaceBindingCatalog | null;
  admittedRepositories: AdmittedRuntimeRepository[];
  validatedRuntimeManifests: Array<{
    runtimeManifest: SymphonyLoadedRuntimeManifest;
    summary: Record<string, unknown>;
  }>;
  primaryRepository: AdmittedRuntimeRepository;
  selectedRuntimeManifestEntry: {
    runtimeManifest: SymphonyLoadedRuntimeManifest;
    summary: Record<string, unknown>;
  };
  workflowPresetSelection: SymphonyRuntimeWorkflowPresetSelection;
  promptContract: SymphonyLoadedPromptContract;
  promptTemplate: SymphonyLoadedRuntimePromptTemplate;
};

export async function loadRuntimeServiceBootstrap(input: {
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
  repositorySource?: SymphonyRuntimeBootstrapRepositorySource;
  workflowPresetOverride?: string | null;
}): Promise<RuntimeServiceBootstrapResult> {
  const runtimePolicy = loadSymphonyRuntimePolicyConfig({
    environmentSource: input.environmentSource,
    cwd: process.cwd()
  });

  if (runtimePolicy.agent.harness !== "pi") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      `Runtime execution rejects legacy harness '${runtimePolicy.agent.harness}' for launch/execute. Use agent.harness: "pi".`
    );
  }

  const harnessProviderEnvKey = resolveHarnessProviderEnvKey(runtimePolicy);
  const repositorySource =
    input.repositorySource ?? createEnvironmentRuntimeBootstrapRepositorySource(input.env);

  if (repositorySource.sourceRepos.length === 0) {
    throw new TypeError(
      "Symphony runtime bootstrap requires at least one admitted source repository. Configure SYMPHONY_SOURCE_REPOS."
    );
  }

  const admittedRepositories = await loadAdmittedRuntimeRepositories(
    repositorySource.sourceRepos
  );
  const validatedRuntimeManifests = await Promise.all(
    repositorySource.sourceRepos.map((sourceRepo) =>
      validateSourceRepoRuntimeManifest(sourceRepo, input.environmentSource)
    )
  );
  const scopedRepositoryBindingCatalog =
    repositorySource.kind === "persisted_workspace_bindings"
      ? await loadPersistedWorkspaceBindingCatalog({
          dbFile: input.env.dbFile,
          bindingScope: repositorySource.bindingScope
        })
      : null;
  const scopedAdmittedRepositories =
    scopedRepositoryBindingCatalog === null
      ? admittedRepositories
      : scopeAdmittedRepositoriesToBindingCatalog({
          admittedRepositories,
          bindingCatalog: scopedRepositoryBindingCatalog
        });
  const primaryRepository =
    scopedRepositoryBindingCatalog === null
      ? resolveRepositoryForLinearScope(
          scopedAdmittedRepositories,
          runtimePolicy.tracker
        )
      : resolveRepositoryForPersistedBindingScope({
          admittedRepositories: scopedAdmittedRepositories,
          bindingCatalog: scopedRepositoryBindingCatalog,
          tracker: runtimePolicy.tracker
        });
  const selectedRuntimeManifestEntry =
    validatedRuntimeManifests.find(
      (candidate) =>
        candidate.runtimeManifest.repoRoot === primaryRepository.repoRoot
    ) ??
    (() => {
      throw new TypeError(
        `Validated runtime manifest missing for primary repository ${JSON.stringify(
          primaryRepository.repositoryKey
        )}.`
      );
    })();
  const promptContract = primaryRepository.promptContract;
  const workflowPresetSelection = resolveRuntimeWorkflowPresetSelection({
    runtimeManifest: selectedRuntimeManifestEntry.runtimeManifest,
    overridePresetId: input.workflowPresetOverride ?? null
  });
  const bootstrapBinding: SymphonyRuntimeBootstrapBinding = {
    kind: "workflow_binding",
    repositorySource,
    defaultRepositoryKey: primaryRepository.repositoryKey,
    manifestPath: selectedRuntimeManifestEntry.runtimeManifest.manifestPath,
    bindingScope:
      repositorySource.kind === "persisted_workspace_bindings"
        ? repositorySource.bindingScope
        : null,
    presetSelection: workflowPresetSelection
  };

  return {
    runtimePolicy,
    harnessProviderEnvKey,
    bootstrapBinding,
    repositorySource,
    repositoryBindingCatalog: scopedRepositoryBindingCatalog,
    admittedRepositories: scopedAdmittedRepositories,
    validatedRuntimeManifests,
    primaryRepository,
    selectedRuntimeManifestEntry,
    workflowPresetSelection,
    promptContract,
    promptTemplate: {
      prompt: promptContract.template.trim(),
      promptTemplate: promptContract.template,
      sourcePath: promptContract.promptPath
    }
  };
}

export function createEnvironmentRuntimeBootstrapRepositorySource(
  env: Pick<SymphonyRuntimeAppEnv, "sourceRepos">
): SymphonyRuntimeBootstrapRepositorySource {
  return {
    kind: "admitted_source_repositories",
    source: "environment",
    sourceRepos: [...env.sourceRepos]
  };
}

async function loadPersistedWorkspaceBindingCatalog(input: {
  dbFile: string;
  bindingScope: {
    organizationId: string;
    linearWorkspaceIdentityId: string;
  };
}): Promise<SymphonyWorkspaceBindingCatalog> {
  const database = initializeSymphonyDb({
    dbFile: input.dbFile
  });

  try {
    const bindingStore = createSymphonyRepositoryBindingStore(database.db);
    return await bindingStore.loadActiveWorkspaceBindingCatalog({
      organizationId: input.bindingScope.organizationId,
      linearWorkspaceIdentityId: input.bindingScope.linearWorkspaceIdentityId
    });
  } finally {
    database.close();
  }
}

function scopeAdmittedRepositoriesToBindingCatalog(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  bindingCatalog: SymphonyWorkspaceBindingCatalog;
}): AdmittedRuntimeRepository[] {
  const catalogRepositoriesByKey = new Map(
    input.bindingCatalog.repositories.map((repository) => [
      repository.repositoryKey,
      repository
    ] as const)
  );

  if (catalogRepositoriesByKey.size === 0) {
    throw new TypeError(
      `Persisted workspace binding scope ${input.bindingCatalog.organizationId}/${input.bindingCatalog.linearWorkspaceIdentityId} has no active repository bindings.`
    );
  }

  const scopedRepositories = input.admittedRepositories.filter((repository) =>
    catalogRepositoriesByKey.has(repository.repositoryKey)
  );

  if (scopedRepositories.length !== input.admittedRepositories.length) {
    const boundRepositoryKeys = new Set(catalogRepositoriesByKey.keys());
    const unboundAdmittedRepositories = input.admittedRepositories
      .map((repository) => repository.repositoryKey)
      .filter((repositoryKey) => !boundRepositoryKeys.has(repositoryKey));
    if (unboundAdmittedRepositories.length > 0) {
      throw new TypeError(
        `Persisted workspace binding scope does not admit repositories ${JSON.stringify(
          unboundAdmittedRepositories
        )}.`
      );
    }
  }

  const scopedRepositoryKeys = new Set(
    scopedRepositories.map((repository) => repository.repositoryKey)
  );
  const missingSourceRepositories = [...catalogRepositoriesByKey.keys()].filter(
    (repositoryKey) => !scopedRepositoryKeys.has(repositoryKey)
  );
  if (missingSourceRepositories.length > 0) {
    throw new TypeError(
      `Persisted workspace binding scope requires admitted repositories ${JSON.stringify(
        missingSourceRepositories
      )}.`
    );
  }

  for (const repository of scopedRepositories) {
    const binding = catalogRepositoriesByKey.get(repository.repositoryKey);
    if (!binding) {
      throw new TypeError(
        `Persisted workspace binding missing for repository ${JSON.stringify(
          repository.repositoryKey
        )}.`
      );
    }

    const matchingTeamBinding = binding.teamBindings.find(
      (teamBinding) =>
        teamBinding.linearTeamKey === repository.linearBinding.teamKey
    );
    if (!matchingTeamBinding) {
      throw new TypeError(
        `Persisted workspace binding for repository ${JSON.stringify(
          repository.repositoryKey
        )} does not include manifest Linear team ${JSON.stringify(
          repository.linearBinding.teamKey
        )}.`
      );
    }
  }

  return scopedRepositories;
}
