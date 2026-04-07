import path from "node:path";
import {
  loadSymphonyRuntimeContract,
  type SymphonyLoadedPromptContract,
  type SymphonyLoadedRuntimeManifest
} from "@symphony/runtime-contract";

export type AdmittedRuntimeRepository = {
  repositoryKey: string;
  repoRoot: string;
  linearBinding: {
    projectSlug: string | null;
    teamKey: string | null;
    apiKeyEnvKey: string | null;
  };
  promptContract: SymphonyLoadedPromptContract;
  runtimeManifest: SymphonyLoadedRuntimeManifest;
};

export async function loadAdmittedRuntimeRepositories(
  sourceRepos: string[],
  environmentSource: Record<string, string | undefined>
): Promise<AdmittedRuntimeRepository[]> {
  const admittedRepositories: AdmittedRuntimeRepository[] = [];
  const seenRepositoryKeys = new Set<string>();

  for (const sourceRepo of sourceRepos) {
    const repoRoot = path.resolve(sourceRepo);
    const runtimeContract = await loadSymphonyRuntimeContract(repoRoot);
    const repositoryKey = runtimeContract.runtimeManifest.manifest.repositoryKey;
    const linearBinding = runtimeContract.runtimeManifest.manifest.linear;

    if (seenRepositoryKeys.has(repositoryKey)) {
      throw new TypeError(
        `Duplicate repositoryKey ${JSON.stringify(repositoryKey)} across admitted repos.`
      );
    }

    ensureLinearAuthEnvironment(
      repositoryKey,
      linearBinding.apiKeyEnvKey,
      environmentSource
    );

    seenRepositoryKeys.add(repositoryKey);
    admittedRepositories.push({
      repositoryKey,
      repoRoot,
      linearBinding,
      promptContract: runtimeContract.promptContract,
      runtimeManifest: runtimeContract.runtimeManifest
    });
  }

  return admittedRepositories;
}

export function findAdmittedRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  repositoryKey: string | null | undefined
): AdmittedRuntimeRepository | null {
  if (!repositoryKey) {
    return null;
  }

  return (
    admittedRepositories.find(
      (repository) => repository.repositoryKey === repositoryKey
    ) ?? null
  );
}

function ensureLinearAuthEnvironment(
  repositoryKey: string,
  apiKeyEnvKey: string | null,
  environmentSource: Record<string, string | undefined>
): void {
  if (!apiKeyEnvKey) {
    return;
  }

  const apiKey = environmentSource[apiKeyEnvKey];
  if (typeof apiKey === "string" && apiKey.trim().length > 0) {
    return;
  }

  throw new TypeError(
    `Admitted repository ${JSON.stringify(repositoryKey)} requires ${apiKeyEnvKey}, but that environment variable is missing.`
  );
}
