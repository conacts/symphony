export function resolveRuntimeRepositoryKey(input: {
  sourceRepo: string | null;
  githubRepo: string | null;
}): string {
  const githubRepo = normalizeRuntimeRepositoryKey(input.githubRepo);

  if (githubRepo) {
    return githubRepo;
  }

  const sourceRepo = normalizeRuntimeRepositoryKey(input.sourceRepo);

  if (sourceRepo) {
    return sourceRepo;
  }

  throw new TypeError(
    "Symphony runtime repository identity is required. Configure an explicit repository key such as owner/repo."
  );
}

function normalizeRuntimeRepositoryKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 2 && segments.every((segment) => segment.trim().length > 0)) {
    return `${segments[0]}/${segments[1]}`;
  }

  return null;
}
