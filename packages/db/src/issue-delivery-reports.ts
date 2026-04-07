import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { JsonValue } from "@symphony/contracts";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createSymphonyIssueTimelineStore, type SymphonyIssueTimelineStore } from "./issue-timeline.js";
import { symphonyIssueDeliveryReportsTable } from "./schema.js";

export type SymphonyIssueDeliveryStatus = "completed" | "blocked" | "partial";

export type SymphonyIssueDeliveryReportRecord = {
  reportId: string;
  issueId: string;
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
  source: string;
  payload: JsonValue;
  reportedAt: string;
  insertedAt: string;
};

export interface SymphonyIssueDeliveryReportStore {
  record(input: {
    issueId: string;
    issueIdentifier: string;
    runId: string;
    turnId?: string | null;
    status: SymphonyIssueDeliveryStatus;
    summary: string;
    prUrl?: string | null;
    prNumber?: string | null;
    branchName?: string | null;
    blockingReason?: string | null;
    testsSummary?: string | null;
    source?: string;
    payload?: JsonValue;
    reportedAt?: string;
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
  fetchLatestForIssue(issueIdentifier: string): Promise<SymphonyIssueDeliveryReportRecord | null>;
  fetchLatestForRun(runId: string): Promise<SymphonyIssueDeliveryReportRecord | null>;
}

export function createSymphonyIssueDeliveryReportStore(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  timelineStore?: SymphonyIssueTimelineStore;
}): SymphonyIssueDeliveryReportStore {
  return new SqliteSymphonyIssueDeliveryReportStore(input);
}

class SqliteSymphonyIssueDeliveryReportStore implements SymphonyIssueDeliveryReportStore {
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #timelineStore: SymphonyIssueTimelineStore;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    timelineStore?: SymphonyIssueTimelineStore;
  }) {
    this.#db = input.db;
    this.#timelineStore =
      input.timelineStore ?? createSymphonyIssueTimelineStore(input.db);
  }

  async record(input: {
    issueId: string;
    issueIdentifier: string;
    runId: string;
    turnId?: string | null;
    status: SymphonyIssueDeliveryStatus;
    summary: string;
    prUrl?: string | null;
    prNumber?: string | null;
    branchName?: string | null;
    blockingReason?: string | null;
    testsSummary?: string | null;
    source?: string;
    payload?: JsonValue;
    reportedAt?: string;
  }): Promise<string> {
    const reportId = randomUUID();
    const reportedAt = normalizeIsoTimestamp(input.reportedAt) ?? new Date().toISOString();
    const source = sanitizeText(input.source) ?? "pi";
    const summary = sanitizeRequiredText(input.summary, "summary");
    const prUrl = sanitizeText(input.prUrl);
    const blockingReason = sanitizeText(input.blockingReason);

    if (input.status === "completed" && !prUrl) {
      throw new TypeError("Completed delivery reports require prUrl.");
    }

    if (input.status === "blocked" && !blockingReason) {
      throw new TypeError("Blocked delivery reports require blockingReason.");
    }

    this.#db.insert(symphonyIssueDeliveryReportsTable).values({
      reportId,
      issueId: sanitizeRequiredText(input.issueId, "issueId"),
      issueIdentifier: sanitizeRequiredText(input.issueIdentifier, "issueIdentifier"),
      runId: sanitizeRequiredText(input.runId, "runId"),
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
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      runId: input.runId,
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

    return rows.map(mapDeliveryReportRecord);
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

    return rows.map(mapDeliveryReportRecord);
  }

  async fetchLatestForIssue(issueIdentifier: string): Promise<SymphonyIssueDeliveryReportRecord | null> {
    const row = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(eq(symphonyIssueDeliveryReportsTable.issueIdentifier, issueIdentifier))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .limit(1)
      .get();

    return row ? mapDeliveryReportRecord(row) : null;
  }

  async fetchLatestForRun(runId: string): Promise<SymphonyIssueDeliveryReportRecord | null> {
    const row = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(eq(symphonyIssueDeliveryReportsTable.runId, runId))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .limit(1)
      .get();

    return row ? mapDeliveryReportRecord(row) : null;
  }
}

function mapDeliveryReportRecord(
  row: typeof symphonyIssueDeliveryReportsTable.$inferSelect
): SymphonyIssueDeliveryReportRecord {
  return {
    reportId: row.reportId,
    issueId: row.issueId,
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
    source: row.source,
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
      return "partial";
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

function sanitizeRequiredText(value: string, field: string): string {
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

function normalizeIsoTimestamp(value: string | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}
