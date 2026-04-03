import type {
  SymphonyJsonObject,
  SymphonyJsonValue
} from "@symphony/run-journal";
import { isRecord } from "./records.js";

export function asJsonObject(value: unknown): SymphonyJsonObject | null {
  return isRecord(value) ? normalizeUnknownJsonObject(value) : null;
}

export function normalizeUnknownJsonObject(
  value: unknown
): SymphonyJsonObject {
  return normalizeUnknownJsonValue(value) as SymphonyJsonObject;
}

export function normalizeUnknownJsonValue(
  value: unknown
): SymphonyJsonValue {
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
