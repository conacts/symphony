import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  SymphonyAgentAnalyticsEvent,
  SymphonyAgentThreadItemStatus,
  SymphonyAgentThreadItemType,
  SymphonyEventAttrs,
  SymphonyIssueSummary,
  SymphonyJsonObject,
  SymphonyRunExport,
  SymphonyRunFinishAttrs,
  SymphonyRuntimeRunLedger,
  SymphonyRuntimeRunLedgerListOptions,
  SymphonyRuntimeRunLedgerRunsOptions,
  SymphonyRuntimeRunLedgerProblemRunsOptions,
  SymphonyRunStartAttrs,
  SymphonyRunSummary,
  SymphonyRunUpdateAttrs,
  SymphonyTurnFinishAttrs,
  SymphonyTurnStartAttrs,
  SymphonyTurnUpdateAttrs
} from "@symphony/runtime-run-ledger";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createSymphonyIssueTimelineStore, type SymphonyIssueTimelineStore } from "./issue-timeline.js";
import {
  createSqliteSymphonyRuntimeRunStore,
  type SymphonyRuntimeRunStore
} from "./runtime-run-store.js";
import {
  buildRuntimeIssueSummary,
  buildRuntimeRunSummary,
  isProblemOutcome
} from "./runtime-run-summary.js";
import {
  symphonyEventsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";
import type { SymphonyRuntimeRunStatus, SymphonyRuntimeTurnStatus } from "./runtime-run-types.js";

const defaultRetentionDays = 90;
const defaultPayloadMaxBytes = 64 * 1024;

export function createSqliteSymphonyRuntimeRunLedger(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  timelineStore?: SymphonyIssueTimelineStore;
  retentionDays?: number;
  payloadMaxBytes?: number;
  dbFile: string;
}): SymphonyRuntimeRunLedger {
  return new SqliteSymphonyRuntimeRunLedger(input);
}

