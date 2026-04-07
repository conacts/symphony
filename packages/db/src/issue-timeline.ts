import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyIssueTimelineTable } from "./schema.js";

export type SymphonyIssueTimelineSource =
  | "orchestrator"
  | "agent"
  | "tracker"
  | "workspace"
  | "runtime";

export type SymphonyIssueTimelineEntry = {
  entryId: string;
  repositoryKey: string;
  issueId: string;
  issueIdentifier: string;
  runId: string | null;
  turnId: string | null;
  source: SymphonyIssueTimelineSource;
  eventType: string;
  message: string | null;
  payload: JsonValue;
  recordedAt: string;
};

export interface SymphonyIssueTimelineStore {
  record(input: {
    repositoryKey?: string;
    issueId: string;
    issueIdentifier: string;
    runId?: string | null;
    turnId?: string | null;
    source: SymphonyIssueTimelineSource;
    eventType: string;
    message?: string | null;
    payload?: JsonValue;
    recordedAt?: string;
  }): Promise<string>;
  listIssueTimeline(
    issueIdentifier: string,
    input?: {
      limit?: number;
      repositoryKey?: string;
    }
  ): Promise<SymphonyIssueTimelineEntry[]>;
}

export function createSymphonyIssueTimelineStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  input: {
    repositoryKey?: string;
  } = {}
): SymphonyIssueTimelineStore {
  const defaultRepositoryKey = sanitizeRequiredText(
    input.repositoryKey ?? "default",
    "repositoryKey"
  );

  return {
    async record(input) {
      const entryId = randomUUID();
      const recordedAt = input.recordedAt ?? new Date().toISOString();

      db.insert(symphonyIssueTimelineTable).values({
        entryId,
        repositoryKey: sanitizeRequiredText(
          input.repositoryKey ?? defaultRepositoryKey,
          "repositoryKey"
        ),
        issueId: input.issueId,
        issueIdentifier: input.issueIdentifier,
        runId: input.runId ?? null,
        turnId: input.turnId ?? null,
        source: input.source,
        eventType: input.eventType,
        message: input.message ?? null,
        payload: input.payload ?? null,
        recordedAt,
        insertedAt: recordedAt
      }).run();

      return entryId;
    },

    async listIssueTimeline(issueIdentifier, input = {}) {
      const limit = normalizeLimit(input.limit, 200);
      const repositoryKey = sanitizeRequiredText(
        input.repositoryKey ?? defaultRepositoryKey,
        "repositoryKey"
      );

      const rows = db
        .select()
        .from(symphonyIssueTimelineTable)
        .where(
          and(
            eq(symphonyIssueTimelineTable.repositoryKey, repositoryKey),
            eq(symphonyIssueTimelineTable.issueIdentifier, issueIdentifier)
          )
        )
        .orderBy(desc(symphonyIssueTimelineTable.recordedAt))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        entryId: row.entryId,
        repositoryKey: row.repositoryKey,
        issueId: row.issueId,
        issueIdentifier: row.issueIdentifier,
        runId: row.runId ?? null,
        turnId: row.turnId ?? null,
        source: normalizeSource(row.source),
        eventType: row.eventType,
        message: row.message ?? null,
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

function normalizeSource(value: string): SymphonyIssueTimelineSource {
  switch (value) {
    case "orchestrator":
    case "agent":
    case "tracker":
    case "workspace":
    case "runtime":
      return value;
    case "codex":
      return "agent";
    default:
      return "runtime";
  }
}

function sanitizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
