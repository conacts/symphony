import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyRuntimeLogsTable } from "./schema.js";

export type SymphonyRuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type SymphonyRuntimeLogEntry = {
  entryId: string;
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
    issueIdentifier?: string;
  }): Promise<SymphonyRuntimeLogEntry[]>;
}

export function createSymphonyRuntimeLogStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): SymphonyRuntimeLogStore {
  return {
    async record(input) {
      const entryId = randomUUID();
      const recordedAt = input.recordedAt ?? new Date().toISOString();

      db.insert(symphonyRuntimeLogsTable).values({
        entryId,
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

      const rows = input.issueIdentifier
        ? query.where(
            eq(symphonyRuntimeLogsTable.issueIdentifier, input.issueIdentifier)
          ).all()
        : query.all();

      return rows.map((row) => ({
        entryId: row.entryId,
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
