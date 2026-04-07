import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

const repositoryLabelPrefix = "repo:";

export function resolveIssueRepository(
  admittedRepositories: AdmittedRuntimeRepository[],
  issue: Pick<SymphonyTrackerIssue, "labels">
): AdmittedRuntimeRepository {
  const requestedRepositoryKey = resolveIssueRepositoryLabel(issue.labels);
  if (requestedRepositoryKey) {
    const matchedRepository = admittedRepositories.find(
      (repository) => repository.repositoryKey === requestedRepositoryKey
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

function resolveIssueRepositoryLabel(labels: string[]): string | null {
  for (const label of labels) {
    const normalizedLabel = label.trim().toLowerCase();
    if (!normalizedLabel.startsWith(repositoryLabelPrefix)) {
      continue;
    }

    const repositoryKey = normalizedLabel.slice(repositoryLabelPrefix.length).trim();
    if (repositoryKey.length > 0) {
      return repositoryKey;
    }
  }

  return null;
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
