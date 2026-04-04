import type { JsonObject, JsonValue } from "@symphony/contracts";
import { isRecord } from "./records.js";

export function asJsonObject(value: unknown): JsonObject | null {
  return isRecord(value) ? normalizeUnknownJsonObject(value) : null;
}

export function normalizeUnknownJsonObject(
  value: unknown
): JsonObject {
  return normalizeUnknownJsonValue(value) as JsonObject;
}

export function normalizeUnknownJsonValue(
  value: unknown
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeUnknownJsonValue(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeUnknownJsonValue(nested)
      ])
    );
  }

  return String(value);
}