class SqliteSymphonyRuntimeRunLedger implements SymphonyRuntimeRunLedger {
  readonly dbFile: string;
  readonly retentionDays: number;
  readonly payloadMaxBytes: number;
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #timelineStore: SymphonyIssueTimelineStore;
  readonly #runtimeRunStore: SymphonyRuntimeRunStore;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    timelineStore?: SymphonyIssueTimelineStore;
    retentionDays?: number;
    payloadMaxBytes?: number;
    dbFile: string;
  }) {
    this.#db = input.db;
    this.#timelineStore =
      input.timelineStore ?? createSymphonyIssueTimelineStore(input.db);
    this.#runtimeRunStore = createSqliteSymphonyRuntimeRunStore({
      db: input.db,
      timelineStore: this.#timelineStore
    });
    this.dbFile = input.dbFile;
    this.retentionDays = normalizePositiveInteger(
      input.retentionDays,
      defaultRetentionDays
    );
    this.payloadMaxBytes = normalizePositiveInteger(
      input.payloadMaxBytes,
      defaultPayloadMaxBytes
    );
  }

  async recordRunStarted(attrs: SymphonyRunStartAttrs): Promise<string> {
    return this.#runtimeRunStore.recordRunStarted({
      ...attrs,
      status: normalizeRuntimeRunStatus(attrs.status, "running")
    });
  }

  async recordTurnStarted(runId: string, attrs: SymphonyTurnStartAttrs): Promise<string> {
    return this.#runtimeRunStore.recordTurnStarted(runId, {
      ...attrs,
      status: normalizeRuntimeTurnStatus(attrs.status, "running")
    });
  }

  async recordEvent(runId: string, turnId: string, attrs: SymphonyEventAttrs): Promise<string> {
    const eventId = attrs.eventId ?? randomUUID();
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      throw new TypeError(`Run not found for event: ${runId}`);
    }

    const turn = this.#db
      .select()
      .from(symphonyTurnsTable)
      .where(
        and(
          eq(symphonyTurnsTable.turnId, turnId),
          eq(symphonyTurnsTable.runId, runId)
        )
      )
      .get();

    if (!turn) {
      throw new TypeError(`Turn not found for event: ${turnId}`);
    }

    const lastEvent = this.#db
      .select({
        eventSequence: symphonyEventsTable.eventSequence
      })
      .from(symphonyEventsTable)
      .where(eq(symphonyEventsTable.turnId, turnId))
      .orderBy(desc(symphonyEventsTable.eventSequence))
      .limit(1)
      .get();

    const eventSequence = attrs.eventSequence ?? (lastEvent?.eventSequence ?? 0) + 1;
    const truncatedPayload = truncatePayload(attrs.payload, this.payloadMaxBytes);
    const recordedAt = normalizeIsoTimestamp(attrs.recordedAt) ?? isoNow();

    this.#db.insert(symphonyEventsTable)
      .values({
        eventId,
        turnId,
        runId,
        eventSequence,
        eventType: attrs.eventType,
        itemType: deriveItemType(truncatedPayload.payload),
        itemStatus: deriveItemStatus(truncatedPayload.payload),
        recordedAt,
        payload: truncatedPayload.payload,
        payloadTruncated: truncatedPayload.payloadTruncated,
        payloadBytes: truncatedPayload.payloadBytes,
        summary: attrs.summary ? sanitizeText(attrs.summary) : null,
        threadId: attrs.threadId ?? attrs.threadId ?? null,
        agentTurnId: attrs.agentTurnId ?? attrs.agentTurnId ?? null,
        sessionId: attrs.sessionId ?? attrs.sessionId ?? null,
        insertedAt: isoNow()
      })
      .run();

    await this.#timelineStore.record({
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId,
      source: "agent",
      eventType: attrs.eventType,
      message: attrs.summary ? sanitizeText(attrs.summary) : null,
      payload: truncatedPayload.payload,
      recordedAt
    });

    return eventId;
  }

  async updateTurn(turnId: string, attrs: SymphonyTurnUpdateAttrs): Promise<void> {
    await this.#runtimeRunStore.updateTurn(turnId, {
      ...attrs,
      status: attrs.status ? normalizeRuntimeTurnStatus(attrs.status, "running") : undefined
    });
  }

  async finalizeTurn(turnId: string, attrs: SymphonyTurnFinishAttrs): Promise<void> {
    await this.#runtimeRunStore.finalizeTurn(turnId, {
      ...attrs,
      endedAt: attrs.endedAt ?? isoNow(),
      status: normalizeRuntimeTurnStatus(attrs.status, "completed")
    });
  }

  async updateRun(runId: string, attrs: SymphonyRunUpdateAttrs): Promise<void> {
    await this.#runtimeRunStore.updateRun(runId, {
      ...attrs,
      status: attrs.status ? normalizeRuntimeRunStatus(attrs.status, "running") : undefined
    });
  }

  async finalizeRun(runId: string, attrs: SymphonyRunFinishAttrs): Promise<void> {
    const existing = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!existing) {
      throw new TypeError(`Run not found for update: ${runId}`);
    }

    await this.#runtimeRunStore.finalizeRun(runId, {
      ...attrs,
      endedAt: attrs.endedAt ?? isoNow(),
      status: normalizeRuntimeRunStatus(attrs.status, "finished")
    });

    await this.#timelineStore.record({
      issueId: existing.issueId,
      issueIdentifier: existing.issueIdentifier,
      runId,
      source: "orchestrator",
      eventType: "run_finalized",
      message: attrs.outcome
        ? `Run finished with outcome ${attrs.outcome}.`
        : "Run finished.",
      payload: {
        outcome: attrs.outcome ?? null,
        status: attrs.status ?? "finished",
        errorClass: attrs.errorClass ?? null,
        errorMessage: attrs.errorMessage ?? null
      },
      recordedAt: normalizeIsoTimestamp(attrs.endedAt) ?? isoNow()
    });
  }

  async listIssues(opts: SymphonyRuntimeRunLedgerListOptions = {}): Promise<SymphonyIssueSummary[]> {
    const limit = normalizeLimit(opts.limit, 50);
    const issues = this.#db
      .select()
      .from(symphonyIssuesTable)
      .orderBy(desc(symphonyIssuesTable.latestRunStartedAt))
      .limit(limit)
      .all();
    const runs = this.#db.select().from(symphonyRunsTable).all();

    return issues.map((issue) => buildRuntimeIssueSummary(issue, runs));
  }

  async listRuns(opts: SymphonyRuntimeRunLedgerRunsOptions = {}): Promise<SymphonyRunSummary[]> {
    const limit = normalizeLimit(opts.limit, 200);
    const runs = this.#db
      .select()
      .from(symphonyRunsTable)
      .orderBy(desc(symphonyRunsTable.startedAt))
      .all();
    const turns = this.#db.select().from(symphonyTurnsTable).all();
    const events = this.#db.select().from(symphonyEventsTable).all();

    return runs
      .filter((run) => matchesRunFilters(run, opts))
      .slice(0, limit)
      .map((run) => buildRuntimeRunSummary(run, turns, events));
  }

  async listRunsForIssue(
    issueIdentifier: string,
    opts: SymphonyRuntimeRunLedgerListOptions = {}
  ): Promise<SymphonyRunSummary[]> {
    return this.listRuns({
      issueIdentifier,
      limit: opts.limit
    });
  }

  async listProblemRuns(
    opts: SymphonyRuntimeRunLedgerProblemRunsOptions = {}
  ): Promise<SymphonyRunSummary[]> {
    return this.listRuns({
      limit: opts.limit,
      outcome: opts.outcome,
      issueIdentifier: opts.issueIdentifier,
      problemOnly: true
    });
  }

  async fetchRunExport(runId: string): Promise<SymphonyRunExport | null> {
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      return null;
    }

    const issue = this.#db
      .select()
      .from(symphonyIssuesTable)
      .where(eq(symphonyIssuesTable.issueId, run.issueId))
      .get();

    if (!issue) {
      return null;
    }

    const turns = this.#db
      .select()
      .from(symphonyTurnsTable)
      .where(eq(symphonyTurnsTable.runId, runId))
      .orderBy(symphonyTurnsTable.turnSequence)
      .all();
    const events = this.#db
      .select()
      .from(symphonyEventsTable)
      .where(eq(symphonyEventsTable.runId, runId))
      .all();

    const exportedTurns = turns.map((turn) => ({
      ...turn,
      eventCount: events.filter((event) => event.turnId === turn.turnId).length,
      events: events
        .filter((event) => event.turnId === turn.turnId)
        .sort((left, right) => left.eventSequence - right.eventSequence)
    }));

    return {
      issue: buildRuntimeIssueSummary(issue, [run]),
      run: castRunRecord(run),
      turns: exportedTurns.map((turn) => castTurnExport(turn))
    };
  }

  async pruneRetention(now = new Date()): Promise<void> {
    const cutoffMs = now.getTime() - this.retentionDays * 24 * 60 * 60 * 1_000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    const retainedRuns = this.#db
      .select({ runId: symphonyRunsTable.runId, issueId: symphonyRunsTable.issueId })
      .from(symphonyRunsTable)
      .where(sql`${symphonyRunsTable.startedAt} >= ${cutoffIso}`)
      .all();
    const retainedRunIds = new Set(retainedRuns.map((row) => row.runId));
    const retainedIssueIds = new Set(retainedRuns.map((row) => row.issueId));

    const allTurns = this.#db.select().from(symphonyTurnsTable).all();
    const allEvents = this.#db.select().from(symphonyEventsTable).all();

    for (const event of allEvents) {
      if (!retainedRunIds.has(event.runId)) {
        this.#db.delete(symphonyEventsTable)
          .where(eq(symphonyEventsTable.eventId, event.eventId))
          .run();
      }
    }

    for (const turn of allTurns) {
      if (!retainedRunIds.has(turn.runId)) {
        this.#db.delete(symphonyTurnsTable)
          .where(eq(symphonyTurnsTable.turnId, turn.turnId))
          .run();
      }
    }

    for (const retainedRun of this.#db.select().from(symphonyRunsTable).all()) {
      if (!retainedRunIds.has(retainedRun.runId)) {
        this.#db.delete(symphonyRunsTable)
          .where(eq(symphonyRunsTable.runId, retainedRun.runId))
          .run();
      }
    }

    for (const issue of this.#db.select().from(symphonyIssuesTable).all()) {
      if (!retainedIssueIds.has(issue.issueId)) {
        this.#db.delete(symphonyIssuesTable)
          .where(eq(symphonyIssuesTable.issueId, issue.issueId))
          .run();
      }
    }
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return normalizePositiveInteger(limit, fallback);
}

function normalizeIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return null;
}

function isoNow(now = new Date()): string {
  return now.toISOString();
}

function normalizeRuntimeRunStatus(
  value: string | undefined,
  fallback: SymphonyRuntimeRunStatus
): SymphonyRuntimeRunStatus {
  switch (value) {
    case "dispatching":
    case "running":
    case "finished":
    case "paused":
    case "failed":
    case "startup_failed":
    case "rate_limited":
    case "stalled":
    case "stopped":
      return value;
    default:
      return fallback;
  }
}

function normalizeRuntimeTurnStatus(
  value: string | undefined,
  fallback: SymphonyRuntimeTurnStatus
): SymphonyRuntimeTurnStatus {
  switch (value) {
    case "running":
    case "completed":
    case "failed":
    case "stopped":
      return value;
    default:
      return fallback;
  }
}

function matchesRunFilters(
  run: typeof symphonyRunsTable.$inferSelect,
  opts: SymphonyRuntimeRunLedgerRunsOptions
): boolean {
  if (opts.issueIdentifier && run.issueIdentifier !== opts.issueIdentifier) {
    return false;
  }

  if (opts.outcome && run.outcome !== opts.outcome) {
    return false;
  }

  if (opts.errorClass && run.errorClass !== opts.errorClass) {
    return false;
  }

  if (opts.problemOnly && !isProblemOutcome(run.outcome)) {
    return false;
  }

  const startedAtMs = Date.parse(run.startedAt);

  if (opts.startedAfter) {
    const startedAfterMs = Date.parse(opts.startedAfter);

    if (!Number.isNaN(startedAtMs) && !Number.isNaN(startedAfterMs) && startedAtMs < startedAfterMs) {
      return false;
    }
  }

  if (opts.startedBefore) {
    const startedBeforeMs = Date.parse(opts.startedBefore);

    if (!Number.isNaN(startedAtMs) && !Number.isNaN(startedBeforeMs) && startedAtMs > startedBeforeMs) {
      return false;
    }
  }

  return true;
}

