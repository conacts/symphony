import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  isThreadEvent,
  previewItem,
  previewText,
  type ThreadEvent
} from "@symphony/codex-analytics";
import type {
  JsonObject,
  SymphonyCodexAgentMessageRecord,
  SymphonyCodexCommandExecutionRecord,
  SymphonyCodexEventRecord,
  SymphonyCodexFileChangeRecord,
  SymphonyCodexItemLifecycleStatus,
  SymphonyCodexItemRecord,
  SymphonyCodexRunQuery,
  SymphonyCodexReasoningRecord,
  SymphonyCodexRunArtifactsResult,
  SymphonyCodexRunRecord,
  SymphonyCodexRunStatus,
  SymphonyCodexRunTurnQuery,
  SymphonyCodexToolCallRecord,
  SymphonyCodexTurnStatus,
  SymphonyCodexTurnRecord,
  SymphonyForensicsIssueQuery,
  SymphonyForensicsProblemRunsQuery,
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsRunsQuery,
  SymphonyForensicsRunSummary,
} from "@symphony/contracts";
import {
  codexEventLogTable,
  codexAgentMessagesTable,
  codexCommandExecutionsTable,
  codexFileChangesTable,
  codexItemsTable,
  codexPayloadOverflowTable,
  codexReasoningTable,
  codexRunsTable,
  codexToolCallsTable,
  codexTurnsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;

export interface CodexAnalyticsReadStore {
  listRuns(opts?: SymphonyForensicsRunsQuery): Promise<SymphonyForensicsRunSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: Partial<SymphonyForensicsIssueQuery>
  ): Promise<SymphonyForensicsRunSummary[]>;
  listProblemRuns(
    opts?: Partial<SymphonyForensicsProblemRunsQuery>
  ): Promise<SymphonyForensicsRunSummary[]>;
  fetchRunDetail(runId: SymphonyCodexRunQuery["runId"]): Promise<SymphonyForensicsRunDetailResult | null>;
  fetchRunArtifacts(
    runId: SymphonyCodexRunQuery["runId"]
  ): Promise<SymphonyCodexRunArtifactsResult | null>;
  listTurns(runId: SymphonyCodexRunQuery["runId"]): Promise<SymphonyCodexTurnRecord[]>;
  listItems(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexItemRecord[]>;
  listCommandExecutions(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexCommandExecutionRecord[]>;
  listToolCalls(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexToolCallRecord[]>;
  listAgentMessages(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexAgentMessageRecord[]>;
  listReasoning(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexReasoningRecord[]>;
  listFileChanges(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexFileChangeRecord[]>;
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

  async listRuns(
    opts: SymphonyForensicsRunsQuery = {}
  ): Promise<SymphonyForensicsRunSummary[]> {
    const limit = normalizeLimit(opts.limit, 200);
    const runs = this.#db
      .select()
      .from(symphonyRunsTable)
      .orderBy(desc(symphonyRunsTable.startedAt))
      .all()
      .map(mapPersistedRunRecord)
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
      buildForensicsRunSummary(
        run,
        codexRunMap.get(run.runId),
        eventCountMap.get(run.runId) ?? 0
      )
    );
  }

  async listRunsForIssue(
    issueIdentifier: string,
    opts: Partial<SymphonyForensicsIssueQuery> = {}
  ): Promise<SymphonyForensicsRunSummary[]> {
    return this.listRuns({
      issueIdentifier,
      limit: opts.limit
    });
  }

  async listProblemRuns(
    opts: Partial<SymphonyForensicsProblemRunsQuery> = {}
  ): Promise<SymphonyForensicsRunSummary[]> {
    return this.listRuns({
      limit: opts.limit,
      outcome: opts.outcome,
      issueIdentifier: opts.issueIdentifier,
      problemOnly: true
    });
  }

  async fetchRunDetail(
    runId: SymphonyCodexRunQuery["runId"]
  ): Promise<SymphonyForensicsRunDetailResult | null> {
    const data = await loadRunData(this.#db, runId);

    if (!data) {
      return null;
    }

    const turns = buildForensicsTurns(data);
    const allEvents = turns.flatMap((turn) => turn.events);
    const lastEvent = [...allEvents].sort((left, right) => {
      const recordedAtOrder = (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "");

      if (recordedAtOrder !== 0) {
        return recordedAtOrder;
      }

      return right.eventSequence - left.eventSequence;
    })[0];

    return {
      issue: buildForensicsIssueExport(data.issue, data.issueRuns),
      run: {
        ...buildForensicsRunSummary(
          mapPersistedRunRecord(data.run),
          data.codexRun,
          data.eventRows.length
        ),
        repoStart: castJsonObject(data.run.repoStart),
        repoEnd: castJsonObject(data.run.repoEnd),
        metadata: castJsonObject(data.run.metadata),
        insertedAt: data.run.insertedAt,
        updatedAt: data.run.updatedAt,
        turnCount: turns.length,
        eventCount: allEvents.length,
        lastEventType: lastEvent?.eventType ?? null,
        lastEventAt: lastEvent?.recordedAt ?? null
      },
      turns
    };
  }

  async fetchRunArtifacts(
    runId: SymphonyCodexRunQuery["runId"]
  ): Promise<SymphonyCodexRunArtifactsResult | null> {
    const data = await loadRunData(this.#db, runId);

    if (!data) {
      return null;
    }

    return {
      run: mapCodexRunRecord(data.codexRun),
      turns: mapCodexTurnRecords(data.codexTurns),
      items: data.itemRows.map(mapCodexItemRecord),
      commandExecutions: data.commandRows.map(mapCodexCommandExecutionRecord),
      toolCalls: data.toolRows.map(mapCodexToolCallRecord),
      agentMessages: data.agentMessageRows.map(mapCodexAgentMessageRecord),
      reasoning: data.reasoningRows.map(mapCodexReasoningRecord),
      fileChanges: data.fileChangeRows.map(mapCodexFileChangeRecord),
      events: mapCodexEventRecords(data.eventRows, data.overflowMap, data.codexTurnMap, data.codexRun)
    };
  }

  async listTurns(runId: SymphonyCodexRunQuery["runId"]): Promise<SymphonyCodexTurnRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexTurnsTable)
      .where(eq(codexTurnsTable.runId, runId))
      .orderBy(asc(codexTurnsTable.startedAt))
      .all();

    return mapCodexTurnRecords(rows);
  }

  async listItems(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexItemRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexItemsTable)
      .where(
        input.turnId
          ? and(
              eq(codexItemsTable.runId, input.runId),
              eq(codexItemsTable.turnId, input.turnId)
            )
          : eq(codexItemsTable.runId, input.runId)
      )
      .orderBy(asc(codexItemsTable.insertedAt))
      .all();

    return rows.map(mapCodexItemRecord);
  }

  async listCommandExecutions(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexCommandExecutionRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexCommandExecutionsTable)
      .where(
        input.turnId
          ? and(
              eq(codexCommandExecutionsTable.runId, input.runId),
              eq(codexCommandExecutionsTable.turnId, input.turnId)
            )
          : eq(codexCommandExecutionsTable.runId, input.runId)
      )
      .orderBy(asc(codexCommandExecutionsTable.insertedAt))
      .all();

    return rows.map(mapCodexCommandExecutionRecord);
  }

  async listToolCalls(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexToolCallRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexToolCallsTable)
      .where(
        input.turnId
          ? and(
              eq(codexToolCallsTable.runId, input.runId),
              eq(codexToolCallsTable.turnId, input.turnId)
            )
          : eq(codexToolCallsTable.runId, input.runId)
      )
      .orderBy(asc(codexToolCallsTable.insertedAt))
      .all();

    return rows.map(mapCodexToolCallRecord);
  }

  async listAgentMessages(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexAgentMessageRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexAgentMessagesTable)
      .where(
        input.turnId
          ? and(
              eq(codexAgentMessagesTable.runId, input.runId),
              eq(codexAgentMessagesTable.turnId, input.turnId)
            )
          : eq(codexAgentMessagesTable.runId, input.runId)
      )
      .orderBy(asc(codexAgentMessagesTable.insertedAt))
      .all();

    return rows.map(mapCodexAgentMessageRecord);
  }

  async listReasoning(input: SymphonyCodexRunTurnQuery): Promise<SymphonyCodexReasoningRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexReasoningTable)
      .where(
        input.turnId
          ? and(
              eq(codexReasoningTable.runId, input.runId),
              eq(codexReasoningTable.turnId, input.turnId)
            )
          : eq(codexReasoningTable.runId, input.runId)
      )
      .orderBy(asc(codexReasoningTable.insertedAt))
      .all();

    return rows.map(mapCodexReasoningRecord);
  }

  async listFileChanges(
    input: SymphonyCodexRunTurnQuery
  ): Promise<SymphonyCodexFileChangeRecord[]> {
    const rows = await this.#db
      .select()
      .from(codexFileChangesTable)
      .where(
        input.turnId
          ? and(
              eq(codexFileChangesTable.runId, input.runId),
              eq(codexFileChangesTable.turnId, input.turnId)
            )
          : eq(codexFileChangesTable.runId, input.runId)
      )
      .orderBy(asc(codexFileChangesTable.recordedAt))
      .all();

    return rows.map(mapCodexFileChangeRecord);
  }
}

