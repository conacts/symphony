import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyIssuesTable, symphonyRuntimeLogsTable } from "./schema.js";

export type SymphonyRuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type SymphonyRuntimeLogEntry = {
  entryId: string;
  repositoryKey: string | null;
  level: SymphonyRuntimeLogLevel;
  source: string;
  eventType: string;
  message: string;
  trackerIssueId: string | null;
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
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  input: {
    repositoryKey: string;
  }
): SymphonyRuntimeLogStore {
  const repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");

  return {
    async record(input) {
      const entryId = randomUUID();
      const source = sanitizeRequiredText(input.source, "source");
      const eventType = sanitizeRequiredText(input.eventType, "eventType");
      const message = sanitizeRequiredText(input.message, "message");
      const issueIdentifier =
        input.issueIdentifier === undefined || input.issueIdentifier === null
          ? null
          : sanitizeRequiredText(input.issueIdentifier, "issueIdentifier");
      const recordedAt = input.recordedAt ?? new Date().toISOString();

      if (issueIdentifier) {
        requireRuntimeLogIssueBinding({
          db,
          issueIdentifier,
          repositoryKey
        });
      }

      db.insert(symphonyRuntimeLogsTable).values({
        entryId,
        repositoryKey,
        level: input.level,
        source,
        eventType,
        message,
        issueIdentifier,
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
            and(
              eq(symphonyRuntimeLogsTable.repositoryKey, repositoryKey),
              eq(symphonyRuntimeLogsTable.issueIdentifier, input.issueIdentifier)
            )
          ).all()
        : query.where(eq(symphonyRuntimeLogsTable.repositoryKey, repositoryKey)).all();

      const issueIdentifiers = [...new Set(rows.flatMap((row) => row.issueIdentifier ?? []))];
      const issueMap = new Map(
        (issueIdentifiers.length === 0
          ? []
          : db
              .select()
              .from(symphonyIssuesTable)
              .where(inArray(symphonyIssuesTable.issueIdentifier, issueIdentifiers))
              .all()
        ).map((row) => [row.issueIdentifier, row] as const)
      );

      return rows.map((row) => {
        const issue = requireRuntimeLogIssue(row, issueMap);

        return {
          entryId: row.entryId,
          repositoryKey: row.repositoryKey,
          level: normalizeLevel(row.level),
          source: row.source,
          eventType: row.eventType,
          message: row.message,
          trackerIssueId: issue?.trackerIssueId ?? null,
          issueIdentifier: row.issueIdentifier ?? null,
          runId: row.runId ?? null,
          payload: (row.payload ?? null) as JsonValue,
          recordedAt: row.recordedAt
        };
      });
    }
  };
}

function requireRuntimeLogIssue(
  row: typeof symphonyRuntimeLogsTable.$inferSelect,
  issueMap: Map<string, typeof symphonyIssuesTable.$inferSelect>
) {
  if (!row.issueIdentifier) {
    return null;
  }

  const issue = issueMap.get(row.issueIdentifier);
  if (!issue) {
    throw new TypeError(
      `Runtime log issue not found for ${row.entryId}: ${row.issueIdentifier}`
    );
  }

  if (issue.repositoryKey !== row.repositoryKey) {
    throw new TypeError(
      `Runtime log repository mismatch for ${row.entryId}: ${row.issueIdentifier} is bound to ${issue.repositoryKey}, not ${row.repositoryKey}.`
    );
  }

  return issue;
}

function requireRuntimeLogIssueBinding(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  issueIdentifier: string;
  repositoryKey: string;
}) {
  const issue = input.db
    .select()
    .from(symphonyIssuesTable)
    .where(eq(symphonyIssuesTable.issueIdentifier, input.issueIdentifier))
    .get();

  if (!issue) {
    throw new TypeError(
      `Runtime log issue not found: ${input.issueIdentifier}`
    );
  }

  if (issue.repositoryKey !== input.repositoryKey) {
    throw new TypeError(
      `Runtime log repository mismatch for ${input.issueIdentifier}: ${issue.repositoryKey} is not ${input.repositoryKey}.`
    );
  }
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
      throw new TypeError(`Unknown runtime log level: ${value}`);
  }
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  const normalized = sanitizeText(value);

  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
