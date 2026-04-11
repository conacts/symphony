import { desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createSymphonyIssueTimelineStore, type SymphonyIssueTimelineStore } from "./issue-timeline.js";
import {
  symphonyIssueDeliveryReportsTable,
  symphonyIssuesTable,
  symphonyRunsTable
} from "./schema.js";

export type SymphonyIssueDeliveryStatus = "completed" | "blocked" | "partial";
export type SymphonyIssueDeliverySource = "pi" | "runtime";

export type SymphonyIssueDeliveryReportRecord = {
  reportId: string;
  repositoryKey: string;
  trackerIssueId: string;
  issueIdentifier: string;
  runId: string;
  turnId: string | null;
  status: SymphonyIssueDeliveryStatus;
  summary: string;
  prUrl: string | null;
  prNumber: string | null;
  branchName: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
  source: SymphonyIssueDeliverySource;
  payload: JsonValue;
  reportedAt: string;
  insertedAt: string;
};

export interface SymphonyIssueDeliveryReportStore {
  record(input: {
    reportId: string;
    runId: string;
    turnId?: string | null;
    status: SymphonyIssueDeliveryStatus;
    summary: string;
    prUrl?: string | null;
    prNumber?: string | null;
    branchName?: string | null;
    blockingReason?: string | null;
    testsSummary?: string | null;
    source: SymphonyIssueDeliverySource;
    payload?: JsonValue;
    reportedAt: string;
  }): Promise<string>;
  listForIssue(
    issueIdentifier: string,
    input?: {
      limit?: number;
    }
  ): Promise<SymphonyIssueDeliveryReportRecord[]>;
  listForRun(
    runId: string,
    input?: {
      limit?: number;
    }
  ): Promise<SymphonyIssueDeliveryReportRecord[]>;
  fetchLatestForIssue(
    issueIdentifier: string
  ): Promise<SymphonyIssueDeliveryReportRecord | null>;
  fetchLatestForRun(runId: string): Promise<SymphonyIssueDeliveryReportRecord | null>;
}

export function createSymphonyIssueDeliveryReportStore(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  timelineStore?: SymphonyIssueTimelineStore;
  repositoryKey: string;
}): SymphonyIssueDeliveryReportStore {
  return new SqliteSymphonyIssueDeliveryReportStore(input);
}

