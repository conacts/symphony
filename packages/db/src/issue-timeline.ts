import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyIssueTimelineTable, symphonyIssuesTable } from "./schema.js";

export type SymphonyIssueTimelineSource =
  | "orchestrator"
  | "agent"
  | "tracker"
  | "workspace"
  | "runtime";

export type SymphonyIssueTimelineEntry = {
  entryId: string;
  repositoryKey: string;
  trackerIssueId: string;
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
    }
  ): Promise<SymphonyIssueTimelineEntry[]>;
}

export function createSymphonyIssueTimelineStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  input: {
    repositoryKey: string;
  }
): SymphonyIssueTimelineStore {
  const repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");

  return {
    async record(input) {
      const entryId = randomUUID();
      const recordedAt = input.recordedAt ?? new Date().toISOString();

      db.insert(symphonyIssueTimelineTable).values({
        entryId,
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

      const rows = db
        .select()
        .from(symphonyIssueTimelineTable)
        .where(eq(symphonyIssueTimelineTable.issueIdentifier, issueIdentifier))
        .orderBy(desc(symphonyIssueTimelineTable.recordedAt))
        .limit(limit)
        .all();

      const issue = db
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueIdentifier, issueIdentifier))
        .get();

      if (!issue || issue.repositoryKey !== repositoryKey) {
        return [];
      }

      return rows.map((row) => ({
        entryId: row.entryId,
        repositoryKey: issue.repositoryKey,
        trackerIssueId: issue.trackerIssueId,
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

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} is required.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
