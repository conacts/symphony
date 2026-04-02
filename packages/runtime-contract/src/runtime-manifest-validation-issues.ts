import type { SymphonyRuntimeManifestIssue } from "./runtime-manifest-errors.js";
import type { ManifestPath } from "./runtime-manifest-validation-shared.js";

export function collectDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

export function renderAllowedValues(values: Iterable<string>): string {
  return [...values].map((value) => JSON.stringify(value)).join(", ");
}

export function formatManifestPath(pathSegments: ManifestPath): string {
  return pathSegments.length === 0 ? "<root>" : pathSegments.join(".");
}

export function pushIssue(
  issues: SymphonyRuntimeManifestIssue[],
  pathSegments: ManifestPath,
  message: string
): void {
  issues.push({
    path: formatManifestPath(pathSegments),
    message
  });
}

export function startIssueCheckpoint(
  issues: SymphonyRuntimeManifestIssue[]
): number {
  return issues.length;
}

export function hasIssuesSince(
  issues: SymphonyRuntimeManifestIssue[],
  checkpoint: number
): boolean {
  return issues.length > checkpoint;
}

export function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[]
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      pushIssue(issues, [...pathSegments, key], "Unknown key.");
    }
  }
}
