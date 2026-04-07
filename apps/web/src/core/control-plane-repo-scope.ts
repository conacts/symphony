"use client";

export function readRepoScopeFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): string | undefined {
  const value = searchParams.get("repo");

  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
