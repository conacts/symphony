import {
  resolveSymphonyRepositoryLabel,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyTrackerRuntimePolicy } from "@symphony/runtime-policy";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

type RuntimeRepositoryIssue = Pick<
  SymphonyTrackerIssue,
  "identifier" | "labels" | "projectSlug" | "teamKey"
>;

export function resolveIssueRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: RuntimeRepositoryIssue
): AdmittedRuntimeRepository {
  const defaultRepository = admittedRepositories[0];
  if (!defaultRepository) {
    throw new TypeError("At least one admitted repository is required.");
  }

  const labeledRepository = resolveLabeledRepository(admittedRepositories, issue);

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

    return defaultRepository;
  }

  const boundRepositories = admittedRepositories.filter((repository) =>
    repositoryMatchesLinearIssue(repository, issue)
  );

  if (boundRepositories.length > 1) {
    throw new TypeError(
      `Issue ${issue.identifier} matches multiple admitted repositories by Linear scope.`
    );
  }

  const boundRepository = boundRepositories[0] ?? null;
  if (!boundRepository) {
    throw new TypeError(
      `Issue ${issue.identifier} does not match any admitted repository by Linear scope.`
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
  tracker: Pick<SymphonyTrackerRuntimePolicy, "projectSlug" | "teamKey">
): AdmittedRuntimeRepository {
  if (admittedRepositories.length === 0) {
    throw new TypeError("At least one admitted repository is required.");
  }

  if (admittedRepositories.length === 1) {
    return admittedRepositories[0]!;
  }

  if (!tracker.projectSlug && !tracker.teamKey) {
    throw new TypeError(
      "Multiple admitted repositories require tracker.projectSlug or tracker.teamKey to select the default repository."
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

function repositoryMatchesLinearIssue(
  repository: AdmittedRuntimeRepository,
  issue: RuntimeRepositoryIssue
): boolean {
  const linearBinding = repository.linearBinding;

  if (linearBinding.projectSlug) {
    return issue.projectSlug === linearBinding.projectSlug;
  }

  if (linearBinding.teamKey) {
    return issue.teamKey === linearBinding.teamKey;
  }

  return false;
}

function repositoryMatchesLinearBinding(
  repository: AdmittedRuntimeRepository,
  tracker: Pick<SymphonyTrackerRuntimePolicy, "projectSlug" | "teamKey">
): boolean {
  const linearBinding = repository.linearBinding;

  if (linearBinding.projectSlug) {
    return tracker.projectSlug === linearBinding.projectSlug;
  }

  if (linearBinding.teamKey) {
    return tracker.teamKey === linearBinding.teamKey;
  }

  return false;
}
