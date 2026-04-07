export const defaultRuntimeRepositoryKey = "default";

export function resolveRuntimeRepositoryKey(input: {
  sourceRepo: string | null;
  githubRepo: string | null;
}): string {
  const githubRepo = normalizeRuntimeRepositoryKey(input.githubRepo);

  if (githubRepo) {
    return githubRepo;
  }

  const sourceRepo = normalizeRuntimeRepositoryKey(input.sourceRepo);

  if (!sourceRepo) {
    return defaultRuntimeRepositoryKey;
  }

  const segments = sourceRepo.split("/").filter((segment) => segment.length > 0);
  return segments.at(-1) ?? defaultRuntimeRepositoryKey;
}

function normalizeRuntimeRepositoryKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
