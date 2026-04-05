import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  isThreadEvent,
  previewItem,
  previewText,
  type ThreadEvent
} from "@symphony/agent-analytics";
import type {
  SymphonyAgentRunArtifactsResult,
  SymphonyAgentTurnActivityRecord,
  JsonObject,
  SymphonyAgentMessageRecord,
  SymphonyAgentCommandExecutionRecord,
  SymphonyAgentEventRecord,
  SymphonyAgentFileChangeRecord,
  SymphonyAgentItemLifecycleStatus,
  SymphonyAgentItemRecord,
  SymphonyAgentOverflowRecord,
  SymphonyAgentRunQuery,
  SymphonyAgentReasoningBlockRecord,
  SymphonyAgentRunRecord,
  SymphonyAgentTaskSnapshotRecord,
  SymphonyAgentRunStatus,
  SymphonyAgentRunTurnQuery,
  SymphonyAgentToolCallRecord,
  SymphonyAgentTurnStatus,
  SymphonyAgentTurnRecord,
  SymphonyForensicsIssueQuery,
  SymphonyForensicsProblemRunsQuery,
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsRunsQuery,
  SymphonyForensicsRunSummary,
} from "@symphony/contracts";
import {
  symphonyAgentCommandExecutionsTable,
  symphonyAgentEventLogTable,
  symphonyAgentFileChangesTable,
  symphonyAgentItemsTable,
  symphonyAgentMessagesTable,
  symphonyAgentPayloadOverflowTable,
  symphonyAgentReasoningTable,
  symphonyAgentRunsTable,
  symphonyAgentTaskSnapshotItemsTable,
  symphonyAgentTaskSnapshotsTable,
  symphonyAgentToolCallsTable,
  symphonyAgentTurnsTable,
  symphonyIssuesTable,
  symphonyRuntimeLogsTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;

export interface AgentAnalyticsReadStore {
  listRuns(opts?: SymphonyForensicsRunsQuery): Promise<SymphonyForensicsRunSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: Partial<SymphonyForensicsIssueQuery>
  ): Promise<SymphonyForensicsRunSummary[]>;
  listProblemRuns(
    opts?: Partial<SymphonyForensicsProblemRunsQuery>
  ): Promise<SymphonyForensicsRunSummary[]>;
  fetchRunDetail(runId: SymphonyAgentRunQuery["runId"]): Promise<SymphonyForensicsRunDetailResult | null>;
  fetchRunArtifacts(
    runId: SymphonyAgentRunQuery["runId"]
  ): Promise<SymphonyAgentRunArtifactsResult | null>;
  fetchOverflow(
    runId: SymphonyAgentRunQuery["runId"],
    overflowId: string
  ): Promise<SymphonyAgentOverflowRecord | null>;
  listTurns(runId: SymphonyAgentRunQuery["runId"]): Promise<SymphonyAgentTurnRecord[]>;
  listItems(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentItemRecord[]>;
  listCommandExecutions(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentCommandExecutionRecord[]>;
  listToolCalls(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentToolCallRecord[]>;
  listAgentMessages(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentMessageRecord[]>;
  listReasoning(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentReasoningBlockRecord[]>;
  listFileChanges(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentFileChangeRecord[]>;
  listTaskSnapshots(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentTaskSnapshotRecord[]>;
  listTurnActivities(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentTurnActivityRecord[]>;
}

export function createSqliteAgentAnalyticsReadStore(input: {
  db: BetterSQLite3Database<SymphonyDbShape>;
}): AgentAnalyticsReadStore {
  return new SqliteAgentAnalyticsReadStore(input.db);
}

class SqliteAgentAnalyticsReadStore implements AgentAnalyticsReadStore {
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
      .from(symphonyAgentRunsTable)
      .where(inArray(symphonyAgentRunsTable.runId, runIds))
      .all();
    const eventCounts = this.#db
      .select({
        runId: symphonyAgentEventLogTable.runId,
        count: sql<number>`count(*)`
      })
      .from(symphonyAgentEventLogTable)
      .where(inArray(symphonyAgentEventLogTable.runId, runIds))
      .groupBy(symphonyAgentEventLogTable.runId)
      .all();
    const runtimeLogRows = this.#db
      .select()
      .from(symphonyRuntimeLogsTable)
      .where(inArray(symphonyRuntimeLogsTable.runId, runIds))
      .orderBy(desc(symphonyRuntimeLogsTable.recordedAt))
      .all();

    const codexRunMap = new Map(codexRuns.map((run) => [run.runId, run] as const));
    const eventCountMap = new Map(eventCounts.map((row) => [row.runId, row.count] as const));
    const runtimeContextMap = buildRuntimeContextMap(runtimeLogRows);

    return runs.map((run) =>
      buildForensicsRunSummary(
        run,
        codexRunMap.get(run.runId),
        eventCountMap.get(run.runId) ?? 0,
        runtimeContextMap.get(run.runId)
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
  runId: SymphonyAgentRunQuery["runId"]
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
          data.eventRows.length,
          data.runtimeContext
        ),
        threadId: data.codexRun.threadId ?? null,
        providerId: data.codexRun.providerId ?? data.runtimeContext.providerId,
        providerName: data.codexRun.providerName ?? data.runtimeContext.providerName,
        authMode:
          data.runtimeContext.authMode === "auth_json" ||
          data.runtimeContext.authMode === "api_key_env"
            ? data.runtimeContext.authMode
            : null,
        providerEnvKey: data.runtimeContext.providerEnvKey,
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
    runId: SymphonyAgentRunQuery["runId"]
  ): Promise<SymphonyAgentRunArtifactsResult | null> {
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
      taskSnapshots: mapCodexTaskSnapshotRecords(
        data.taskSnapshotRows,
        data.taskSnapshotItemRows
      ),
      turnActivities: mapAgentTurnActivityRecords({
        turnRows: data.codexTurns,
        agentMessageRows: data.agentMessageRows,
        reasoningRows: data.reasoningRows,
        fileChangeRows: data.fileChangeRows,
        taskSnapshotRows: data.taskSnapshotRows,
        taskSnapshotItemRows: data.taskSnapshotItemRows
      }),
      events: mapCodexEventRecords(data.eventRows, data.overflowMap, data.codexTurnMap, data.codexRun)
    };
  }

  async fetchOverflow(
    runId: SymphonyAgentRunQuery["runId"],
    overflowId: string
  ): Promise<SymphonyAgentOverflowRecord | null> {
    const row = await this.#db
      .select()
      .from(symphonyAgentPayloadOverflowTable)
      .where(
        and(
          eq(symphonyAgentPayloadOverflowTable.runId, runId),
          eq(symphonyAgentPayloadOverflowTable.id, overflowId)
        )
      )
      .get();

    return row ? mapCodexOverflowRecord(row) : null;
  }

  async listTurns(runId: SymphonyAgentRunQuery["runId"]): Promise<SymphonyAgentTurnRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentTurnsTable)
      .where(eq(symphonyAgentTurnsTable.runId, runId))
      .orderBy(asc(symphonyAgentTurnsTable.startedAt))
      .all();

    return mapCodexTurnRecords(rows);
  }

  async listItems(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentItemRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentItemsTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentItemsTable.runId, input.runId),
              eq(symphonyAgentItemsTable.turnId, input.turnId)
            )
          : eq(symphonyAgentItemsTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentItemsTable.insertedAt))
      .all();

    return rows.map(mapCodexItemRecord);
  }

  async listCommandExecutions(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentCommandExecutionRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentCommandExecutionsTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentCommandExecutionsTable.runId, input.runId),
              eq(symphonyAgentCommandExecutionsTable.turnId, input.turnId)
            )
          : eq(symphonyAgentCommandExecutionsTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentCommandExecutionsTable.insertedAt))
      .all();

    return rows.map(mapCodexCommandExecutionRecord);
  }

  async listToolCalls(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentToolCallRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentToolCallsTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentToolCallsTable.runId, input.runId),
              eq(symphonyAgentToolCallsTable.turnId, input.turnId)
            )
          : eq(symphonyAgentToolCallsTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentToolCallsTable.insertedAt))
      .all();

    return rows.map(mapCodexToolCallRecord);
  }

  async listAgentMessages(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentMessageRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentMessagesTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentMessagesTable.runId, input.runId),
              eq(symphonyAgentMessagesTable.turnId, input.turnId)
            )
          : eq(symphonyAgentMessagesTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentMessagesTable.recordedAt), asc(symphonyAgentMessagesTable.insertedAt))
      .all();

    return rows.map(mapCodexAgentMessageRecord);
  }

  async listReasoning(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentReasoningBlockRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentReasoningTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentReasoningTable.runId, input.runId),
              eq(symphonyAgentReasoningTable.turnId, input.turnId)
            )
          : eq(symphonyAgentReasoningTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentReasoningTable.recordedAt), asc(symphonyAgentReasoningTable.insertedAt))
      .all();

    return rows.map(mapCodexReasoningRecord);
  }

  async listFileChanges(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentFileChangeRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentFileChangesTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentFileChangesTable.runId, input.runId),
              eq(symphonyAgentFileChangesTable.turnId, input.turnId)
            )
          : eq(symphonyAgentFileChangesTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentFileChangesTable.recordedAt))
      .all();

    return rows.map(mapCodexFileChangeRecord);
  }

  async listTaskSnapshots(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentTaskSnapshotRecord[]> {
    const snapshotRows = await this.#db
      .select()
      .from(symphonyAgentTaskSnapshotsTable)
      .where(
        input.turnId
          ? and(
              eq(symphonyAgentTaskSnapshotsTable.runId, input.runId),
              eq(symphonyAgentTaskSnapshotsTable.turnId, input.turnId)
            )
          : eq(symphonyAgentTaskSnapshotsTable.runId, input.runId)
      )
      .orderBy(asc(symphonyAgentTaskSnapshotsTable.recordedAt), asc(symphonyAgentTaskSnapshotsTable.insertedAt))
      .all();

    if (snapshotRows.length === 0) {
      return [];
    }

    const snapshotIds = snapshotRows.map((row) => row.snapshotId);
    const itemRows = await this.#db
      .select()
      .from(symphonyAgentTaskSnapshotItemsTable)
      .where(inArray(symphonyAgentTaskSnapshotItemsTable.snapshotId, snapshotIds))
      .orderBy(
        asc(symphonyAgentTaskSnapshotItemsTable.snapshotId),
        asc(symphonyAgentTaskSnapshotItemsTable.position)
      )
      .all();

    return mapCodexTaskSnapshotRecords(snapshotRows, itemRows);
  }

  async listTurnActivities(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentTurnActivityRecord[]> {
    const data = await loadRunData(this.#db, input.runId);

    if (!data) {
      return [];
    }

    const activities = mapAgentTurnActivityRecords({
      turnRows: data.codexTurns,
      agentMessageRows: data.agentMessageRows,
      reasoningRows: data.reasoningRows,
      fileChangeRows: data.fileChangeRows,
      taskSnapshotRows: data.taskSnapshotRows,
      taskSnapshotItemRows: data.taskSnapshotItemRows
    });

    return input.turnId
      ? activities.filter((activity) => activity.turnId === input.turnId)
      : activities;
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
  row: typeof symphonyAgentEventLogTable.$inferSelect,
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>
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
  codexRun: typeof symphonyAgentRunsTable.$inferSelect | undefined,
  eventCount: number,
  runtimeContext?: {
    harness: "codex" | "pi" | null;
    model: string | null;
    providerId: string | null;
    providerName: string | null;
  }
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
    agentHarness: normalizeHarnessKind(codexRun?.harnessKind ?? null) ?? runtimeContext?.harness ?? null,
    agentStatus: codexRun ? normalizeAgentRunStatus(codexRun.status) : null,
    agentFailureKind: codexRun?.failureKind ?? null,
    agentFailureOrigin: codexRun?.failureOrigin ?? null,
    agentFailureMessagePreview: codexRun?.failureMessagePreview ?? null,
    model: codexRun?.model ?? runtimeContext?.model ?? null,
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

function buildRuntimeContextMap(
  rows: Array<typeof symphonyRuntimeLogsTable.$inferSelect>
): Map<string, ReturnType<typeof extractRuntimeContext>> {
  const rowsByRunId = new Map<string, Array<typeof symphonyRuntimeLogsTable.$inferSelect>>();

  for (const row of rows) {
    if (!row.runId) {
      continue;
    }

    const existing = rowsByRunId.get(row.runId);

    if (existing) {
      existing.push(row);
      continue;
    }

    rowsByRunId.set(row.runId, [row]);
  }

  return new Map(
    Array.from(rowsByRunId.entries()).map(([runId, runRows]) => [
      runId,
      extractRuntimeContext(runRows)
    ])
  );
}

function buildUsage(
  codexTurn: typeof symphonyAgentTurnsTable.$inferSelect | undefined,
  legacyUsage: unknown
): SymphonyAgentTurnRecord["usage"] {
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

function groupRowsByTurnId<T extends { turnId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const group = groups.get(row.turnId);

    if (group) {
      group.push(row);
      continue;
    }

    groups.set(row.turnId, [row]);
  }

  return groups;
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

function normalizeAgentRunStatus(status: string): SymphonyAgentRunStatus {
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

function normalizeAgentTurnStatus(status: string): SymphonyAgentTurnStatus {
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
): SymphonyAgentItemLifecycleStatus | null {
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

function normalizeHarnessKind(
  harness: string | null
): "codex" | "pi" | null {
  switch (harness) {
    case "codex":
    case "pi":
      return harness;
    default:
      return null;
  }
}

function mapCodexRunRecord(
  run: typeof symphonyAgentRunsTable.$inferSelect
): SymphonyAgentRunRecord {
  return {
    ...run,
    harnessKind: normalizeHarnessKind(run.harnessKind),
    status: normalizeAgentRunStatus(run.status),
    totalTokens: run.inputTokens + run.outputTokens
  };
}

function mapCodexTurnRecord(
  turn: typeof symphonyAgentTurnsTable.$inferSelect
): SymphonyAgentTurnRecord {
  return {
    ...turn,
    harnessKind: normalizeHarnessKind(turn.harnessKind),
    status: normalizeAgentTurnStatus(turn.status),
    totalTokens: turn.inputTokens + turn.outputTokens,
    usage: buildUsage(turn, null)
  };
}

function mapCodexTurnRecords(
  turns: Array<typeof symphonyAgentTurnsTable.$inferSelect>
): SymphonyAgentTurnRecord[] {
  return [...turns]
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map(mapCodexTurnRecord);
}

function mapCodexItemRecord(
  row: typeof symphonyAgentItemsTable.$inferSelect
): SymphonyAgentItemRecord {
  return {
    ...row,
    finalStatus: normalizeItemLifecycleStatus(row.finalStatus)
  };
}

function mapCodexCommandExecutionRecord(
  row: typeof symphonyAgentCommandExecutionsTable.$inferSelect
): SymphonyAgentCommandExecutionRecord {
  return {
    ...row,
    status: normalizeItemLifecycleStatus(row.status) ?? "in_progress"
  };
}

function mapCodexToolCallRecord(
  row: typeof symphonyAgentToolCallsTable.$inferSelect
): SymphonyAgentToolCallRecord {
  return {
    ...row,
    status: normalizeItemLifecycleStatus(row.status) ?? "in_progress",
    argumentsJson: (row.argumentsJson ?? null) as SymphonyAgentToolCallRecord["argumentsJson"]
  };
}

function mapCodexAgentMessageRecord(
  row: typeof symphonyAgentMessagesTable.$inferSelect
): SymphonyAgentMessageRecord {
  return { ...row };
}

function mapCodexReasoningRecord(
  row: typeof symphonyAgentReasoningTable.$inferSelect
): SymphonyAgentReasoningBlockRecord {
  return { ...row };
}

function mapCodexFileChangeRecord(
  row: typeof symphonyAgentFileChangesTable.$inferSelect
): SymphonyAgentFileChangeRecord {
  return { ...row };
}

function mapCodexTaskSnapshotRecords(
  snapshotRows: Array<typeof symphonyAgentTaskSnapshotsTable.$inferSelect>,
  itemRows: Array<typeof symphonyAgentTaskSnapshotItemsTable.$inferSelect>
): SymphonyAgentTaskSnapshotRecord[] {
  const itemsBySnapshotId = new Map<string, Array<typeof symphonyAgentTaskSnapshotItemsTable.$inferSelect>>();

  for (const row of itemRows) {
    const items = itemsBySnapshotId.get(row.snapshotId);
    if (items) {
      items.push(row);
      continue;
    }

    itemsBySnapshotId.set(row.snapshotId, [row]);
  }

  return [...snapshotRows]
    .sort((left, right) => compareNullableIso(left.recordedAt, right.recordedAt))
    .map((row) => ({
      snapshotId: row.snapshotId,
      runId: row.runId,
      turnId: row.turnId,
      itemId: row.itemId,
      sourceKind: row.sourceKind,
      recordedAt: row.recordedAt,
      insertedAt: row.insertedAt,
      items: (itemsBySnapshotId.get(row.snapshotId) ?? [])
        .sort((left, right) => left.position - right.position)
        .map((item) => ({
          snapshotId: item.snapshotId,
          position: item.position,
          label: item.label,
          state: item.state as SymphonyAgentTaskSnapshotRecord["items"][number]["state"],
          section: item.section,
          insertedAt: item.insertedAt
        }))
    }));
}

function mapAgentTurnActivityRecords(input: {
  turnRows: Array<typeof symphonyAgentTurnsTable.$inferSelect>;
  agentMessageRows: Array<typeof symphonyAgentMessagesTable.$inferSelect>;
  reasoningRows: Array<typeof symphonyAgentReasoningTable.$inferSelect>;
  fileChangeRows: Array<typeof symphonyAgentFileChangesTable.$inferSelect>;
  taskSnapshotRows: Array<typeof symphonyAgentTaskSnapshotsTable.$inferSelect>;
  taskSnapshotItemRows: Array<typeof symphonyAgentTaskSnapshotItemsTable.$inferSelect>;
}): SymphonyAgentTurnActivityRecord[] {
  const messagesByTurn = groupRowsByTurnId(input.agentMessageRows);
  const reasoningByTurn = groupRowsByTurnId(input.reasoningRows);
  const fileChangesByTurn = groupRowsByTurnId(input.fileChangeRows);
  const taskSnapshots = mapCodexTaskSnapshotRecords(
    input.taskSnapshotRows,
    input.taskSnapshotItemRows
  );
  const taskSnapshotsByTurn = groupRowsByTurnId(taskSnapshots);

  return [...input.turnRows]
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map((turn) => ({
      runId: turn.runId,
      turnId: turn.turnId,
      status: normalizeAgentTurnStatus(turn.status),
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      messages: (messagesByTurn.get(turn.turnId) ?? [])
        .sort((left, right) => {
          const recordedAtOrder = compareNullableIso(left.recordedAt, right.recordedAt);
          if (recordedAtOrder !== 0) {
            return recordedAtOrder;
          }

          return compareNullableIso(left.insertedAt, right.insertedAt);
        })
        .map(mapCodexAgentMessageRecord),
      reasoningBlocks: (reasoningByTurn.get(turn.turnId) ?? [])
        .sort((left, right) => {
          const recordedAtOrder = compareNullableIso(left.recordedAt, right.recordedAt);
          if (recordedAtOrder !== 0) {
            return recordedAtOrder;
          }

          return compareNullableIso(left.insertedAt, right.insertedAt);
        })
        .map(mapCodexReasoningRecord),
      fileChanges: (fileChangesByTurn.get(turn.turnId) ?? []).map(
        mapCodexFileChangeRecord
      ),
      taskSnapshots: taskSnapshotsByTurn.get(turn.turnId) ?? []
    }));
}

function mapCodexEventRecords(
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>,
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>,
  codexTurnMap: Map<string, typeof symphonyAgentTurnsTable.$inferSelect>,
  codexRun: typeof symphonyAgentRunsTable.$inferSelect
): SymphonyAgentEventRecord[] {
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
      payloadOverflowId: row.payloadOverflowId ?? null,
      projectionLossOverflowId: row.projectionLossOverflowId ?? null,
      rawPayloadOverflowId: row.rawPayloadOverflowId ?? null,
      payloadTruncated: row.payloadTruncated,
      insertedAt: row.insertedAt
    }];
  });
}

function mapCodexOverflowRecord(
  row: typeof symphonyAgentPayloadOverflowTable.$inferSelect
): SymphonyAgentOverflowRecord {
  return {
    overflowId: row.id,
    runId: row.runId,
    turnId: row.turnId,
    itemId: row.itemId,
    kind: row.kind,
    contentJson: row.contentJson as SymphonyAgentOverflowRecord["contentJson"],
    contentText: row.contentText,
    byteCount: row.byteCount,
    insertedAt: row.insertedAt
  };
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
  codexTurn: typeof symphonyAgentTurnsTable.$inferSelect | undefined,
  codexRunThreadId: string | null
): Omit<ForensicsTurn, "eventCount" | "events"> {
  return {
    ...turn,
    threadId: codexTurn?.threadId ?? turn.threadId ?? codexRunThreadId,
    usage: buildUsage(codexTurn, turn.usage),
    metadata: castJsonObject(turn.metadata)
  };
}

function synthesizeForensicsTurnRecord(
  run: typeof symphonyRunsTable.$inferSelect,
  codexTurn: typeof symphonyAgentTurnsTable.$inferSelect,
  turnSequence: number
): Omit<ForensicsTurn, "eventCount" | "events"> {
  return {
    turnId: codexTurn.turnId,
    runId: codexTurn.runId,
    turnSequence,
    threadId: codexTurn.threadId ?? null,
    agentTurnId: codexTurn.turnId,
    sessionId: null,
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
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>;
  codexTurnMap: Map<string, typeof symphonyAgentTurnsTable.$inferSelect>;
  codexRun: typeof symphonyAgentRunsTable.$inferSelect;
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
      threadId:
        row.threadId ??
        input.codexTurnMap.get(row.turnId)?.threadId ??
        input.codexRun.threadId ??
        null,
      agentTurnId: row.turnId,
      sessionId: null,
      insertedAt: row.insertedAt
    }];
  });
}

