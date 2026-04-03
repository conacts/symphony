import type { SymphonyJsonObject } from "@symphony/run-journal";
import { asJsonObject } from "./internal/json.js";
import { asRecord, isRecord } from "./internal/records.js";

export type SymphonyCodexStateUpdate = {
  event: string;
  payload?: unknown;
};

export type SymphonyStallTrackedEntry = {
  lastCodexTimestamp: string | null;
  startedAt: string;
};

export function runtimeSeconds(startedAt: string, now: Date): number {
  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1_000));
}

export function extractTokenUsage(
  update: SymphonyCodexStateUpdate
):
  | {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  | null {
  if (!update.payload || typeof update.payload !== "object") {
    return null;
  }

  const payload = update.payload as Record<string, unknown>;
  const usage =
    absoluteTokenUsageFromPayload(payload) ??
    turnCompletedUsageFromPayload(update, payload);

  if (!usage) {
    return null;
  }

  return extractTokenCountRecord(usage);
}

export function extractRateLimits(
  update: SymphonyCodexStateUpdate
): SymphonyJsonObject | null {
  if (!update.payload || typeof update.payload !== "object") {
    return null;
  }

  return rateLimitsFromPayload(update.payload);
}

export function stallElapsedMs(
  runningEntry: SymphonyStallTrackedEntry,
  now: Date
): number | null {
  const lastActivity = runningEntry.lastCodexTimestamp ?? runningEntry.startedAt;
  const lastActivityMs = Date.parse(lastActivity);

  if (Number.isNaN(lastActivityMs)) {
    return null;
  }

  return Math.max(0, now.getTime() - lastActivityMs);
}

export function isTerminalTurnEvent(event: string): boolean {
  return (
    event === "turn_completed" ||
    event === "turn_failed" ||
    event === "turn_cancelled"
  );
}

function absoluteTokenUsageFromPayload(
  payload: Record<string, unknown>
): Record<string, unknown> | null {
  const candidates = [
    mapAtPath(payload, ["params", "msg", "payload", "info", "total_token_usage"]),
    mapAtPath(payload, ["params", "msg", "info", "total_token_usage"]),
    mapAtPath(payload, ["params", "tokenUsage", "total"]),
    mapAtPath(payload, ["tokenUsage", "total"])
  ];

  return candidates.find((candidate) => candidate && integerTokenMap(candidate)) ?? null;
}

function turnCompletedUsageFromPayload(
  update: SymphonyCodexStateUpdate,
  payload: Record<string, unknown>
): Record<string, unknown> | null {
  if (update.event !== "turn_completed") {
    return null;
  }

  const directUsage =
    mapAtPath(payload, ["usage"]) ?? mapAtPath(payload, ["params", "usage"]);

  return directUsage && integerTokenMap(directUsage) ? directUsage : null;
}

function extractTokenCountRecord(
  total: Record<string, unknown>
): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  return {
    inputTokens: toInteger(
      total.inputTokens ?? total.input_tokens ?? total.prompt_tokens
    ),
    outputTokens: toInteger(
      total.outputTokens ?? total.output_tokens ?? total.completion_tokens
    ),
    totalTokens: toInteger(total.totalTokens ?? total.total_tokens)
  };
}

function rateLimitsFromPayload(payload: unknown): SymphonyJsonObject | null {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const nested = rateLimitsFromPayload(entry);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const direct = payload.rate_limits ?? payload.rateLimits;
  if (rateLimitsMap(direct)) {
    return normalizeUnknownJsonObject(direct);
  }

  if (rateLimitsMap(payload)) {
    return normalizeUnknownJsonObject(payload);
  }

  for (const value of Object.values(payload)) {
    const nested = rateLimitsFromPayload(value);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function rateLimitsMap(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const limitId =
    value.limit_id ??
    value.limitId ??
    value.limit_name ??
    value.limitName;
  const hasBuckets =
    "primary" in value || "secondary" in value || "credits" in value;

  return !isNilish(limitId) && hasBuckets;
}

function integerTokenMap(value: Record<string, unknown>): boolean {
  return (
    "totalTokens" in value ||
    "total_tokens" in value ||
    "inputTokens" in value ||
    "input_tokens" in value ||
    "prompt_tokens" in value ||
    "outputTokens" in value ||
    "output_tokens" in value ||
    "completion_tokens" in value
  );
}

function mapAtPath(
  value: Record<string, unknown>,
  path: string[]
): Record<string, unknown> | null {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[segment];
  }

  return asRecord(current);
}

function normalizeUnknownJsonObject(value: unknown): SymphonyJsonObject {
  const normalized = asJsonObject(value);
  return normalized ?? {};
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function isNilish(value: unknown): boolean {
  return value === null || value === undefined;
}
