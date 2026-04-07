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
  sourceRepos: string[]
): Promise<AdmittedRuntimeRepository[]> {
  const admittedRepositories: AdmittedRuntimeRepository[] = [];
  const seenRepositoryKeys = new Set<string>();

  for (const sourceRepo of sourceRepos) {
    const repoRoot = path.resolve(sourceRepo);
    const runtimeContract = await loadSymphonyRuntimeContract(repoRoot);
    const repositoryKey = runtimeContract.runtimeManifest.manifest.repositoryKey;

    if (seenRepositoryKeys.has(repositoryKey)) {
      throw new TypeError(
        `Duplicate repositoryKey ${JSON.stringify(repositoryKey)} across admitted repos.`
      );
    }

    seenRepositoryKeys.add(repositoryKey);
    admittedRepositories.push({
      repositoryKey,
      repoRoot,
      linearBinding: runtimeContract.runtimeManifest.manifest.linear,
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
