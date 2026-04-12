import {
  resolveSymphonyRepositoryLabel,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type {
  SymphonyRepositoryWorkspaceBindingRecord,
  SymphonyWorkspaceBindingCatalog
} from "@symphony/db";
import type { SymphonyTrackerRuntimePolicy } from "@symphony/runtime-policy";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

type RuntimeRepositoryIssue = Pick<
  SymphonyTrackerIssue,
  "identifier" | "labels" | "projectId" | "teamKey"
>;

export type ResolvedRuntimeIssueRepository = {
  repository: AdmittedRuntimeRepository;
  repositoryWorkspaceBinding: SymphonyRepositoryWorkspaceBindingRecord | null;
};

export function resolveIssueRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue,
  bindingCatalog: SymphonyWorkspaceBindingCatalog | null = null
): AdmittedRuntimeRepository {
  return resolveIssueRepositorySelection(
    admittedRepositories,
    issue,
    bindingCatalog
  ).repository;
}

export function resolveIssueRepositorySelection(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue,
  bindingCatalog: SymphonyWorkspaceBindingCatalog | null = null
): ResolvedRuntimeIssueRepository {
  const defaultRepository = admittedRepositories[0];
  if (!defaultRepository) {
    throw new TypeError("At least one admitted repository is required.");
  }

  const labeledRepository = resolveLabeledRepository(admittedRepositories, issue);
  const boundSelection =
    bindingCatalog === null
      ? resolveRepositoryByManifestLinearScopeSelection(admittedRepositories, issue)
      : resolveRepositoryByPersistedBindingCatalogSelection({
          admittedRepositories,
          issue,
          bindingCatalog
        });

  if (admittedRepositories.length === 1) {
    if (
      labeledRepository &&
      labeledRepository.repositoryKey !== defaultRepository.repositoryKey
    ) {
      throw new TypeError(
        `Issue ${issue.identifier} requested repository ${JSON.stringify(
          labeledRepository.repositoryKey
        )}, but the runtime only admits ${JSON.stringify(defaultRepository.repositoryKey)}.`
      );
    }

    if (bindingCatalog !== null && !boundSelection) {
      throw new TypeError(
        `Issue ${issue.identifier} does not match any admitted repository by persisted binding scope.`
      );
    }

    if (
      labeledRepository &&
      boundSelection &&
      labeledRepository.repositoryKey !== boundSelection.repository.repositoryKey
    ) {
      throw new TypeError(
        `Issue ${issue.identifier} has conflicting repository routing between persisted binding scope and repo label.`
      );
    }

    return (
      boundSelection ?? {
        repository: defaultRepository,
        repositoryWorkspaceBinding: null
      }
    );
  }
  if (!boundSelection) {
    throw new TypeError(
      `Issue ${issue.identifier} does not match any admitted repository by ${
        bindingCatalog === null ? "Linear scope" : "persisted binding scope"
      }.`
    );
  }

  if (
    labeledRepository &&
    labeledRepository.repositoryKey !== boundSelection.repository.repositoryKey
  ) {
    throw new TypeError(
      `Issue ${issue.identifier} has conflicting repository routing between ${
        bindingCatalog === null ? "Linear scope" : "persisted binding scope"
      } and repo label.`
    );
  }

  return boundSelection;
}

export function resolveWorkspaceRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  repositoryKey: string | null | undefined
): AdmittedRuntimeRepository {
  if (repositoryKey) {
    const matchedRepository = admittedRepositories.find(
      (repository) => repository.repositoryKey === repositoryKey
    );
    if (matchedRepository) {
      return matchedRepository;
    }

    throw new TypeError(
      `Workspace requested repository ${JSON.stringify(repositoryKey)}, but the runtime does not admit it.`
    );
  }

  if (admittedRepositories.length === 1) {
    return admittedRepositories[0]!;
  }

  if (admittedRepositories.length === 0) {
    throw new TypeError("At least one admitted repository is required.");
  }

  throw new TypeError(
    "Workspace repository selection requires an explicit repositoryKey when multiple repositories are admitted."
  );
}

export function resolveRepositoryForLinearScope(
  admittedRepositories: AdmittedRuntimeRepository[],
  tracker: Pick<SymphonyTrackerRuntimePolicy, "teamKey">
): AdmittedRuntimeRepository {
  if (admittedRepositories.length === 0) {
    throw new TypeError("At least one admitted repository is required.");
  }

  if (admittedRepositories.length === 1) {
    return admittedRepositories[0]!;
  }

  if (!tracker.teamKey) {
    throw new TypeError(
      "Multiple admitted repositories require tracker.teamKey to select the default repository."
    );
  }

  const matchedRepositories = admittedRepositories.filter((repository) =>
    repositoryMatchesLinearBinding(repository, tracker)
  );

  if (matchedRepositories.length === 1) {
    return matchedRepositories[0];
  }

  if (matchedRepositories.length > 1) {
    throw new TypeError(
      "Linear tracker binding matches multiple admitted repositories."
    );
  }

  throw new TypeError(
    "Linear tracker binding does not match any admitted repository."
  );
}

