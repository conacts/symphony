export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

export function getPath(
  value: UnknownRecord | null | undefined,
  path: Array<string | number>
): unknown {
  let current: unknown = value;

  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return null;
      }

      current = current[segment];
      continue;
    }

    const record = asRecord(current);
    if (!record) {
      return null;
    }

    current = record[segment];
  }

  return current;
}

export function getRecord(
  value: UnknownRecord | null | undefined,
  key: string
): UnknownRecord | null {
  return asRecord(value?.[key]);
}

export function getRecordPath(
  value: UnknownRecord | null | undefined,
  path: Array<string | number>
): UnknownRecord | null {
  return asRecord(getPath(value, path));
}

export function getArrayPath(
  value: UnknownRecord | null | undefined,
  path: Array<string | number>
): unknown[] {
  const nested = getPath(value, path);
  return Array.isArray(nested) ? nested : [];
}

export function getString(
  value: UnknownRecord | null | undefined,
  key: string
): string | null {
  return readString(value?.[key]);
}

export function getStringPath(
  value: UnknownRecord | null | undefined,
  path: Array<string | number>
): string | null {
  return readString(getPath(value, path));
}

export function getBooleanPath(
  value: UnknownRecord | null | undefined,
  path: Array<string | number>
): boolean | null {
  const nested = getPath(value, path);
  return typeof nested === "boolean" ? nested : null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
