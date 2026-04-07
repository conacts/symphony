import type { WorkspaceBackend } from "@symphony/workspace";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import { resolveWorkspaceRepository } from "./runtime-repository-routing.js";

export function createRepositoryScopedWorkspaceBackend(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  backends: Map<string, WorkspaceBackend>;
}): WorkspaceBackend {
  return {
    kind: "docker",
    async prepareWorkspace(prepareInput) {
      const backend = resolveBackend(
        input.backends,
        resolveWorkspaceRepository(
          input.admittedRepositories,
          (prepareInput.context as { repositoryKey?: string | null }).repositoryKey
        ).repositoryKey
      );
      return await backend.prepareWorkspace(prepareInput);
    },
    async runBeforeRun(runInput) {
      const backend = resolveBackend(
        input.backends,
        resolveWorkspaceRepository(
          input.admittedRepositories,
          (runInput.context as { repositoryKey?: string | null }).repositoryKey
        ).repositoryKey
      );
      return await backend.runBeforeRun(runInput);
    },
    async runAfterRun(runInput) {
      const backend = resolveBackend(
        input.backends,
        resolveWorkspaceRepository(
          input.admittedRepositories,
          (runInput.context as { repositoryKey?: string | null }).repositoryKey
        ).repositoryKey
      );
      return await backend.runAfterRun(runInput);
    },
    async cleanupWorkspace(cleanupInput) {
      return await resolveBackendForPreparedWorkspace(
        input.backends,
        cleanupInput.workspace as { repositoryKey?: string | null } | null | undefined
      ).cleanupWorkspace(cleanupInput);
    }
  };
}

function resolveBackend(
  backends: Map<string, WorkspaceBackend>,
  repositoryKey: string
): WorkspaceBackend {
  const backend = backends.get(repositoryKey);
  if (!backend) {
    throw new TypeError(`Workspace backend not found for repository ${repositoryKey}.`);
  }

  return backend;
}

function resolveBackendForPreparedWorkspace(
  backends: Map<string, WorkspaceBackend>,
  workspace: {
    repositoryKey?: string | null;
  } | null | undefined
): WorkspaceBackend {
  const repositoryKey = workspace?.repositoryKey;
  if (typeof repositoryKey !== "string" || repositoryKey.trim() === "") {
    throw new TypeError(
      "Prepared workspace is missing repositoryKey for backend cleanup."
    );
  }

  return resolveBackend(backends, repositoryKey);
}
