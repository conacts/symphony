import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SymphonyLifecycleBindingScope } from "./lifecycle-binding-scope.js";
import { normalizeLifecycleBindingScope } from "./lifecycle-binding-scope.js";
import {
  loadIssueRecordMapByTrackerIssueId,
  requireIssueRecordByIdentifierForRepository,
  requireIssueRecordByTrackerIssueIdForRepository
} from "./issue-record-lookup.js";
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
    trackerIssueId: string;
    issueIdentifier?: string | null;
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
    bindingScope?: SymphonyLifecycleBindingScope | null;
  }
): SymphonyIssueTimelineStore {
  const repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");
  const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);

  return {
    async record(input) {
      const entryId = randomUUID();
      const eventType = sanitizeRequiredText(input.eventType, "eventType");
      const recordedAt = input.recordedAt ?? new Date().toISOString();
      const issue = requireIssueRecordByTrackerIssueIdForRepository({
        db,
        owner: "Issue timeline",
        repositoryKey,
        trackerIssueId: input.trackerIssueId,
        issueIdentifier: input.issueIdentifier
      });

      db.insert(symphonyIssueTimelineTable)
        .values({
          entryId,
          trackerIssueId: issue.trackerIssueId,
          runId: input.runId ?? null,
          turnId: input.turnId ?? null,
          source: input.source,
          eventType,
          message: input.message ?? null,
          payload: input.payload ?? null,
          recordedAt,
          insertedAt: recordedAt
        })
        .run();

      return entryId;
    },

    async listIssueTimeline(issueIdentifier, input = {}) {
      const limit = normalizeLimit(input.limit, 200);
      const issue = loadTimelineIssueOrNull({
        db,
        repositoryKey,
        bindingScope,
        issueIdentifier
      });

      if (!issue) {
        return [];
      }

      const rows = db
        .select()
        .from(symphonyIssueTimelineTable)
        .where(eq(symphonyIssueTimelineTable.trackerIssueId, issue.trackerIssueId))
        .orderBy(desc(symphonyIssueTimelineTable.recordedAt))
        .limit(limit)
        .all();
      const issueMap = loadIssueRecordMapByTrackerIssueId(db, [issue.trackerIssueId]);

      return rows.map((row) => {
        const timelineIssue = requireTimelineIssue(row, issueMap);

        return {
          entryId: row.entryId,
          repositoryKey: timelineIssue.repositoryKey,
          trackerIssueId: timelineIssue.trackerIssueId,
          issueIdentifier: timelineIssue.issueIdentifier,
          runId: row.runId ?? null,
          turnId: row.turnId ?? null,
          source: normalizeSource(row.source),
          eventType: row.eventType,
          message: row.message ?? null,
          payload: (row.payload ?? null) as JsonValue,
          recordedAt: row.recordedAt
        };
      });
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
    default:
      throw new TypeError(`Unknown issue timeline source: ${value}`);
  }
}

function loadTimelineIssueOrNull(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  repositoryKey: string;
  bindingScope: SymphonyLifecycleBindingScope | null;
  issueIdentifier: string;
}) {
  try {
    return requireIssueRecordByIdentifierForRepository({
      db: input.db,
      owner: "Issue timeline",
      repositoryKey: input.repositoryKey,
      bindingScope: input.bindingScope,
      issueIdentifier: input.issueIdentifier
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message === `Issue timeline issue not found: ${input.issueIdentifier.trim()}`
    ) {
      return null;
    }

    throw error;
  }
}

function requireTimelineIssue(
  row: typeof symphonyIssueTimelineTable.$inferSelect,
  issueMap: ReturnType<typeof loadIssueRecordMapByTrackerIssueId>
) {
  const issue = issueMap.get(row.trackerIssueId);
  if (!issue) {
    throw new TypeError(
      `Issue timeline issue not found for ${row.entryId}: ${row.trackerIssueId}`
    );
  }

  return issue;
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
