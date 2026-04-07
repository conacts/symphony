"use client";

export type ControlPlaneRepoScope = {
  repo?: string | null;
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
