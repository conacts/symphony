import {
  resolveSymphonyRepositoryLabel,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
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
  }

  const defaultRepository = admittedRepositories[0];
  if (!defaultRepository) {
    throw new TypeError("At least one admitted repository is required.");
  }

  return defaultRepository;
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
