import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyRuntimeLogsTable } from "./schema.js";

export type SymphonyRuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type SymphonyRuntimeLogEntry = {
  entryId: string;
  repositoryKey: string | null;
  level: SymphonyRuntimeLogLevel;
  source: string;
  eventType: string;
  message: string;
  issueId: string | null;
  issueIdentifier: string | null;
  runId: string | null;
  payload: JsonValue;
  recordedAt: string;
};

export interface SymphonyRuntimeLogStore {
  record(input: {
    repositoryKey?: string | null;
    level: SymphonyRuntimeLogLevel;
    source: string;
    eventType: string;
    message: string;
    issueId?: string | null;
    issueIdentifier?: string | null;
    runId?: string | null;
    payload?: JsonValue;
    recordedAt?: string;
  }): Promise<string>;
  list(input?: {
    limit?: number;
    repositoryKey?: string;
    issueIdentifier?: string;
  }): Promise<SymphonyRuntimeLogEntry[]>;
}

export function createSymphonyRuntimeLogStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  input: {
    repositoryKey?: string;
  } = {}
): SymphonyRuntimeLogStore {
  const defaultRepositoryKey = sanitizeText(input.repositoryKey) ?? "default";

  return {
    async record(input) {
      const entryId = randomUUID();
      const recordedAt = input.recordedAt ?? new Date().toISOString();

      db.insert(symphonyRuntimeLogsTable).values({
        entryId,
        repositoryKey: sanitizeText(input.repositoryKey) ?? defaultRepositoryKey,
        level: input.level,
        source: input.source,
        eventType: input.eventType,
        message: input.message,
        issueId: input.issueId ?? null,
        issueIdentifier: input.issueIdentifier ?? null,
        runId: input.runId ?? null,
        payload: input.payload ?? null,
        recordedAt,
        insertedAt: recordedAt
      }).run();

      return entryId;
    },

    async list(input = {}) {
      const limit = normalizeLimit(input.limit, 200);
      const query = db
        .select()
        .from(symphonyRuntimeLogsTable)
        .orderBy(desc(symphonyRuntimeLogsTable.recordedAt))
        .limit(limit);

      const repositoryKey = sanitizeText(input.repositoryKey) ?? defaultRepositoryKey;

      const rows = input.issueIdentifier
        ? query.where(
            and(
              eq(symphonyRuntimeLogsTable.repositoryKey, repositoryKey),
              eq(symphonyRuntimeLogsTable.issueIdentifier, input.issueIdentifier)
            )
          ).all()
        : query.where(eq(symphonyRuntimeLogsTable.repositoryKey, repositoryKey)).all();

      return rows.map((row) => ({
        entryId: row.entryId,
        repositoryKey: row.repositoryKey ?? null,
        level: normalizeLevel(row.level),
        source: row.source,
        eventType: row.eventType,
        message: row.message,
        issueId: row.issueId ?? null,
        issueIdentifier: row.issueIdentifier ?? null,
        runId: row.runId ?? null,
        payload: (row.payload ?? null) as JsonValue,
        recordedAt: row.recordedAt
      }));
    }
  };
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Number.isInteger(limit) && limit !== undefined && limit > 0
    ? limit
    : fallback;
}

function normalizeLevel(value: string): SymphonyRuntimeLogLevel {
  switch (value) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value;
    default:
      return "info";
  }
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
