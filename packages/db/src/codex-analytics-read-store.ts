import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  isThreadEvent,
  previewItem,
  previewText,
  type ThreadEvent
} from "@symphony/codex-analytics";
import type { JsonObject } from "@symphony/contracts";
import type {
  SymphonyEventRecord,
  SymphonyIssueRecord,
  SymphonyIssueSummary,
  SymphonyRunExport,
  SymphonyRunJournalListOptions,
  SymphonyRunJournalProblemRunsOptions,
  SymphonyRunJournalRunsOptions,
  SymphonyRunRecord,
  SymphonyRunSummary,
  SymphonyTurnRecord
} from "@symphony/run-journal";
import {
  codexEventLogTable,
  codexPayloadOverflowTable,
  codexRunsTable,
  codexTurnsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;

export interface CodexAnalyticsReadStore {
  listIssues(opts?: SymphonyRunJournalListOptions): Promise<SymphonyIssueSummary[]>;
  listRuns(opts?: SymphonyRunJournalRunsOptions): Promise<SymphonyRunSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: SymphonyRunJournalListOptions
  ): Promise<SymphonyRunSummary[]>;
  listProblemRuns(
    opts?: SymphonyRunJournalProblemRunsOptions
  ): Promise<SymphonyRunSummary[]>;
  fetchRunExport(runId: string): Promise<SymphonyRunExport | null>;
}

export function createSqliteCodexAnalyticsReadStore(input: {
  db: BetterSQLite3Database<SymphonyDbShape>;
}): CodexAnalyticsReadStore {
  return new SqliteCodexAnalyticsReadStore(input.db);
}

class SqliteCodexAnalyticsReadStore implements CodexAnalyticsReadStore {
  readonly #db: BetterSQLite3Database<SymphonyDbShape>;

  constructor(db: BetterSQLite3Database<SymphonyDbShape>) {
    this.#db = db;
  }

  async listIssues(
    opts: SymphonyRunJournalListOptions = {}
  ): Promise<SymphonyIssueSummary[]> {
    const limit = normalizeLimit(opts.limit, 50);
    const issues = this.#db
      .select()
      .from(symphonyIssuesTable)
      .orderBy(desc(symphonyIssuesTable.latestRunStartedAt))
      .limit(limit)
      .all();
    const runs = this.#db.select().from(symphonyRunsTable).all().map(castRunRecord);

    return issues.map((issue) => buildIssueSummary(castIssueRecord(issue), runs));
  }

