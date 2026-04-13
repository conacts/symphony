import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  normalizeLifecycleBindingScope,
  type SymphonyLifecycleBindingScope
} from "./lifecycle-binding-scope.js";
import {
  loadIssueRecordMapByTrackerIssueId,
  requireIssueRecordByIdentifierForRepository,
  requireIssueRecordByTrackerIssueIdForRepository
} from "./issue-record-lookup.js";
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
  record(
    input:
      | {
          level: SymphonyRuntimeLogLevel;
          source: string;
          eventType: string;
          message: string;
          trackerIssueId: string;
          issueIdentifier?: string | null;
          runId?: string | null;
          payload?: JsonValue;
          recordedAt?: string;
        }
      | {
          level: SymphonyRuntimeLogLevel;
          source: string;
          eventType: string;
          message: string;
          trackerIssueId?: null | undefined;
          issueIdentifier?: null | undefined;
          runId?: string | null;
          payload?: JsonValue;
          recordedAt?: string;
        }
  ): Promise<string>;
  list(input?: {
    limit?: number;
    repo?: string;
    issueIdentifier?: string;
  }): Promise<SymphonyRuntimeLogEntry[]>;
}

export function createSymphonyRuntimeLogStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  input: {
    repositoryKey: string;
    bindingScope?: SymphonyLifecycleBindingScope | null;
  }
): SymphonyRuntimeLogStore {
  const repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");
  const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);

  return {
    async record(input) {
      const entryId = randomUUID();
      const source = sanitizeRequiredText(input.source, "source");
      const eventType = sanitizeRequiredText(input.eventType, "eventType");
      const message = sanitizeRequiredText(input.message, "message");
      const trackerIssueId = sanitizeText(input.trackerIssueId);
      const issueIdentifier =
        input.issueIdentifier === undefined || input.issueIdentifier === null
          ? null
          : sanitizeRequiredText(input.issueIdentifier, "issueIdentifier");
      const recordedAt = input.recordedAt ?? new Date().toISOString();
      const issue =
        trackerIssueId
          ? requireRuntimeLogIssueBinding({
              db,
              trackerIssueId,
              issueIdentifier,
              repositoryKey
            })
          : issueIdentifier
            ? (() => {
                throw new TypeError(
                  "Runtime log trackerIssueId is required when issueIdentifier is provided."
                );
              })()
          : null;

      db.insert(symphonyRuntimeLogsTable).values({
        entryId,
        repositoryKey,
        level: input.level,
        source,
        eventType,
        message,
        trackerIssueId: issue?.trackerIssueId ?? null,
        runId: input.runId ?? null,
        payload: input.payload ?? null,
        recordedAt,
        insertedAt: recordedAt
      }).run();

      return entryId;
    },

    async list(input = {}) {
      const limit = normalizeLimit(input.limit, 200);
      if (input.repo && input.repo !== repositoryKey) {
        return [];
      }

      const query = db
        .select()
        .from(symphonyRuntimeLogsTable)
        .orderBy(desc(symphonyRuntimeLogsTable.recordedAt))
        .limit(limit);

      const rows = input.issueIdentifier
        ? (() => {
            const issue = loadRuntimeLogIssueOrNull({
              db,
              repositoryKey,
              bindingScope,
              issueIdentifier: input.issueIdentifier
            });
            if (!issue) {
              return [];
            }

            return query
              .where(
                and(
                  eq(symphonyRuntimeLogsTable.repositoryKey, repositoryKey),
                  eq(symphonyRuntimeLogsTable.trackerIssueId, issue.trackerIssueId)
                )
              )
              .all();
          })()
        : query.where(eq(symphonyRuntimeLogsTable.repositoryKey, repositoryKey)).all();

      const trackerIssueIds = [...new Set(
        rows.flatMap((row) => (row.trackerIssueId ? [row.trackerIssueId] : []))
      )];
      const issueMap = loadIssueRecordMapByTrackerIssueId(db, trackerIssueIds);

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
          issueIdentifier: issue?.issueIdentifier ?? null,
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
  if (!row.trackerIssueId) {
    return null;
  }

  const issue = issueMap.get(row.trackerIssueId);
  if (!issue) {
    throw new TypeError(
      `Runtime log issue not found for ${row.entryId}: ${row.trackerIssueId}`
    );
  }

  if (issue.repositoryKey !== row.repositoryKey) {
    throw new TypeError(
      `Runtime log repository mismatch for ${row.entryId}: ${issue.issueIdentifier} is bound to ${issue.repositoryKey}, not ${row.repositoryKey}.`
    );
  }

  return issue;
}

function requireRuntimeLogIssueBinding(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  trackerIssueId: string;
  issueIdentifier: string | null;
  repositoryKey: string;
}) {
  return requireIssueRecordByTrackerIssueIdForRepository({
    db: input.db,
    owner: "Runtime log",
    repositoryKey: input.repositoryKey,
    trackerIssueId: input.trackerIssueId,
    issueIdentifier: input.issueIdentifier
  });
}

function loadRuntimeLogIssueOrNull(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  repositoryKey: string;
  bindingScope: SymphonyLifecycleBindingScope | null;
  issueIdentifier: string;
}) {
  try {
    return requireIssueRecordByIdentifierForRepository({
      db: input.db,
      owner: "Runtime log",
      issueIdentifier: input.issueIdentifier,
      repositoryKey: input.repositoryKey,
      bindingScope: input.bindingScope
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message === `Runtime log issue not found: ${input.issueIdentifier.trim()}`
    ) {
      return null;
    }

    throw error;
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