const secretKeyPattern = /(authorization|cookie|token|password|secret|api[_-]?key)/i;

function sanitizeText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/(OPENAI_API_KEY\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(password\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(token\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(session\s*=\s*)(\S+)/gi, "$1[REDACTED]");
}

function sanitizeJsonValue(value: unknown, keyHint?: string): unknown {
  if (typeof value === "string") {
    if (keyHint && secretKeyPattern.test(keyHint)) {
      if (keyHint.toLowerCase() === "authorization" && value.startsWith("Bearer ")) {
        return "Bearer [REDACTED]";
      }

      return "[REDACTED]";
    }

    return sanitizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sanitizeJsonValue(nestedValue, key)
      ])
    );
  }

  return value;
}

function truncatePayload(
  payload: SymphonyAgentAnalyticsEvent,
  payloadMaxBytes: number
): {
  payload: SymphonyAgentAnalyticsEvent;
  payloadBytes: number;
  payloadTruncated: boolean;
} {
  const sanitizedPayload = sanitizeJsonValue(payload) as SymphonyAgentAnalyticsEvent;
  const encoded = JSON.stringify(sanitizedPayload);
  const payloadBytes = Buffer.byteLength(encoded, "utf8");

  if (payloadBytes <= payloadMaxBytes) {
    return {
      payload: sanitizedPayload,
      payloadBytes,
      payloadTruncated: false
    };
  }

  for (const maxLength of [8192, 2048, 512, 128, 32, 0]) {
    const compactPayload = compactAnalyticsPayload(sanitizedPayload, maxLength);
    const compactEncoded = JSON.stringify(compactPayload);
    if (Buffer.byteLength(compactEncoded, "utf8") <= payloadMaxBytes) {
      return {
        payload: compactPayload,
        payloadBytes,
        payloadTruncated: true
      };
    }
  }

  return {
    payload: compactAnalyticsPayload(sanitizedPayload, 0),
    payloadBytes,
    payloadTruncated: true
  };
}

