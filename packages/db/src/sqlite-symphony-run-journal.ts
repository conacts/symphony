import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  SymphonyEventAttrs,
  SymphonyIssueSummary,
  SymphonyJsonObject,
  SymphonyJsonValue,
  SymphonyRunExport,
  SymphonyRunFinishAttrs,
  SymphonyRunJournal,
  SymphonyRunJournalListOptions,
  SymphonyRunJournalRunsOptions,
  SymphonyRunJournalProblemRunsOptions,
  SymphonyRunStartAttrs,
  SymphonyRunSummary,
  SymphonyRunUpdateAttrs,
  SymphonyTurnFinishAttrs,
  SymphonyTurnStartAttrs,
  SymphonyTurnUpdateAttrs
} from "@symphony/core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createSymphonyIssueTimelineStore, type SymphonyIssueTimelineStore } from "./issue-timeline.js";
import {
  symphonyEventsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";

const completedOutcomes = new Set([
  "completed",
  "completed_turn_batch",
  "merged",
  "done"
]);

const defaultRetentionDays = 90;
const defaultPayloadMaxBytes = 64 * 1024;

export function createSqliteSymphonyRunJournal(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  timelineStore?: SymphonyIssueTimelineStore;
  retentionDays?: number;
  payloadMaxBytes?: number;
  dbFile: string;
}): SymphonyRunJournal {
  return new SqliteSymphonyRunJournal(input);
}

class SqliteSymphonyRunJournal implements SymphonyRunJournal {
  readonly dbFile: string;
  readonly retentionDays: number;
  readonly payloadMaxBytes: number;
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #timelineStore: SymphonyIssueTimelineStore;

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
    const runId = attrs.runId ?? randomUUID();
    const now = isoNow();
    const startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? now;