type RunData = {
  run: typeof symphonyRunsTable.$inferSelect;
  codexRun: typeof symphonyAgentRunsTable.$inferSelect;
  issue: typeof symphonyIssuesTable.$inferSelect;
  issueRuns: Array<typeof symphonyRunsTable.$inferSelect>;
  symphonyTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  codexTurns: Array<typeof symphonyAgentTurnsTable.$inferSelect>;
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>;
  codexTurnMap: Map<string, typeof symphonyAgentTurnsTable.$inferSelect>;
  itemRows: Array<typeof symphonyAgentItemsTable.$inferSelect>;
  commandRows: Array<typeof symphonyAgentCommandExecutionsTable.$inferSelect>;
  toolRows: Array<typeof symphonyAgentToolCallsTable.$inferSelect>;
  agentMessageRows: Array<typeof symphonyAgentMessagesTable.$inferSelect>;
  reasoningRows: Array<typeof symphonyAgentReasoningTable.$inferSelect>;
  fileChangeRows: Array<typeof symphonyAgentFileChangesTable.$inferSelect>;
  taskSnapshotRows: Array<typeof symphonyAgentTaskSnapshotsTable.$inferSelect>;
  taskSnapshotItemRows: Array<typeof symphonyAgentTaskSnapshotItemsTable.$inferSelect>;
  runtimeContext: {
    harness: "codex" | "pi" | null;
    model: string | null;
    providerId: string | null;
    providerName: string | null;
    authMode: string | null;
    providerEnvKey: string | null;
  };
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

  const [codexRun, issue, issueRuns, symphonyTurns, codexTurns, eventRows, itemRows, commandRows, toolRows, agentMessageRows, reasoningRows, fileChangeRows, taskSnapshotRows, runtimeLogRows] =
    await Promise.all([
      db.select().from(symphonyAgentRunsTable).where(eq(symphonyAgentRunsTable.runId, runId)).get(),
      db.select().from(symphonyIssuesTable).where(eq(symphonyIssuesTable.issueId, run.issueId)).get(),
      db.select().from(symphonyRunsTable).where(eq(symphonyRunsTable.issueId, run.issueId)).all(),
      db.select().from(symphonyTurnsTable).where(eq(symphonyTurnsTable.runId, runId)).orderBy(asc(symphonyTurnsTable.turnSequence)).all(),
      db.select().from(symphonyAgentTurnsTable).where(eq(symphonyAgentTurnsTable.runId, runId)).all(),
      db.select().from(symphonyAgentEventLogTable).where(eq(symphonyAgentEventLogTable.runId, runId)).orderBy(asc(symphonyAgentEventLogTable.sequence)).all(),
      db.select().from(symphonyAgentItemsTable).where(eq(symphonyAgentItemsTable.runId, runId)).all(),
      db.select().from(symphonyAgentCommandExecutionsTable).where(eq(symphonyAgentCommandExecutionsTable.runId, runId)).all(),
      db.select().from(symphonyAgentToolCallsTable).where(eq(symphonyAgentToolCallsTable.runId, runId)).all(),
      db
        .select()
        .from(symphonyAgentMessagesTable)
        .where(eq(symphonyAgentMessagesTable.runId, runId))
        .orderBy(asc(symphonyAgentMessagesTable.recordedAt), asc(symphonyAgentMessagesTable.insertedAt))
        .all(),
      db.select()
        .from(symphonyAgentReasoningTable)
        .where(eq(symphonyAgentReasoningTable.runId, runId))
        .orderBy(asc(symphonyAgentReasoningTable.recordedAt), asc(symphonyAgentReasoningTable.insertedAt))
        .all(),
      db.select().from(symphonyAgentFileChangesTable).where(eq(symphonyAgentFileChangesTable.runId, runId)).all(),
      db.select().from(symphonyAgentTaskSnapshotsTable).where(eq(symphonyAgentTaskSnapshotsTable.runId, runId)).all(),
      db.select().from(symphonyRuntimeLogsTable).where(eq(symphonyRuntimeLogsTable.runId, runId)).orderBy(desc(symphonyRuntimeLogsTable.recordedAt)).all()
    ]);

  if (!codexRun || !issue) {
    return null;
  }

  const overflowIds = [...new Set(
    eventRows
      .flatMap((row) => [
        row.payloadOverflowId,
        row.projectionLossOverflowId,
        row.rawPayloadOverflowId
      ])
      .filter((value): value is string => typeof value === "string")
  )];
  const overflowRows =
    overflowIds.length === 0
      ? []
      : db
          .select()
          .from(symphonyAgentPayloadOverflowTable)
          .where(inArray(symphonyAgentPayloadOverflowTable.id, overflowIds))
          .all();
  const overflowMap = new Map(overflowRows.map((row) => [row.id, row] as const));
  const codexTurnMap = new Map(codexTurns.map((turn) => [turn.turnId, turn] as const));
  const snapshotIds = taskSnapshotRows.map((row) => row.snapshotId);
  const taskSnapshotItemRows =
    snapshotIds.length === 0
      ? []
      : db
          .select()
          .from(symphonyAgentTaskSnapshotItemsTable)
          .where(inArray(symphonyAgentTaskSnapshotItemsTable.snapshotId, snapshotIds))
          .orderBy(
            asc(symphonyAgentTaskSnapshotItemsTable.snapshotId),
            asc(symphonyAgentTaskSnapshotItemsTable.position)
          )
          .all();
  const events = buildForensicsEvents({
    eventRows,
    overflowMap,
    codexTurnMap,
    codexRun
  });
  const runtimeContext = extractRuntimeContext(runtimeLogRows);

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
    taskSnapshotRows,
    taskSnapshotItemRows,
    runtimeContext,
    events
  };
}