class SqliteSymphonyIssueDeliveryReportStore implements SymphonyIssueDeliveryReportStore {
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #timelineStore: SymphonyIssueTimelineStore;
  readonly #repositoryKey: string;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    timelineStore?: SymphonyIssueTimelineStore;
    repositoryKey: string;
  }) {
    this.#db = input.db;
    this.#repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");
    this.#timelineStore =
      input.timelineStore ?? createSymphonyIssueTimelineStore(input.db, {
        repositoryKey: this.#repositoryKey
      });
  }

  async record(input: {
    reportId: string;
    runId: string;
    turnId?: string | null;
    status: SymphonyIssueDeliveryStatus;
    summary: string;
    prUrl?: string | null;
    prNumber?: string | null;
    branchName?: string | null;
    blockingReason?: string | null;
    testsSummary?: string | null;
    source: SymphonyIssueDeliverySource;
    payload?: JsonValue;
    reportedAt: string;
  }): Promise<string> {
    const reportId = sanitizeRequiredText(input.reportId, "reportId");
    const reportedAt = requireIsoTimestamp(input.reportedAt, "reportedAt");
    const source = input.source;
    const summary = sanitizeRequiredText(input.summary, "summary");
    const prUrl = sanitizeText(input.prUrl);
    const blockingReason = sanitizeText(input.blockingReason);

    if (input.status === "completed" && !prUrl) {
      throw new TypeError("Completed delivery reports require prUrl.");
    }

    if (input.status === "blocked" && !blockingReason) {
      throw new TypeError("Blocked delivery reports require blockingReason.");
    }
    const runId = sanitizeRequiredText(input.runId, "runId");
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      throw new TypeError(`Run not found for delivery report: ${runId}`);
    }
    if (run.repositoryKey !== this.#repositoryKey) {
      throw new TypeError(
        `Run ${runId} does not belong to repository ${this.#repositoryKey}.`
      );
    }

    this.#db.insert(symphonyIssueDeliveryReportsTable).values({
      reportId,
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId: sanitizeText(input.turnId),
      status: input.status,
      summary,
      prUrl,
      prNumber: sanitizeText(input.prNumber),
      branchName: sanitizeText(input.branchName),
      blockingReason,
      testsSummary: sanitizeText(input.testsSummary),
      source,
      payloadJson: input.payload ?? null,
      reportedAt,
      insertedAt: reportedAt
    }).run();

    await this.#timelineStore.record({
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId: input.turnId ?? null,
      source: "tracker",
      eventType: "delivery_reported",
      message: buildTimelineMessage(input.status),
      payload: {
        reportId,
        status: input.status,
        branchName: input.branchName ?? null,
        blockingReason
      },
      recordedAt: reportedAt
    });

    return reportId;
  }

  async listForIssue(
    issueIdentifier: string,
    input: {
      limit?: number;
    } = {}
  ): Promise<SymphonyIssueDeliveryReportRecord[]> {
    const rows = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(eq(symphonyIssueDeliveryReportsTable.issueIdentifier, issueIdentifier))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .limit(normalizeLimit(input.limit, 50))
      .all();

    const records = await Promise.all(rows.map((row) => this.#mapDeliveryReportRecord(row)));
    return records.filter((record) => record.repositoryKey === this.#repositoryKey);
  }

  async listForRun(
    runId: string,
    input: {
      limit?: number;
    } = {}
  ): Promise<SymphonyIssueDeliveryReportRecord[]> {
    const rows = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(eq(symphonyIssueDeliveryReportsTable.runId, runId))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .limit(normalizeLimit(input.limit, 50))
      .all();

    const records = await Promise.all(rows.map((row) => this.#mapDeliveryReportRecord(row)));
    return records.filter((record) => record.repositoryKey === this.#repositoryKey);
  }

  async fetchLatestForIssue(issueIdentifier: string): Promise<SymphonyIssueDeliveryReportRecord | null> {
    const row = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(eq(symphonyIssueDeliveryReportsTable.issueIdentifier, issueIdentifier))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .limit(1)
      .get();

    if (!row) {
      return null;
    }

    const record = await this.#mapDeliveryReportRecord(row);
    return record.repositoryKey === this.#repositoryKey ? record : null;
  }

  async fetchLatestForRun(runId: string): Promise<SymphonyIssueDeliveryReportRecord | null> {
    const row = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(eq(symphonyIssueDeliveryReportsTable.runId, runId))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .limit(1)
      .get();

    if (!row) {
      return null;
    }

    const record = await this.#mapDeliveryReportRecord(row);
    return record.repositoryKey === this.#repositoryKey ? record : null;
  }

  async #mapDeliveryReportRecord(
    row: typeof symphonyIssueDeliveryReportsTable.$inferSelect
  ): Promise<SymphonyIssueDeliveryReportRecord> {
    const issue = this.#db
      .select()
      .from(symphonyIssuesTable)
      .where(eq(symphonyIssuesTable.issueIdentifier, row.issueIdentifier))
      .get();

    if (!issue) {
      throw new TypeError(
        `Issue not found for delivery report ${row.reportId}: ${row.issueIdentifier}`
      );
    }

    return mapDeliveryReportRecord(row, issue);
  }
}

function mapDeliveryReportRecord(
  row: typeof symphonyIssueDeliveryReportsTable.$inferSelect,
  issue: typeof symphonyIssuesTable.$inferSelect
): SymphonyIssueDeliveryReportRecord {
  return {
    reportId: row.reportId,
    repositoryKey: issue.repositoryKey,
    trackerIssueId: issue.trackerIssueId,
    issueIdentifier: row.issueIdentifier,
    runId: row.runId,
    turnId: row.turnId ?? null,
    status: normalizeStatus(row.status),
    summary: row.summary,
    prUrl: row.prUrl ?? null,
    prNumber: row.prNumber ?? null,
    branchName: row.branchName ?? null,
    blockingReason: row.blockingReason ?? null,
    testsSummary: row.testsSummary ?? null,
    source: normalizeSource(row.source),
    payload: (row.payloadJson ?? null) as JsonValue,
    reportedAt: row.reportedAt,
    insertedAt: row.insertedAt
  };
}

function normalizeStatus(value: string): SymphonyIssueDeliveryStatus {
  switch (value) {
    case "completed":
    case "blocked":
    case "partial":
      return value;
    default:
      throw new TypeError(`Unknown delivery report status: ${value}`);
  }
}

function normalizeSource(value: string): SymphonyIssueDeliverySource {
  switch (value) {
    case "pi":
    case "runtime":
      return value;
    default:
      throw new TypeError(`Unknown delivery report source: ${value}`);
  }
}

function buildTimelineMessage(status: SymphonyIssueDeliveryStatus): string {
  switch (status) {
    case "completed":
      return "Delivery reported as completed.";
    case "blocked":
      return "Delivery reported as blocked.";
    case "partial":
    default:
      return "Delivery reported as partial.";
  }
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  const result = sanitizeText(value);

  if (!result) {
    throw new TypeError(`Delivery report ${field} is required.`);
  }

  return result;
}

function sanitizeText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Number.isInteger(limit) && limit !== undefined && limit > 0
    ? limit
    : fallback;
}

function requireIsoTimestamp(value: string, field: string): string {
  const normalized = sanitizeRequiredText(value, field);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Delivery report ${field} must be a valid ISO timestamp.`);
  }

  return new Date(parsed).toISOString();
}