type PersistedRunRecord = typeof symphonyRunsTable.$inferSelect & {
  repoStart: JsonObject | null;
  repoEnd: JsonObject | null;
  metadata: JsonObject | null;
};

type ForensicsTurn = SymphonyForensicsRunDetailResult["turns"][number];
type ForensicsEvent = ForensicsTurn["events"][number];

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

function mapPersistedRunRecord(
  run: typeof symphonyRunsTable.$inferSelect
): PersistedRunRecord {
  return {
    ...run,
    repoStart: castJsonObject(run.repoStart),
    repoEnd: castJsonObject(run.repoEnd),
    metadata: castJsonObject(run.metadata)
  };
}

function buildForensicsRunSummary(
  run: PersistedRunRecord,
  codexRun: typeof codexRunsTable.$inferSelect | undefined,
  eventCount: number
): SymphonyForensicsRunSummary {
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

function buildUsage(
  codexTurn: typeof codexTurnsTable.$inferSelect | undefined,
  legacyUsage: unknown
): SymphonyCodexTurnRecord["usage"] {
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
): ForensicsEvent["itemType"] {
  switch (payload.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      return payload.item.type as ForensicsEvent["itemType"];
    default:
      return null;
  }
}

function deriveItemStatus(
  payload: ThreadEvent
): ForensicsEvent["itemStatus"] {
  switch (payload.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      switch (payload.item.type) {
        case "command_execution":
        case "file_change":
        case "mcp_tool_call":
          return payload.item.status as ForensicsEvent["itemStatus"];
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
  run: PersistedRunRecord,
  opts: SymphonyForensicsRunsQuery
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

function buildForensicsIssueExport(
  issue: typeof symphonyIssuesTable.$inferSelect,
  runs: Array<typeof symphonyRunsTable.$inferSelect>
): SymphonyForensicsRunDetailResult["issue"] {
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

function normalizeCodexRunStatus(status: string): SymphonyCodexRunStatus {
  switch (status) {
    case "dispatching":
    case "running":
    case "completed":
    case "paused":
    case "failed":
    case "startup_failed":
    case "rate_limited":
    case "stalled":
    case "stopped":
      return status;
    case "finished":
      return "completed";
    default:
      return "running";
  }
}

function normalizeCodexTurnStatus(status: string): SymphonyCodexTurnStatus {
  switch (status) {
    case "running":
    case "completed":
    case "failed":
    case "stopped":
      return status;
    case "finished":
      return "completed";
    default:
      return "running";
  }
}

function normalizeItemLifecycleStatus(
  status: string | null
): SymphonyCodexItemLifecycleStatus | null {
  switch (status) {
    case "in_progress":
    case "completed":
    case "failed":
      return status;
    case "running":
      return "in_progress";
    case "finished":
      return "completed";
    default:
      return null;
  }
}

function mapCodexRunRecord(
  run: typeof codexRunsTable.$inferSelect
): SymphonyCodexRunRecord {
  return {
    ...run,
    status: normalizeCodexRunStatus(run.status),
    totalTokens: run.inputTokens + run.outputTokens
  };
}

function mapCodexTurnRecord(
  turn: typeof codexTurnsTable.$inferSelect
): SymphonyCodexTurnRecord {
  return {
    ...turn,
    status: normalizeCodexTurnStatus(turn.status),
    totalTokens: turn.inputTokens + turn.outputTokens,
    usage: buildUsage(turn, null)
  };
}

function mapCodexTurnRecords(
  turns: Array<typeof codexTurnsTable.$inferSelect>
): SymphonyCodexTurnRecord[] {
  return [...turns]
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map(mapCodexTurnRecord);
}

function mapCodexItemRecord(
  row: typeof codexItemsTable.$inferSelect
): SymphonyCodexItemRecord {
  return {
    ...row,
    finalStatus: normalizeItemLifecycleStatus(row.finalStatus)
  };
}

function mapCodexCommandExecutionRecord(
  row: typeof codexCommandExecutionsTable.$inferSelect
): SymphonyCodexCommandExecutionRecord {
  return {
    ...row,
    status: normalizeItemLifecycleStatus(row.status) ?? "in_progress"
  };
}

function mapCodexToolCallRecord(
  row: typeof codexToolCallsTable.$inferSelect
): SymphonyCodexToolCallRecord {
  return {
    ...row,
    status: normalizeItemLifecycleStatus(row.status) ?? "in_progress",
    argumentsJson: (row.argumentsJson ?? null) as SymphonyCodexToolCallRecord["argumentsJson"]
  };
}

function mapCodexAgentMessageRecord(
  row: typeof codexAgentMessagesTable.$inferSelect
): SymphonyCodexAgentMessageRecord {
  return { ...row };
}

function mapCodexReasoningRecord(
  row: typeof codexReasoningTable.$inferSelect
): SymphonyCodexReasoningRecord {
  return { ...row };
}

function mapCodexFileChangeRecord(
  row: typeof codexFileChangesTable.$inferSelect
): SymphonyCodexFileChangeRecord {
  return { ...row };
}

function mapCodexEventRecords(
  eventRows: Array<typeof codexEventLogTable.$inferSelect>,
  overflowMap: Map<string, typeof codexPayloadOverflowTable.$inferSelect>,
  codexTurnMap: Map<string, typeof codexTurnsTable.$inferSelect>,
  codexRun: typeof codexRunsTable.$inferSelect
): SymphonyCodexEventRecord[] {
  return eventRows.flatMap((row) => {
    const payload = resolveEventPayload(row, overflowMap);

    if (!payload) {
      return [];
    }

    let inferredThreadId: string | null = row.threadId;

    if (inferredThreadId === null && row.turnId) {
      inferredThreadId = codexTurnMap.get(row.turnId)?.threadId ?? null;
    }

    if (inferredThreadId === null) {
      inferredThreadId = codexRun.threadId;
    }

    return [{
      eventId: row.id,
      turnId: row.turnId ?? null,
      runId: row.runId,
      threadId: inferredThreadId,
      itemId: row.itemId ?? null,
      eventSequence: row.sequence,
      eventType: row.eventType,
      recordedAt: row.recordedAt,
      payload,
      payloadTruncated: row.payloadTruncated,
      insertedAt: row.insertedAt
    }];
  });
}

function buildForensicsTurns(input: RunData): ForensicsTurn[] {
  const knownTurnIds = new Set(input.symphonyTurns.map((turn) => turn.turnId));
  const baseTurns = input.symphonyTurns.map((turn) =>
    mapForensicsTurnRecord(turn, input.codexTurnMap.get(turn.turnId), input.codexRun.threadId ?? null)
  );
  const maxTurnSequence = baseTurns.reduce(
    (max, turn) => Math.max(max, turn.turnSequence),
    0
  );
  const syntheticTurns = input.codexTurns
    .filter((turn) => !knownTurnIds.has(turn.turnId))
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map((turn, index) =>
      synthesizeForensicsTurnRecord(input.run, turn, maxTurnSequence + index + 1)
    );
  const turns = [...baseTurns, ...syntheticTurns];

  return turns.map((turn) => ({
    ...turn,
    eventCount: input.events.filter((event) => event.turnId === turn.turnId).length,
    events: input.events.filter((event) => event.turnId === turn.turnId)
  }));
}

function mapForensicsTurnRecord(
  turn: typeof symphonyTurnsTable.$inferSelect,
  codexTurn: typeof codexTurnsTable.$inferSelect | undefined,
  codexRunThreadId: string | null
): Omit<ForensicsTurn, "eventCount" | "events"> {
  return {
    ...turn,
    codexThreadId: codexTurn?.threadId ?? turn.codexThreadId ?? codexRunThreadId,
    usage: buildUsage(codexTurn, turn.usage),
    metadata: castJsonObject(turn.metadata)
  };
}

function synthesizeForensicsTurnRecord(
  run: typeof symphonyRunsTable.$inferSelect,
  codexTurn: typeof codexTurnsTable.$inferSelect,
  turnSequence: number
): Omit<ForensicsTurn, "eventCount" | "events"> {
  return {
    turnId: codexTurn.turnId,
    runId: codexTurn.runId,
    turnSequence,
    codexThreadId: codexTurn.threadId ?? null,
    codexTurnId: codexTurn.turnId,
    codexSessionId: null,
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

function buildForensicsEvents(input: {
  eventRows: Array<typeof codexEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof codexPayloadOverflowTable.$inferSelect>;
  codexTurnMap: Map<string, typeof codexTurnsTable.$inferSelect>;
  codexRun: typeof codexRunsTable.$inferSelect;
}): ForensicsEvent[] {
  return input.eventRows.flatMap((row) => {
    const payload = resolveEventPayload(row, input.overflowMap);

    if (!row.turnId || !payload) {
      return [];
    }

    return [{
      eventId: row.id,
      turnId: row.turnId,
      runId: row.runId,
      eventSequence: row.sequence,
      eventType: row.eventType,
      itemType: deriveItemType(payload),
      itemStatus: deriveItemStatus(payload),
      recordedAt: row.recordedAt,
      payload,
      payloadTruncated: row.payloadTruncated,
      payloadBytes: byteLength(JSON.stringify(payload)),
      summary: summarizeEvent(payload),
      codexThreadId:
        row.threadId ??
        input.codexTurnMap.get(row.turnId)?.threadId ??
        input.codexRun.threadId ??
        null,
      codexTurnId: row.turnId,
      codexSessionId: null,
      insertedAt: row.insertedAt
    }];
  });
}

type RunData = {
  run: typeof symphonyRunsTable.$inferSelect;
  codexRun: typeof codexRunsTable.$inferSelect;
  issue: typeof symphonyIssuesTable.$inferSelect;
  issueRuns: Array<typeof symphonyRunsTable.$inferSelect>;
  symphonyTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  codexTurns: Array<typeof codexTurnsTable.$inferSelect>;
  eventRows: Array<typeof codexEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof codexPayloadOverflowTable.$inferSelect>;
  codexTurnMap: Map<string, typeof codexTurnsTable.$inferSelect>;
  itemRows: Array<typeof codexItemsTable.$inferSelect>;
  commandRows: Array<typeof codexCommandExecutionsTable.$inferSelect>;
  toolRows: Array<typeof codexToolCallsTable.$inferSelect>;
  agentMessageRows: Array<typeof codexAgentMessagesTable.$inferSelect>;
  reasoningRows: Array<typeof codexReasoningTable.$inferSelect>;
  fileChangeRows: Array<typeof codexFileChangesTable.$inferSelect>;
  events: ForensicsEvent[];
};

async function loadRunData(
  db: BetterSQLite3Database<SymphonyDbShape>,
  runId: string
): Promise<RunData | null> {
  const run = db
    .select()
    .from(symphonyRunsTable)
    .where(eq(symphonyRunsTable.runId, runId))
    .get();

  if (!run) {
    return null;
  }

  const [codexRun, issue, issueRuns, symphonyTurns, codexTurns, eventRows, itemRows, commandRows, toolRows, agentMessageRows, reasoningRows, fileChangeRows] =
    await Promise.all([
      db.select().from(codexRunsTable).where(eq(codexRunsTable.runId, runId)).get(),
      db.select().from(symphonyIssuesTable).where(eq(symphonyIssuesTable.issueId, run.issueId)).get(),
      db.select().from(symphonyRunsTable).where(eq(symphonyRunsTable.issueId, run.issueId)).all(),
      db.select().from(symphonyTurnsTable).where(eq(symphonyTurnsTable.runId, runId)).orderBy(asc(symphonyTurnsTable.turnSequence)).all(),
      db.select().from(codexTurnsTable).where(eq(codexTurnsTable.runId, runId)).all(),
      db.select().from(codexEventLogTable).where(eq(codexEventLogTable.runId, runId)).orderBy(asc(codexEventLogTable.sequence)).all(),
      db.select().from(codexItemsTable).where(eq(codexItemsTable.runId, runId)).all(),
      db.select().from(codexCommandExecutionsTable).where(eq(codexCommandExecutionsTable.runId, runId)).all(),
      db.select().from(codexToolCallsTable).where(eq(codexToolCallsTable.runId, runId)).all(),
      db.select().from(codexAgentMessagesTable).where(eq(codexAgentMessagesTable.runId, runId)).all(),
      db.select().from(codexReasoningTable).where(eq(codexReasoningTable.runId, runId)).all(),
      db.select().from(codexFileChangesTable).where(eq(codexFileChangesTable.runId, runId)).all()
    ]);

  if (!codexRun || !issue) {
    return null;
  }

  if (codexTurns.length === 0 && eventRows.length === 0) {
    return null;
  }

  const overflowIds = eventRows
    .map((row) => row.payloadOverflowId)
    .filter((value): value is string => typeof value === "string");
  const overflowRows =
    overflowIds.length === 0
      ? []
      : db
          .select()
          .from(codexPayloadOverflowTable)
          .where(inArray(codexPayloadOverflowTable.id, overflowIds))
          .all();
  const overflowMap = new Map(overflowRows.map((row) => [row.id, row] as const));
  const codexTurnMap = new Map(codexTurns.map((turn) => [turn.turnId, turn] as const));
  const events = buildForensicsEvents({
    eventRows,
    overflowMap,
    codexTurnMap,
    codexRun
  });

  return {
    run,
    codexRun,
    issue,
    issueRuns,
    symphonyTurns,
    codexTurns,
    eventRows,
    overflowMap,
    codexTurnMap,
    itemRows,
    commandRows,
    toolRows,
    agentMessageRows,
    reasoningRows,
    fileChangeRows,
    events
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
