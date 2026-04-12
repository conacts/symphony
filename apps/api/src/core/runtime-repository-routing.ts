import {
  resolveSymphonyRepositoryLabel,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyWorkspaceBindingCatalog } from "@symphony/db";
import type { SymphonyTrackerRuntimePolicy } from "@symphony/runtime-policy";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

type RuntimeRepositoryIssue = Pick<
  SymphonyTrackerIssue,
  "identifier" | "labels" | "projectId" | "teamKey"
>;

export function resolveIssueRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue,
  bindingCatalog: SymphonyWorkspaceBindingCatalog | null = null
): AdmittedRuntimeRepository {
  const defaultRepository = admittedRepositories[0];
  if (!defaultRepository) {
    throw new TypeError("At least one admitted repository is required.");
  }

  const labeledRepository = resolveLabeledRepository(admittedRepositories, issue);
  const boundRepository =
    bindingCatalog === null
      ? resolveRepositoryByManifestLinearScope(admittedRepositories, issue)
      : resolveRepositoryByPersistedBindingCatalog({
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

    if (bindingCatalog !== null && !boundRepository && !labeledRepository) {
      throw new TypeError(
        `Issue ${issue.identifier} does not match any admitted repository by persisted binding scope.`
      );
    }

    return defaultRepository;
  }
  if (!boundRepository) {
    throw new TypeError(
      `Issue ${issue.identifier} does not match any admitted repository by ${
        bindingCatalog === null ? "Linear scope" : "persisted binding scope"
      }.`
    );
  }

  if (
    labeledRepository &&
    labeledRepository.repositoryKey !== boundRepository.repositoryKey
  ) {
    throw new TypeError(
      `Issue ${issue.identifier} has conflicting repository routing between Linear scope and repo label.`
    );
  }

  return boundRepository;
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

  const repositoryKey = resolveRepositoryKeyByPersistedBindingScope({
    bindingCatalog: input.bindingCatalog,
    teamKey: input.tracker.teamKey,
    projectId: null
  });
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

function resolveRepositoryByManifestLinearScope(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue
): AdmittedRuntimeRepository | null {
  const boundRepositories = admittedRepositories.filter((repository) =>
    repositoryMatchesLinearIssue(repository, issue)
  );

  if (boundRepositories.length > 1) {
    throw new TypeError(
      `Issue ${issue.identifier} matches multiple admitted repositories by Linear scope.`
    );
  }

  return boundRepositories[0] ?? null;
}

function resolveRepositoryByPersistedBindingCatalog(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  issue: RuntimeRepositoryIssue;
  bindingCatalog: SymphonyWorkspaceBindingCatalog;
}): AdmittedRuntimeRepository | null {
  const repositoryKey = resolveRepositoryKeyByPersistedBindingScope({
    bindingCatalog: input.bindingCatalog,
    teamKey: input.issue.teamKey,
    projectId: input.issue.projectId
  });
  if (!repositoryKey) {
    return null;
  }

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

function resolveRepositoryKeyByPersistedBindingScope(input: {
  bindingCatalog: SymphonyWorkspaceBindingCatalog;
  teamKey: string | null;
  projectId: string | null;
}): string | null {
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
      return projectMatches[0]!.repositoryKey;
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

  return teamMatches[0]?.repositoryKey ?? null;
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