  async listRuns(
    opts: SymphonyRunJournalRunsOptions = {}
  ): Promise<SymphonyRunSummary[]> {
    const limit = normalizeLimit(opts.limit, 200);
    const runs = this.#db
      .select()
      .from(symphonyRunsTable)
      .orderBy(desc(symphonyRunsTable.startedAt))
      .all()
      .map(castRunRecord)
      .filter((run) => matchesRunFilters(run, opts))
      .slice(0, limit);

    if (runs.length === 0) {
      return [];
    }

    const runIds = runs.map((run) => run.runId);
    const codexRuns = this.#db
      .select()
      .from(codexRunsTable)
      .where(inArray(codexRunsTable.runId, runIds))
      .all();
    const eventCounts = this.#db
      .select({
        runId: codexEventLogTable.runId,
        count: sql<number>`count(*)`
      })
      .from(codexEventLogTable)
      .where(inArray(codexEventLogTable.runId, runIds))
      .groupBy(codexEventLogTable.runId)
      .all();

    const codexRunMap = new Map(codexRuns.map((run) => [run.runId, run] as const));
    const eventCountMap = new Map(eventCounts.map((row) => [row.runId, row.count] as const));

    return runs.map((run) =>
      buildRunSummaryFromCodex(
        run,
        codexRunMap.get(run.runId),
        eventCountMap.get(run.runId) ?? 0
      )
    );
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

    const codexRun = this.#db
      .select()
      .from(codexRunsTable)
      .where(eq(codexRunsTable.runId, runId))
      .get();

    if (!codexRun) {
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

    const [symphonyTurns, codexTurns, eventRows] = await Promise.all([
      this.#db
        .select()
        .from(symphonyTurnsTable)
        .where(eq(symphonyTurnsTable.runId, runId))
        .orderBy(asc(symphonyTurnsTable.turnSequence))
        .all(),
      this.#db
        .select()
        .from(codexTurnsTable)
        .where(eq(codexTurnsTable.runId, runId))
        .all(),
      this.#db
        .select()
        .from(codexEventLogTable)
        .where(eq(codexEventLogTable.runId, runId))
        .orderBy(asc(codexEventLogTable.sequence))
        .all()
    ]);

    if (codexTurns.length === 0 && eventRows.length === 0) {
      return null;
    }

    const overflowIds = eventRows
      .map((row) => row.payloadOverflowId)
      .filter((value): value is string => typeof value === "string");
    const overflowRows =
      overflowIds.length === 0
        ? []
        : this.#db
            .select()
            .from(codexPayloadOverflowTable)
            .where(inArray(codexPayloadOverflowTable.id, overflowIds))
            .all();
    const overflowMap = new Map(overflowRows.map((row) => [row.id, row] as const));
    const codexTurnMap = new Map(codexTurns.map((turn) => [turn.turnId, turn] as const));

    const events: SymphonyEventRecord[] = eventRows.flatMap((row) => {
      const payload = resolveEventPayload(row, overflowMap);

      if (!row.turnId || !payload) {
        return [];
      }

      return [
        {
          eventId: row.id,
          turnId: row.turnId,
          runId: row.runId,
          eventSequence: row.sequence,
          eventType: row.eventType as SymphonyEventRecord["eventType"],
          itemType: deriveItemType(payload),
          itemStatus: deriveItemStatus(payload),
          recordedAt: row.recordedAt,
          payload: payload as SymphonyEventRecord["payload"],
          payloadTruncated: row.payloadTruncated,
          payloadBytes: byteLength(JSON.stringify(payload)),
          summary: summarizeEvent(payload),
          codexThreadId:
            row.threadId ??
            codexTurnMap.get(row.turnId)?.threadId ??
            codexRun.threadId ??
            null,
          codexTurnId: row.turnId,
          codexSessionId: null,
          insertedAt: row.insertedAt
        }
      ];
    });

    const turns = buildTurnRecords({
      run,
      symphonyTurns,
      codexTurns,
      codexRunThreadId: codexRun.threadId ?? null
    });

    return buildRunExport(
      buildIssueSummary(castIssueRecord(issue), [castRunRecord(run)]),
      castRunRecord(run),
      turns,
      events
    );
  }
}

function buildTurnRecords(input: {
  run: typeof symphonyRunsTable.$inferSelect;
  symphonyTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  codexTurns: Array<typeof codexTurnsTable.$inferSelect>;
  codexRunThreadId: string | null;
}): SymphonyTurnRecord[] {
  const codexTurnMap = new Map(
    input.codexTurns.map((turn) => [turn.turnId, turn] as const)
  );
  const knownTurnIds = new Set(input.symphonyTurns.map((turn) => turn.turnId));
  const baseTurns = input.symphonyTurns.map((turn) =>
    castTurnRecord(turn, codexTurnMap.get(turn.turnId), input.codexRunThreadId)
  );
  const maxTurnSequence = baseTurns.reduce(
    (max, turn) => Math.max(max, turn.turnSequence),
    0
  );
  const syntheticTurns = input.codexTurns
    .filter((turn) => !knownTurnIds.has(turn.turnId))
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map((turn, index) => synthesizeTurnRecord(input.run, turn, maxTurnSequence + index + 1));

  return [...baseTurns, ...syntheticTurns];
}

function resolveEventPayload(
  row: typeof codexEventLogTable.$inferSelect,
  overflowMap: Map<string, typeof codexPayloadOverflowTable.$inferSelect>
): ThreadEvent | null {
  const inlinePayload = row.payloadJson;

  if (isThreadEvent(inlinePayload)) {
    return inlinePayload;
  }

  if (!row.payloadOverflowId) {
    return null;
  }

  const overflowRow = overflowMap.get(row.payloadOverflowId);
  return isThreadEvent(overflowRow?.contentJson) ? overflowRow.contentJson : null;
}

function castIssueRecord(
  issue: typeof symphonyIssuesTable.$inferSelect
): SymphonyIssueRecord {
  return {
    issueId: issue.issueId,
    issueIdentifier: issue.issueIdentifier,
    latestRunStartedAt: issue.latestRunStartedAt,
    insertedAt: issue.insertedAt,
    updatedAt: issue.updatedAt
  };
}

function castRunRecord(
  run: typeof symphonyRunsTable.$inferSelect
): SymphonyRunRecord {
  return {
    ...run,
    repoStart: castJsonObject(run.repoStart),
    repoEnd: castJsonObject(run.repoEnd),
    metadata: castJsonObject(run.metadata)
  };
}

function buildRunSummaryFromCodex(
  run: SymphonyRunRecord,
  codexRun: typeof codexRunsTable.$inferSelect | undefined,
  eventCount: number
): SymphonyRunSummary {
  const inputTokens = codexRun?.inputTokens ?? 0;
  const outputTokens = codexRun?.outputTokens ?? 0;

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
    turnCount: codexRun?.turnCount ?? 0,
    eventCount,
    lastEventType: codexRun?.latestEventType ?? null,
    lastEventAt: codexRun?.latestEventAt ?? null,
    durationSeconds: computeDurationSeconds(run.startedAt, run.endedAt),
    errorClass: run.errorClass ?? null,
    errorMessage: run.errorMessage ?? null,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

function castTurnRecord(
  turn: typeof symphonyTurnsTable.$inferSelect,
  codexTurn: typeof codexTurnsTable.$inferSelect | undefined,
  codexRunThreadId: string | null
): SymphonyTurnRecord {
  return {
    ...turn,
    codexThreadId: codexTurn?.threadId ?? turn.codexThreadId ?? codexRunThreadId,
    usage: buildUsage(codexTurn, turn.usage),
    metadata: castJsonObject(turn.metadata)
  };
}

function synthesizeTurnRecord(
  run: typeof symphonyRunsTable.$inferSelect,
  codexTurn: typeof codexTurnsTable.$inferSelect,
  turnSequence: number
): SymphonyTurnRecord {
  return {
    turnId: codexTurn.turnId,
    runId: codexTurn.runId,
    turnSequence,
    codexThreadId: codexTurn.threadId ?? null,
    codexTurnId: codexTurn.turnId,
    codexSessionId: null,
    // Keep the transcript readable if a legacy prompt row is absent.
    promptText: "[codex prompt unavailable]",
    status: codexTurn.status,
    startedAt: codexTurn.startedAt ?? run.startedAt,
    endedAt: codexTurn.endedAt ?? null,
    usage: buildUsage(codexTurn, null),
    metadata: null,
    insertedAt: codexTurn.insertedAt,
    updatedAt: codexTurn.updatedAt
  };
}

function buildUsage(
  codexTurn: typeof codexTurnsTable.$inferSelect | undefined,
  legacyUsage: unknown
): SymphonyTurnRecord["usage"] {
  if (codexTurn) {
    const usage = {
      input_tokens: codexTurn.inputTokens,
      cached_input_tokens: codexTurn.cachedInputTokens,
      output_tokens: codexTurn.outputTokens
    };

    if (
      codexTurn.status !== "running" ||
      usage.input_tokens > 0 ||
      usage.cached_input_tokens > 0 ||
      usage.output_tokens > 0
    ) {
      return usage;
    }
  }

  if (!legacyUsage || typeof legacyUsage !== "object" || Array.isArray(legacyUsage)) {
    return null;
  }

  const value = legacyUsage as Record<string, unknown>;
  return typeof value.input_tokens === "number" &&
    typeof value.cached_input_tokens === "number" &&
    typeof value.output_tokens === "number"
    ? {
        input_tokens: value.input_tokens,
        cached_input_tokens: value.cached_input_tokens,
        output_tokens: value.output_tokens
      }
    : null;
}

function castJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function deriveItemType(
  payload: ThreadEvent
): SymphonyEventRecord["itemType"] {
  switch (payload.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      return payload.item.type as SymphonyEventRecord["itemType"];
    default:
      return null;
  }
}

function deriveItemStatus(
  payload: ThreadEvent
): SymphonyEventRecord["itemStatus"] {
  switch (payload.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      switch (payload.item.type) {
        case "command_execution":
        case "file_change":
        case "mcp_tool_call":
          return payload.item.status as SymphonyEventRecord["itemStatus"];
        default:
          return null;
      }
    default:
      return null;
  }
}

function summarizeEvent(payload: ThreadEvent): string | null {
  switch (payload.type) {
    case "thread.started":
      return previewText(payload.thread_id);
    case "turn.completed":
      return previewText(
        `input=${payload.usage.input_tokens} output=${payload.usage.output_tokens}`
      );
    case "turn.failed":
      return previewText(payload.error.message);
    case "item.started":
    case "item.updated":
    case "item.completed":
      return previewItem(payload.item);
    case "error":
      return previewText(payload.message);
    case "turn.started":
      return null;
  }
}

function compareNullableIso(left: string | null, right: string | null): number {
  const leftValue = left ? Date.parse(left) : Number.POSITIVE_INFINITY;
  const rightValue = right ? Date.parse(right) : Number.POSITIVE_INFINITY;

  if (leftValue !== rightValue) {
    return leftValue - rightValue;
  }

  return (left ?? "").localeCompare(right ?? "");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeLimit(limit: number | undefined, fallback = 50): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.floor(limit));
}

function computeDurationSeconds(
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

function isCompletedOutcome(outcome: string | null): boolean {
  return (
    outcome === "completed" ||
    outcome === "completed_turn_batch"
  );
}

function isProblemOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && !isCompletedOutcome(outcome);
}

function matchesRunFilters(
  run: SymphonyRunRecord,
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

function buildIssueSummary(
  issue: SymphonyIssueRecord,
  runs: SymphonyRunRecord[]
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

function buildRunExport(
  issue: SymphonyIssueSummary,
  run: SymphonyRunRecord,
  turns: SymphonyTurnRecord[],
  events: SymphonyEventRecord[]
): SymphonyRunExport {
  const runTurns = turns
    .filter((turn) => turn.runId === run.runId)
    .sort((left, right) => left.turnSequence - right.turnSequence);

  return {
    issue,
    run,
    turns: runTurns.map((turn) => {
      const turnEvents = events
        .filter((event) => event.turnId === turn.turnId)
        .sort((left, right) => left.eventSequence - right.eventSequence);

      return {
        ...turn,
        eventCount: turnEvents.length,
        events: turnEvents
      };
    })
  };
}

function compareDescendingTimestamps(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}
