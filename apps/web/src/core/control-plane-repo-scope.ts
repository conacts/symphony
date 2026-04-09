"use client";

export type ControlPlaneRepoScope = {
  repo?: string | null;
};

export type ControlPlaneRepositorySummary = {
  repositoryKey: string;
  linear: {
    teamKey: string;
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

function normalizeRepoScope(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function describeControlPlaneRepositoryScope(
  repository: ControlPlaneRepositorySummary
): string {
  return `team ${repository.linear.teamKey}`;
}

export function formatControlPlaneRepositoryName(
  repositoryKey: string
): string {
  const segments = repositoryKey.split("/");
  return segments[segments.length - 1] ?? repositoryKey;
}
