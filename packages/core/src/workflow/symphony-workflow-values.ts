import { isRecord } from "../internal/records.js";
import { normalizeIssueState } from "@symphony/tracker";
import { SymphonyWorkflowError } from "./symphony-workflow-errors.js";
import type { SymphonyWorkflowEnv } from "./symphony-workflow.js";

export function normalizeTrackerKind(value: unknown): "linear" | "memory" {
  const normalized = normalizeOptionalString(value);
  if (normalized === null) {
    throw new SymphonyWorkflowError(
      "missing_tracker_kind",
      "tracker.kind is required."
    );
  }

  if (normalized !== "linear" && normalized !== "memory") {
    throw new SymphonyWorkflowError(
      "unsupported_tracker_kind",
      `Unsupported tracker kind: ${normalized}`
    );
  }

  return normalized;
}

export function normalizeStateLimits(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [stateName, rawLimit] of Object.entries(value)) {
    const normalizedState = normalizeIssueState(stateName);
    if (normalizedState === "") {
      throw new SymphonyWorkflowError(
        "invalid_workflow_config",
        "agent.maxConcurrentAgentsByState state names must not be blank."
      );
    }

    result[normalizedState] = normalizePositiveInteger(
      rawLimit,
      Number.NaN,
      "agent.maxConcurrentAgentsByState"
    );
  }

  return result;
}

export function normalizeApprovalPolicy(
  value: unknown
): string | Record<string, unknown> {
  if (value === undefined) {
    return {
      reject: {
        sandbox_approval: true,
        rules: true,
        mcp_elicitations: true
      }
    };
  }

  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value)) {
    return normalizeObjectKeys(value);
  }

  throw new SymphonyWorkflowError(
    "invalid_workflow_config",
    "codex.approvalPolicy must be a string or map."
  );
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeStringArray(
  value: unknown,
  fallback: string[]
): string[] {
  if (value === undefined || value === null) {
    return [...fallback];
  }

  if (!Array.isArray(value)) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      "Expected an array of strings."
    );
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      throw new SymphonyWorkflowError(
        "invalid_workflow_config",
        "Expected an array of strings."
      );
    }

    const trimmed = entry.trim();
    return trimmed === "" ? [] : [trimmed];
  });
}

export function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      `${fieldName} must be a positive integer.`
    );
  }

  return value;
}

export function normalizeOptionalPositiveInteger(
  value: unknown,
  fieldName: string
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizePositiveInteger(value, Number.NaN, fieldName);
}

export function normalizeNonNegativeInteger(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SymphonyWorkflowError(
      "invalid_workflow_config",
      `${fieldName} must be a non-negative integer.`
    );
  }

  return value;
}

export function normalizeOptionalRecord(
  value: unknown
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return normalizeObjectKeys(value);
}

export function getNestedRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? normalizeObjectKeys(value) : {};
}

export function resolveEnvToken(
  value: unknown,
  env: SymphonyWorkflowEnv
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (!value.startsWith("$")) {
    return value;
  }

  return env[value.slice(1)];
}

export function normalizeObjectKeys(
  value: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeObjectKey(key);
    normalized[normalizedKey] = normalizeNestedValue(nestedValue);
  }

  return normalized;
}

function normalizeNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNestedValue(entry));
  }

  if (isRecord(value)) {
    return normalizeObjectKeys(value);
  }

  return value;
}

function normalizeObjectKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase()
  );
}
