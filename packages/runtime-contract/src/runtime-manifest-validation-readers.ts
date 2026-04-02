import path from "node:path";
import type { SymphonyRuntimeManifestIssue } from "./runtime-manifest-errors.js";
import {
  environmentVariablePattern,
  serviceKeyPattern,
  type ManifestPath
} from "./runtime-manifest-validation-shared.js";
import {
  formatManifestPath,
  hasIssuesSince,
  pushIssue,
  renderAllowedValues,
  startIssueCheckpoint
} from "./runtime-manifest-validation-issues.js";
import { isRecord } from "./internal/records.js";

export function readStrictRecord(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    pushIssue(issues, pathSegments, `${label} must be an object.`);
    return undefined;
  }

  return value;
}

export function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): string | undefined {
  if (!(key in record) || record[key] === undefined) {
    pushIssue(issues, pathSegments, `${label} must be a non-empty string.`);
    return undefined;
  }

  return normalizeNonEmptyString(record[key], pathSegments, issues, label);
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): string | undefined {
  if (!(key in record) || record[key] === undefined) {
    return undefined;
  }

  return normalizeNonEmptyString(record[key], pathSegments, issues, label);
}

function normalizeNonEmptyString(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): string | undefined {
  if (typeof value !== "string") {
    pushIssue(issues, pathSegments, `${label} must be a non-empty string.`);
    return undefined;
  }

  const normalized = value.trim();
  if (normalized === "") {
    pushIssue(issues, pathSegments, `${label} must be a non-empty string.`);
    return undefined;
  }

  return normalized;
}

export function readOptionalRelativePath(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): string | undefined {
  const value = readOptionalString(record, key, pathSegments, issues, label);

  if (value === undefined) {
    return undefined;
  }

  if (path.posix.isAbsolute(value)) {
    pushIssue(issues, pathSegments, `${label} must be a workspace-relative path.`);
    return undefined;
  }

  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) {
    pushIssue(
      issues,
      pathSegments,
      `${label} must stay within the workspace root.`
    );
    return undefined;
  }

  return normalized;
}

export function readOptionalHostname(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): string | undefined {
  const value = readOptionalString(record, key, pathSegments, issues, label);

  if (value === undefined) {
    return undefined;
  }

  if (!serviceKeyPattern.test(value)) {
    pushIssue(issues, pathSegments, `${label} must match ^[a-z][a-z0-9-]*$.`);
    return undefined;
  }

  return value;
}

export function readRequiredEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowedValues: Set<T>,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): T | undefined {
  if (!(key in record) || record[key] === undefined) {
    pushIssue(issues, pathSegments, `${label} is required.`);
    return undefined;
  }

  const value = record[key];
  if (typeof value !== "string" || !allowedValues.has(value as T)) {
    pushIssue(
      issues,
      pathSegments,
      `${label} must be one of ${renderAllowedValues(allowedValues)}.`
    );
    return undefined;
  }

  return value as T;
}

export function readOptionalPort(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): number | undefined {
  if (!(key in record) || record[key] === undefined) {
    return undefined;
  }

  const value = record[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65_535
  ) {
    pushIssue(
      issues,
      pathSegments,
      `${label} must be an integer between 1 and 65535.`
    );
    return undefined;
  }

  return value;
}

export function readOptionalPositiveInteger(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): number | undefined {
  return readOptionalInteger(record, key, pathSegments, issues, {
    message: `${label} must be a positive integer.`,
    minimum: 1
  });
}

export function readOptionalNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): number | undefined {
  return readOptionalInteger(record, key, pathSegments, issues, {
    message: `${label} must be a non-negative integer.`,
    minimum: 0
  });
}

function readOptionalInteger(
  record: Record<string, unknown>,
  key: string,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  options: {
    message: string;
    minimum: number;
  }
): number | undefined {
  if (!(key in record) || record[key] === undefined) {
    return undefined;
  }

  const value = record[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < options.minimum
  ) {
    pushIssue(issues, pathSegments, options.message);
    return undefined;
  }

  return value;
}

export function parseEnvironmentVariableArray(
  value: unknown,
  pathSegments: ManifestPath,
  issues: SymphonyRuntimeManifestIssue[],
  label: string
): string[] | undefined {
  if (value === undefined) {
    pushIssue(issues, pathSegments, `${label} must be an array.`);
    return undefined;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, pathSegments, `${label} must be an array.`);
    return undefined;
  }

  const checkpoint = startIssueCheckpoint(issues);
  const normalizedValues: string[] = [];

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") {
      pushIssue(
        issues,
        [...pathSegments, index],
        `${label}[${index}] must be a non-empty environment variable name.`
      );
      continue;
    }

    const normalized = entry.trim();
    if (normalized === "" || !environmentVariablePattern.test(normalized)) {
      pushIssue(
        issues,
        [...pathSegments, index],
        `${label}[${index}] must match ^[A-Z][A-Z0-9_]*$.`
      );
      continue;
    }

    normalizedValues.push(normalized);
  }

  return hasIssuesSince(issues, checkpoint) ? undefined : normalizedValues;
}

export { formatManifestPath };
