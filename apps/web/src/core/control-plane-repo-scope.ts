"use client";

export type ControlPlaneRepoScope = {
  repo?: string | null;
};

export type ControlPlaneRepositorySummary = {
  repositoryKey: string;
  linear: {
    projectSlug: string | null;
    teamKey: string | null;
    apiKeyEnvKey: string | null;
  };
};

export function readRepoScopeFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): string | undefined {
  const value = normalizeRepoScope(searchParams.get("repo"));

  return value ?? undefined;
}

export function buildRepoScopedHref(
  pathname: string,
  scope?: ControlPlaneRepoScope
): string {
  const repo = normalizeRepoScope(scope?.repo);

  if (!repo) {
    return pathname;
  }

  const searchParams = new URLSearchParams({
    repo
  });
  return `${pathname}?${searchParams.toString()}`;
}

export function normalizeRepoScope(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function describeControlPlaneRepositoryScope(
  repository: ControlPlaneRepositorySummary
): string {
  const linearScope = repository.linear.projectSlug
    ? `project ${repository.linear.projectSlug}`
    : repository.linear.teamKey
      ? `team ${repository.linear.teamKey}`
      : "unbound";

  const authLabel = repository.linear.apiKeyEnvKey
    ? `auth ${repository.linear.apiKeyEnvKey}`
    : "shared auth";

  return `${linearScope} • ${authLabel}`;
}