export function resolveRepositoryForPersistedBindingScope(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  bindingCatalog: SymphonyWorkspaceBindingCatalog;
  tracker: Pick<SymphonyTrackerRuntimePolicy, "teamKey">;
}): AdmittedRuntimeRepository {
  if (input.admittedRepositories.length === 0) {
    throw new TypeError("At least one admitted repository is required.");
  }

  if (input.admittedRepositories.length === 1) {
    return input.admittedRepositories[0]!;
  }

  if (!input.tracker.teamKey) {
    throw new TypeError(
      "Multiple admitted repositories require tracker.teamKey to select the default repository."
    );
  }

  const repositoryWorkspaceBinding = resolveRepositoryBindingByPersistedBindingScope({
    bindingCatalog: input.bindingCatalog,
    teamKey: input.tracker.teamKey,
    projectId: null
  });
  if (!repositoryWorkspaceBinding) {
    throw new TypeError(
      "Persisted workspace binding scope does not match any admitted repository."
    );
  }
  const repositoryKey = repositoryWorkspaceBinding.repositoryKey;
  const matchedRepository = input.admittedRepositories.find(
    (repository) => repository.repositoryKey === repositoryKey
  );
  if (!matchedRepository) {
    throw new TypeError(
      `Persisted workspace binding selected repository ${JSON.stringify(
        repositoryKey
      )}, but that repository is not admitted.`
    );
  }

  return matchedRepository;
}

function resolveLabeledRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue
): AdmittedRuntimeRepository | null {
  const repositoryKey = resolveSymphonyRepositoryLabel(issue);
  if (!repositoryKey) {
    return null;
  }

  const matchedRepository =
    admittedRepositories.find((repository) => repository.repositoryKey === repositoryKey) ??
    null;

  if (!matchedRepository) {
    throw new TypeError(
      `Issue ${issue.identifier} references unknown repository label ${JSON.stringify(
        repositoryKey
      )}.`
    );
  }

  return matchedRepository;
}

function resolveRepositoryByManifestLinearScopeSelection(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue
): ResolvedRuntimeIssueRepository | null {
  const boundRepositories = admittedRepositories.filter((repository) =>
    repositoryMatchesLinearIssue(repository, issue)
  );

  if (boundRepositories.length > 1) {
    throw new TypeError(
      `Issue ${issue.identifier} matches multiple admitted repositories by Linear scope.`
    );
  }

  const repository = boundRepositories[0] ?? null;
  return repository
    ? {
        repository,
        repositoryWorkspaceBinding: null
      }
    : null;
}

function resolveRepositoryByPersistedBindingCatalogSelection(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  issue: RuntimeRepositoryIssue;
  bindingCatalog: SymphonyWorkspaceBindingCatalog;
}): ResolvedRuntimeIssueRepository | null {
  const repositoryWorkspaceBinding = resolveRepositoryBindingByPersistedBindingScope({
    bindingCatalog: input.bindingCatalog,
    teamKey: input.issue.teamKey,
    projectId: input.issue.projectId
  });
  if (!repositoryWorkspaceBinding) {
    return null;
  }

  const matchedRepository = input.admittedRepositories.find(
    (repository) =>
      repository.repositoryKey === repositoryWorkspaceBinding.repositoryKey
  );
  if (!matchedRepository) {
    throw new TypeError(
      `Persisted workspace binding selected repository ${JSON.stringify(
        repositoryWorkspaceBinding.repositoryKey
      )}, but that repository is not admitted.`
    );
  }

  return {
    repository: matchedRepository,
    repositoryWorkspaceBinding
  };
}

function resolveRepositoryBindingByPersistedBindingScope(input: {
  bindingCatalog: SymphonyWorkspaceBindingCatalog;
  teamKey: string | null;
  projectId: string | null;
}): SymphonyRepositoryWorkspaceBindingRecord | null {
  const projectId = sanitizeOptionalText(input.projectId);
  if (projectId) {
    const projectMatches = input.bindingCatalog.repositories.filter((repository) =>
      repository.projectBindings.some(
        (projectBinding) => projectBinding.linearProjectId === projectId
      )
    );
    if (projectMatches.length > 1) {
      throw new TypeError(
        `Persisted workspace binding matches multiple repositories for project ${JSON.stringify(
          projectId
        )}.`
      );
    }
    if (projectMatches.length === 1) {
      return projectMatches[0]!;
    }
  }

  const teamKey = sanitizeOptionalText(input.teamKey);
  if (!teamKey) {
    return null;
  }

  const teamMatches = input.bindingCatalog.repositories.filter((repository) =>
    repository.teamBindings.some(
      (teamBinding) => teamBinding.linearTeamKey === teamKey
    )
  );

  if (teamMatches.length > 1) {
    throw new TypeError(
      `Persisted workspace binding matches multiple repositories for team ${JSON.stringify(
        teamKey
      )}.`
    );
  }

  return teamMatches[0] ?? null;
}

function repositoryMatchesLinearIssue(
  repository: AdmittedRuntimeRepository,
  issue: RuntimeRepositoryIssue
): boolean {
  return issue.teamKey === repository.linearBinding.teamKey;
}

function repositoryMatchesLinearBinding(
  repository: AdmittedRuntimeRepository,
  tracker: Pick<SymphonyTrackerRuntimePolicy, "teamKey">
): boolean {
  return tracker.teamKey === repository.linearBinding.teamKey;
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