function extractRuntimeContext(
  rows: Array<typeof symphonyRuntimeLogsTable.$inferSelect>
): {
  harness: "codex" | "pi" | null;
  model: string | null;
  providerId: string | null;
  providerName: string | null;
  authMode: string | null;
  providerEnvKey: string | null;
} {
  let harness: "codex" | "pi" | null = null;
  let model: string | null = null;
  let providerId: string | null = null;
  let providerName: string | null = null;
  let authMode: string | null = null;
  let providerEnvKey: string | null = null;

  for (const row of rows) {
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;

    if (!payload) {
      continue;
    }

    if (harness === null) {
      const payloadHarness = payload.harness;
      if (
        payloadHarness === "codex" ||
        payloadHarness === "pi"
      ) {
        harness = payloadHarness;
      }
    }

    model ??=
      typeof payload.model === "string" && payload.model !== ""
        ? payload.model
        : null;
    providerId ??=
      typeof payload.providerId === "string" && payload.providerId !== ""
        ? payload.providerId
        : null;
    providerName ??=
      typeof payload.providerName === "string" && payload.providerName !== ""
        ? payload.providerName
        : null;
    authMode ??=
      typeof payload.authMode === "string" && payload.authMode !== ""
        ? payload.authMode
        : null;
    providerEnvKey ??=
      typeof payload.providerEnvKey === "string" && payload.providerEnvKey !== ""
        ? payload.providerEnvKey
        : null;
  }

  return {
    harness,
    model,
    providerId,
    providerName,
    authMode,
    providerEnvKey
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