function compactAnalyticsPayload(
  payload: SymphonyAgentAnalyticsEvent,
  maxLength: number
): SymphonyAgentAnalyticsEvent {
  if (payload.type === "session.started") {
    return payload;
  }

  if (
    payload.type === "thread.started" ||
    payload.type === "turn.started" ||
    payload.type === "turn.completed" ||
    payload.type === "turn.failed" ||
    payload.type === "error"
  ) {
    return payload;
  }

  switch (payload.item.type) {
    case "command_execution":
      return {
        ...payload,
        item: {
          ...payload.item,
          aggregated_output: compactString(payload.item.aggregated_output, maxLength)
        }
      };
    case "agent_message":
      return {
        ...payload,
        item: {
          ...payload.item,
          text: compactString(payload.item.text, maxLength)
        }
      };
    case "reasoning":
      return {
        ...payload,
        item: {
          ...payload.item,
          text: compactString(payload.item.text, maxLength)
        }
      };
    case "error":
      return {
        ...payload,
        item: {
          ...payload.item,
          message: compactString(payload.item.message, maxLength)
        }
      };
    default:
      return payload;
  }
}

function compactString(value: string, maxLength = 8192): string {
  if (maxLength <= 0) {
    return `[TRUNCATED ${value.length} chars]`;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[TRUNCATED ${value.length - maxLength} chars]`;
}

function deriveItemType(
  payload: SymphonyAgentAnalyticsEvent
): SymphonyAgentThreadItemType | null {
  return "item" in payload ? payload.item.type : null;
}

function deriveItemStatus(
  payload: SymphonyAgentAnalyticsEvent
): SymphonyAgentThreadItemStatus {
  if (!("item" in payload)) {
    return null;
  }

  switch (payload.item.type) {
    case "command_execution":
    case "file_change":
    case "mcp_tool_call":
      return payload.item.status;
    default:
      return null;
  }
}

function castRunRecord(
  run: typeof symphonyRunsTable.$inferSelect
): SymphonyRunExport["run"] {
  return {
    ...run,
    repoStart: (run.repoStart ?? null) as SymphonyJsonObject | null,
    repoEnd: (run.repoEnd ?? null) as SymphonyJsonObject | null,
    metadata: (run.metadata ?? null) as SymphonyJsonObject | null
  };
}

function castTurnExport(
  turn: {
    eventCount: number;
    events: Array<typeof symphonyEventsTable.$inferSelect>;
  } & typeof symphonyTurnsTable.$inferSelect
): SymphonyRunExport["turns"][number] {
  return {
    ...turn,
    threadId: turn.threadId ?? null,
    agentTurnId: turn.agentTurnId ?? null,
    sessionId: turn.sessionId ?? null,
    usage: (turn.usage ?? null) as {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
    } | null,
    metadata: (turn.metadata ?? null) as SymphonyJsonObject | null,
    events: turn.events.map((event) => ({
      ...event,
      threadId: event.threadId ?? null,
      agentTurnId: event.agentTurnId ?? null,
      sessionId: event.sessionId ?? null,
      eventType: event.eventType as SymphonyRunExport["turns"][number]["events"][number]["eventType"],
      itemType: (event.itemType ?? null) as SymphonyRunExport["turns"][number]["events"][number]["itemType"],
      itemStatus: (event.itemStatus ?? null) as SymphonyRunExport["turns"][number]["events"][number]["itemStatus"],
      payload: event.payload as SymphonyRunExport["turns"][number]["events"][number]["payload"]
    }))
  };
}