    this.#db.transaction((tx) => {
      const existingIssue = tx
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueId, attrs.issueId))
        .get();

      if (existingIssue) {
        tx.update(symphonyIssuesTable)
          .set({
            issueIdentifier: attrs.issueIdentifier,
            latestRunStartedAt:
              compareDescendingTimestamps(startedAt, existingIssue.latestRunStartedAt) < 0
                ? existingIssue.latestRunStartedAt
                : startedAt,
            updatedAt: now
          })
          .where(eq(symphonyIssuesTable.issueId, attrs.issueId))
          .run();
      } else {
        tx.insert(symphonyIssuesTable)
          .values({
            issueId: attrs.issueId,
            issueIdentifier: attrs.issueIdentifier,
            latestRunStartedAt: startedAt,
            insertedAt: now,
            updatedAt: now
          })
          .run();
      }

      tx.insert(symphonyRunsTable)
        .values({
          runId,
          issueId: attrs.issueId,
          issueIdentifier: attrs.issueIdentifier,
          attempt: attrs.attempt ?? null,
          status: attrs.status ?? "running",
          outcome: null,
          workerHost: attrs.workerHost ?? null,
          workspacePath: attrs.workspacePath ?? null,
          startedAt,
          endedAt: null,
          commitHashStart: attrs.commitHashStart ?? null,
          commitHashEnd: null,
          repoStart: sanitizeJsonObject(attrs.repoStart),
          repoEnd: null,
          metadata: sanitizeJsonObject(attrs.metadata),
          errorClass: null,
          errorMessage: null,
          insertedAt: now,
          updatedAt: now
        })
        .run();
    });

    await this.#timelineStore.record({
      issueId: attrs.issueId,
      issueIdentifier: attrs.issueIdentifier,
      runId,
      source: "orchestrator",
      eventType: "run_started",
      message: "Run dispatch started.",
      payload: {
        attempt: attrs.attempt ?? null,
        workspacePath: attrs.workspacePath ?? null,
        workerHost: attrs.workerHost ?? null
      },
      recordedAt: startedAt
    });

    return runId;
  }

  async recordTurnStarted(runId: string, attrs: SymphonyTurnStartAttrs): Promise<string> {
    const turnId = attrs.turnId ?? randomUUID();
    const now = isoNow();
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      throw new TypeError(`Run not found for turn start: ${runId}`);
    }

    const lastTurn = this.#db
      .select({
        turnSequence: symphonyTurnsTable.turnSequence
      })
      .from(symphonyTurnsTable)
      .where(eq(symphonyTurnsTable.runId, runId))
      .orderBy(desc(symphonyTurnsTable.turnSequence))
      .limit(1)
      .get();

    const turnSequence = attrs.turnSequence ?? (lastTurn?.turnSequence ?? 0) + 1;

    this.#db.insert(symphonyTurnsTable)
      .values({
        turnId,
        runId,
        turnSequence,
        codexThreadId: attrs.codexThreadId ?? null,
        codexTurnId: attrs.codexTurnId ?? null,
        codexSessionId: attrs.codexSessionId ?? null,
        promptText: sanitizeText(attrs.promptText),
        status: attrs.status ?? "running",
        startedAt: normalizeIsoTimestamp(attrs.startedAt) ?? now,
        endedAt: null,
        tokens: null,
        metadata: sanitizeJsonObject(attrs.metadata),
        insertedAt: now,
        updatedAt: now
      })
      .run();

    await this.#timelineStore.record({
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId,
      source: "codex",
      eventType: "turn_started",
      message: `Turn ${turnSequence} started.`,
      payload: {
        turnSequence,
        codexSessionId: attrs.codexSessionId ?? null
      },
      recordedAt: normalizeIsoTimestamp(attrs.startedAt) ?? now
    });

    return turnId;
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
    const truncatedPayload = truncatePayload(attrs.payload ?? null, this.payloadMaxBytes);
    const recordedAt = normalizeIsoTimestamp(attrs.recordedAt) ?? isoNow();

    this.#db.insert(symphonyEventsTable)
      .values({
        eventId,
        turnId,
        runId,
        eventSequence,
        eventType: attrs.eventType,
        recordedAt,
        payload: truncatedPayload.payload,
        payloadTruncated: truncatedPayload.payloadTruncated,
        payloadBytes: truncatedPayload.payloadBytes,
        summary: attrs.summary ? sanitizeText(attrs.summary) : null,
        codexThreadId: attrs.codexThreadId ?? null,
        codexTurnId: attrs.codexTurnId ?? null,
        codexSessionId: attrs.codexSessionId ?? null,
        insertedAt: isoNow()
      })
      .run();

    await this.#timelineStore.record({
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId,
      source: "codex",
      eventType: attrs.eventType,
      message: attrs.summary ? sanitizeText(attrs.summary) : null,
      payload: truncatedPayload.payload,
      recordedAt
    });

    return eventId;
  }

  async updateTurn(turnId: string, attrs: SymphonyTurnUpdateAttrs): Promise<void> {
    const existing = this.#db
      .select()
      .from(symphonyTurnsTable)
      .where(eq(symphonyTurnsTable.turnId, turnId))
      .get();

    if (!existing) {
      throw new TypeError(`Turn not found for update: ${turnId}`);
    }

    this.#db.update(symphonyTurnsTable)
      .set({
        status: attrs.status ?? existing.status,
        startedAt: normalizeIsoTimestamp(attrs.startedAt) ?? existing.startedAt,
        endedAt: normalizeIsoTimestamp(attrs.endedAt) ?? existing.endedAt,
        codexThreadId: attrs.codexThreadId ?? existing.codexThreadId,
        codexTurnId: attrs.codexTurnId ?? existing.codexTurnId,
        codexSessionId: attrs.codexSessionId ?? existing.codexSessionId,
        tokens: sanitizeJsonObject(attrs.tokens) ?? existing.tokens,
        metadata: mergeSanitizedJsonObjects(existing.metadata, attrs.metadata),
        updatedAt: isoNow()
      })
      .where(eq(symphonyTurnsTable.turnId, turnId))
      .run();
  }

  async finalizeTurn(turnId: string, attrs: SymphonyTurnFinishAttrs): Promise<void> {
    await this.updateTurn(turnId, {
      status: attrs.status ?? "completed",
      endedAt: attrs.endedAt,
      codexThreadId: attrs.codexThreadId,
      codexTurnId: attrs.codexTurnId,
      codexSessionId: attrs.codexSessionId,
      tokens: attrs.tokens,
      metadata: attrs.metadata
    });
  }

  async updateRun(runId: string, attrs: SymphonyRunUpdateAttrs): Promise<void> {
    const existing = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!existing) {
      throw new TypeError(`Run not found for update: ${runId}`);
    }

    const updatedAt = isoNow();

    this.#db.transaction((tx) => {
      tx.update(symphonyRunsTable)
        .set({
          status: attrs.status ?? existing.status,
          outcome: attrs.outcome ?? existing.outcome,
          workerHost: attrs.workerHost ?? existing.workerHost,
          workspacePath: attrs.workspacePath ?? existing.workspacePath,
          startedAt: normalizeIsoTimestamp(attrs.startedAt) ?? existing.startedAt,
          endedAt: normalizeIsoTimestamp(attrs.endedAt) ?? existing.endedAt,
          commitHashStart: attrs.commitHashStart ?? existing.commitHashStart,
          commitHashEnd: attrs.commitHashEnd ?? existing.commitHashEnd,
          repoStart: sanitizeJsonObject(attrs.repoStart) ?? existing.repoStart,
          repoEnd: sanitizeJsonObject(attrs.repoEnd) ?? existing.repoEnd,
          metadata: mergeSanitizedJsonObjects(existing.metadata, attrs.metadata),
          errorClass: attrs.errorClass ? sanitizeText(attrs.errorClass) : existing.errorClass,
          errorMessage: attrs.errorMessage
            ? sanitizeText(attrs.errorMessage)
            : existing.errorMessage,
          updatedAt
        })
        .where(eq(symphonyRunsTable.runId, runId))
        .run();

      tx.update(symphonyIssuesTable)
        .set({
          updatedAt
        })
        .where(eq(symphonyIssuesTable.issueId, existing.issueId))
        .run();
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

    await this.updateRun(runId, {
      status: attrs.status ?? "finished",
      outcome: attrs.outcome ?? null,
      endedAt: attrs.endedAt,
      commitHashEnd: attrs.commitHashEnd,
      repoEnd: attrs.repoEnd,
      metadata: attrs.metadata,
      errorClass: attrs.errorClass,
      errorMessage: attrs.errorMessage
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

  async listIssues(opts: SymphonyRunJournalListOptions = {}): Promise<SymphonyIssueSummary[]> {
    const limit = normalizeLimit(opts.limit, 50);
    const issues = this.#db
      .select()
      .from(symphonyIssuesTable)
      .orderBy(desc(symphonyIssuesTable.latestRunStartedAt))
      .limit(limit)
      .all();
    const runs = this.#db.select().from(symphonyRunsTable).all();

    return issues.map((issue) => buildIssueSummary(issue, runs));
  }

  async listRuns(opts: SymphonyRunJournalRunsOptions = {}): Promise<SymphonyRunSummary[]> {
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
      .map((run) => buildRunSummary(run, turns, events));
  }

  async listRunsForIssue(
    issueIdentifier: string,
    opts: SymphonyRunJournalListOptions = {}
  ): Promise<SymphonyRunSummary[]> {
    return this.listRuns({
      issueIdentifier,
      limit: opts.limit
    });
  }

  async listProblemRuns(
    opts: SymphonyRunJournalProblemRunsOptions = {}
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
      issue: buildIssueSummary(issue, [run]),
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

function compareDescendingTimestamps(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

function durationSeconds(
  startedAt: string | null,
  endedAt: string | null
): number | null {
  if (!startedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) {
    return null;
  }

  const endedMs = endedAt ? Date.parse(endedAt) : Date.now();
  if (Number.isNaN(endedMs)) {
    return null;
  }

  return Math.max(0, Math.floor((endedMs - startedMs) / 1_000));
}

function buildRunSummary(
  run: typeof symphonyRunsTable.$inferSelect,
  turns: Array<typeof symphonyTurnsTable.$inferSelect>,
  events: Array<typeof symphonyEventsTable.$inferSelect>
): SymphonyRunSummary {
  const runTurns = turns.filter((turn) => turn.runId === run.runId);
  const runEvents = events.filter((event) => event.runId === run.runId);
  const sortedEvents = [...runEvents].sort((left, right) => {
    const recordedAtOrder = compareDescendingTimestamps(left.recordedAt, right.recordedAt);

    if (recordedAtOrder !== 0) {
      return recordedAtOrder;
    }

    return right.eventSequence - left.eventSequence;
  });

  const lastEvent = sortedEvents[0];

  const tokenTotals = runTurns.reduce(
    (totals, turn) => {
      const turnTokens = parseTokenTotals(turn.tokens);

      return {
        inputTokens: totals.inputTokens + turnTokens.inputTokens,
        outputTokens: totals.outputTokens + turnTokens.outputTokens,
        totalTokens: totals.totalTokens + turnTokens.totalTokens
      };
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );

  return {
    runId: run.runId,
    issueId: run.issueId,
    issueIdentifier: run.issueIdentifier,
    attempt: run.attempt,
    status: run.status,
    outcome: run.outcome,
    workerHost: run.workerHost,
    workspacePath: run.workspacePath,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    commitHashStart: run.commitHashStart,
    commitHashEnd: run.commitHashEnd,
    turnCount: runTurns.length,
    eventCount: runEvents.length,
    lastEventType: lastEvent?.eventType ?? null,
    lastEventAt: lastEvent?.recordedAt ?? null,
    durationSeconds: durationSeconds(run.startedAt, run.endedAt),
    errorClass: run.errorClass ?? null,
    errorMessage: run.errorMessage ?? null,
    inputTokens: tokenTotals.inputTokens,
    outputTokens: tokenTotals.outputTokens,
    totalTokens: tokenTotals.totalTokens
  };
}

function buildIssueSummary(
  issue: typeof symphonyIssuesTable.$inferSelect,
  runs: Array<typeof symphonyRunsTable.$inferSelect>
): SymphonyIssueSummary {
  const issueRuns = runs
    .filter((run) => run.issueId === issue.issueId)
    .sort((left, right) => compareDescendingTimestamps(left.startedAt, right.startedAt));
  const latestRun = issueRuns[0];
  const latestProblemRun = issueRuns.find((run) => isProblemOutcome(run.outcome));
  const lastCompletedRun = issueRuns.find((run) => isCompletedOutcome(run.outcome));

  return {
    issueId: issue.issueId,
    issueIdentifier: issue.issueIdentifier,
    latestRunStartedAt: issue.latestRunStartedAt ?? null,
    latestRunId: latestRun?.runId ?? null,
    latestRunStatus: latestRun?.status ?? null,
    latestRunOutcome: latestRun?.outcome ?? null,
    runCount: issueRuns.length,
    latestProblemOutcome: latestProblemRun?.outcome ?? null,
    lastCompletedOutcome: lastCompletedRun?.outcome ?? null,
    insertedAt: issue.insertedAt ?? null,
    updatedAt: issue.updatedAt ?? null
  };
}

function isProblemRun(
  run: typeof symphonyRunsTable.$inferSelect,
  outcomeFilter?: string,
  issueIdentifierFilter?: string
): boolean {
  if (!run.outcome || completedOutcomes.has(run.outcome)) {
    return false;
  }

  if (outcomeFilter && run.outcome !== outcomeFilter) {
    return false;
  }

  if (issueIdentifierFilter && run.issueIdentifier !== issueIdentifierFilter) {
    return false;
  }

  return true;
}

function matchesRunFilters(
  run: typeof symphonyRunsTable.$inferSelect,
  opts: SymphonyRunJournalRunsOptions
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

function isProblemOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && !completedOutcomes.has(outcome);
}

function isCompletedOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && completedOutcomes.has(outcome);
}

function parseTokenTotals(tokens: SymphonyJsonObject | Record<string, unknown> | null): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const inputTokens = parseTokenCount(tokens?.inputTokens);
  const outputTokens = parseTokenCount(tokens?.outputTokens);
  const totalTokens = parseTokenCount(tokens?.totalTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens || inputTokens + outputTokens
  };
}

function parseTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
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

function sanitizeJsonObject(
  value: SymphonyJsonObject | Record<string, unknown> | null | undefined
): SymphonyJsonObject | null {
  if (!value) {
    return null;
  }

  return sanitizeJsonValue(value) as SymphonyJsonObject;
}

function mergeSanitizedJsonObjects(
  existing: Record<string, unknown> | null,
  next: SymphonyJsonObject | Record<string, unknown> | null | undefined
): SymphonyJsonObject | null {
  const sanitizedNext = sanitizeJsonObject(next);

  if (!sanitizedNext) {
    return (existing ?? null) as SymphonyJsonObject | null;
  }

  if (!existing) {
    return sanitizedNext;
  }

  return {
    ...(existing as SymphonyJsonObject),
    ...sanitizedNext
  };
}

function truncatePayload(
  payload: unknown,
  payloadMaxBytes: number
): {
  payload: SymphonyJsonValue;
  payloadBytes: number;
  payloadTruncated: boolean;
} {
  const sanitizedPayload = sanitizeJsonValue(payload) as SymphonyJsonValue;
  const encoded = JSON.stringify(sanitizedPayload);
  const payloadBytes = Buffer.byteLength(encoded, "utf8");

  if (payloadBytes <= payloadMaxBytes) {
    return {
      payload: sanitizedPayload,
      payloadBytes,
      payloadTruncated: false
    };
  }

  return {
    payload: {
      truncated: true,
      preview: encoded.slice(0, payloadMaxBytes),
      originalBytes: payloadBytes
    } as SymphonyJsonObject,
    payloadBytes,
    payloadTruncated: true
  };
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
    tokens: (turn.tokens ?? null) as SymphonyJsonObject | null,
    metadata: (turn.metadata ?? null) as SymphonyJsonObject | null,
    events: turn.events.map((event) => ({
      ...event,
      payload: event.payload as SymphonyJsonValue
    }))
  };
}
