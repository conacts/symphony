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
  SymphonyRuntimeLaunchTarget
} from "@symphony/contracts";
import {
  parseKnownPiToolArguments,
  type PiEditArguments,
  type PiWriteArguments
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
  piReadsTable,
  piEditsTable,
  piWritesTable,
  piGrepsTable,
  piFindsTable,
  piMessageEndsTable,
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
    const agentRuns = this.#db
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

    const agentRunMap = new Map(agentRuns.map((run) => [run.runId, run] as const));
    const eventCountMap = new Map(eventCounts.map((row) => [row.runId, row.count] as const));
    const runtimeContextMap = buildRuntimeContextMap(runtimeLogRows);

    return runs.map((run) =>
      buildForensicsRunSummary(
        run,
        agentRunMap.get(run.runId),
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
          data.agentRun,
          data.eventRows.length,
          data.runtimeContext
        ),
        threadId: data.agentRun.threadId ?? null,
        processId: data.runtimeContext.processId,
        providerId: data.agentRun.providerId ?? data.runtimeContext.providerId,
        providerName: data.agentRun.providerName ?? data.runtimeContext.providerName,
        reasoningEffort: data.runtimeContext.reasoningEffort,
        profile: data.runtimeContext.profile,
        authMode:
          data.runtimeContext.authMode === "auth_json" ||
          data.runtimeContext.authMode === "api_key_env"
            ? data.runtimeContext.authMode
            : null,
        providerEnvKey: data.runtimeContext.providerEnvKey,
        launchTarget: data.runtimeContext.launchTarget,
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
      run: mapAgentRunRecord(data.agentRun),
      turns: mapAgentTurnRecords(data.agentTurns),
      items: data.itemRows.map(mapAgentItemRecord),
      commandExecutions: data.commandRows.map(mapAgentCommandExecutionRecord),
      toolCalls: mapAgentToolCallRecords(data),
      agentMessages: data.agentMessageRows.map((row) =>
        mapAgentMessageRecord(
          row,
          data.piMessageEndMap.get(toolRowKey(row.runId, row.turnId, row.itemId))
        )
      ),
      reasoning: data.reasoningRows.map((row) =>
        mapAgentReasoningRecord(
          row,
          data.piMessageEndMap.get(toolRowKey(row.runId, row.turnId, row.itemId))
        )
      ),
      fileChanges: data.fileChangeRows.map(mapAgentFileChangeRecord),
      taskSnapshots: mapAgentTaskSnapshotRecords(
        data.taskSnapshotRows,
        data.taskSnapshotItemRows
      ),
      turnActivities: mapAgentTurnActivityRecords({
        turnRows: data.agentTurns,
        agentMessageRows: data.agentMessageRows,
        reasoningRows: data.reasoningRows,
        piMessageEndMap: data.piMessageEndMap,
        fileChangeRows: data.fileChangeRows,
        taskSnapshotRows: data.taskSnapshotRows,
        taskSnapshotItemRows: data.taskSnapshotItemRows
      }),
      events: mapAgentEventRecords(data.eventRows, data.overflowMap, data.agentTurnMap, data.agentRun)
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

    return row ? mapAgentOverflowRecord(row) : null;
  }

  async listTurns(runId: SymphonyAgentRunQuery["runId"]): Promise<SymphonyAgentTurnRecord[]> {
    const rows = await this.#db
      .select()
      .from(symphonyAgentTurnsTable)
      .where(eq(symphonyAgentTurnsTable.runId, runId))
      .orderBy(asc(symphonyAgentTurnsTable.startedAt))
      .all();

    return mapAgentTurnRecords(rows);
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

    return rows.map(mapAgentItemRecord);
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

    return rows.map(mapAgentCommandExecutionRecord);
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

    const [piReadRows, piEditRows, piWriteRows, piGrepRows, piFindRows] = await Promise.all([
      this.#db
        .select()
        .from(piReadsTable)
        .where(
          input.turnId
            ? and(eq(piReadsTable.runId, input.runId), eq(piReadsTable.turnId, input.turnId))
            : eq(piReadsTable.runId, input.runId)
        )
        .all(),
      this.#db
        .select()
        .from(piEditsTable)
        .where(
          input.turnId
            ? and(eq(piEditsTable.runId, input.runId), eq(piEditsTable.turnId, input.turnId))
            : eq(piEditsTable.runId, input.runId)
        )
        .all(),
      this.#db
        .select()
        .from(piWritesTable)
        .where(
          input.turnId
            ? and(eq(piWritesTable.runId, input.runId), eq(piWritesTable.turnId, input.turnId))
            : eq(piWritesTable.runId, input.runId)
        )
        .all(),
      this.#db
        .select()
        .from(piGrepsTable)
        .where(
          input.turnId
            ? and(eq(piGrepsTable.runId, input.runId), eq(piGrepsTable.turnId, input.turnId))
            : eq(piGrepsTable.runId, input.runId)
        )
        .all(),
      this.#db
        .select()
        .from(piFindsTable)
        .where(
          input.turnId
            ? and(eq(piFindsTable.runId, input.runId), eq(piFindsTable.turnId, input.turnId))
            : eq(piFindsTable.runId, input.runId)
        )
        .all()
    ]);

    return mapAgentToolCallRecords({
      toolRows: rows,
      piReadRows,
      piEditRows,
      piWriteRows,
      piGrepRows,
      piFindRows
    });
  }

  async listAgentMessages(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentMessageRecord[]> {
    const [rows, piMessageEndRows] = await Promise.all([
      this.#db
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
        .all(),
      this.#db
        .select()
        .from(piMessageEndsTable)
        .where(
          input.turnId
            ? and(eq(piMessageEndsTable.runId, input.runId), eq(piMessageEndsTable.turnId, input.turnId))
            : eq(piMessageEndsTable.runId, input.runId)
        )
        .all()
    ]);
    const piMessageEndMap = new Map(
      piMessageEndRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
    );

    return rows.map((row) =>
      mapAgentMessageRecord(row, piMessageEndMap.get(toolRowKey(row.runId, row.turnId, row.itemId)))
    );
  }

  async listReasoning(input: SymphonyAgentRunTurnQuery): Promise<SymphonyAgentReasoningBlockRecord[]> {
    const [rows, piMessageEndRows] = await Promise.all([
      this.#db
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
        .all(),
      this.#db
        .select()
        .from(piMessageEndsTable)
        .where(
          input.turnId
            ? and(eq(piMessageEndsTable.runId, input.runId), eq(piMessageEndsTable.turnId, input.turnId))
            : eq(piMessageEndsTable.runId, input.runId)
        )
        .all()
    ]);
    const piMessageEndMap = new Map(
      piMessageEndRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
    );

    return rows.map((row) =>
      mapAgentReasoningRecord(
        row,
        piMessageEndMap.get(toolRowKey(row.runId, row.turnId, row.itemId))
      )
    );
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

    return rows.map(mapAgentFileChangeRecord);
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

    return mapAgentTaskSnapshotRecords(snapshotRows, itemRows);
  }

  async listTurnActivities(
    input: SymphonyAgentRunTurnQuery
  ): Promise<SymphonyAgentTurnActivityRecord[]> {
    const data = await loadRunData(this.#db, input.runId);

    if (!data) {
      return [];
    }

    const activities = mapAgentTurnActivityRecords({
      turnRows: data.agentTurns,
      agentMessageRows: data.agentMessageRows,
      reasoningRows: data.reasoningRows,
      piMessageEndMap: data.piMessageEndMap,
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
  agentRun: typeof symphonyAgentRunsTable.$inferSelect | undefined,
  eventCount: number,
  runtimeContext?: {
    harness: "pi" | null;
    model: string | null;
    providerId: string | null;
    providerName: string | null;
  }
): SymphonyForensicsRunSummary {
  const inputTokens = agentRun?.inputTokens ?? 0;
  const cachedInputTokens = agentRun?.cachedInputTokens ?? 0;
  const outputTokens = agentRun?.outputTokens ?? 0;

  return {
    runId: run.runId,
    issueId: run.issueId,
    issueIdentifier: run.issueIdentifier,
    attempt: run.attempt,
    status: run.status,
    outcome: run.outcome,
    agentHarness: normalizeHarnessKind(agentRun?.harnessKind ?? null) ?? runtimeContext?.harness ?? null,
    agentStatus: agentRun ? normalizeAgentRunStatus(agentRun.status) : null,
    agentFailureKind: agentRun?.failureKind ?? null,
    agentFailureOrigin: agentRun?.failureOrigin ?? null,
    agentFailureMessagePreview: agentRun?.failureMessagePreview ?? null,
    model: agentRun?.model ?? runtimeContext?.model ?? null,
    workerHost: run.workerHost,
    workspacePath: run.workspacePath,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    commitHashStart: run.commitHashStart,
    commitHashEnd: run.commitHashEnd,
    turnCount: agentRun?.turnCount ?? 0,
    eventCount,
    lastEventType: agentRun?.latestEventType ?? null,
    lastEventAt: agentRun?.latestEventAt ?? null,
    durationSeconds: computeDurationSeconds(run.startedAt, run.endedAt),
    errorClass: run.errorClass ?? null,
    errorMessage: run.errorMessage ?? null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + cachedInputTokens + outputTokens,
    machineLoad: buildRunMachineLoadSummary(run)
  };
}

function buildRunMachineLoadSummary(
  run: typeof symphonyRunsTable.$inferSelect
): SymphonyForensicsRunSummary["machineLoad"] {
  if (
    typeof run.machineLoadSampleCount !== "number" ||
    run.machineLoadSampleCount <= 0 ||
    typeof run.machineLoadMaxMemoryPercent !== "number" ||
    typeof run.machineLoadAvgMemoryPercent !== "number"
  ) {
    return null;
  }

  return {
    sampleCount: run.machineLoadSampleCount,
    maxCpuPercent: run.machineLoadMaxCpuPercent ?? null,
    avgCpuPercent: run.machineLoadAvgCpuPercent ?? null,
    maxMemoryPercent: run.machineLoadMaxMemoryPercent,
    avgMemoryPercent: run.machineLoadAvgMemoryPercent,
    maxDiskPercent: run.machineLoadMaxDiskPercent ?? null,
    avgDiskPercent: run.machineLoadAvgDiskPercent ?? null,
    hadHighCpu: run.machineLoadHadHighCpu ?? false,
    hadHighMemory: run.machineLoadHadHighMemory ?? false,
    hadHighDisk: run.machineLoadHadHighDisk ?? false
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
  agentTurn: typeof symphonyAgentTurnsTable.$inferSelect | undefined,
  legacyUsage: unknown
): SymphonyAgentTurnRecord["usage"] {
  if (agentTurn) {
    const usage = {
      input_tokens: agentTurn.inputTokens,
      cached_input_tokens: agentTurn.cachedInputTokens,
      output_tokens: agentTurn.outputTokens
    };

    if (
      agentTurn.status !== "running" ||
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
): "pi" | null {
  switch (harness) {
    case "codex":
      return "pi";
    case "pi":
      return "pi";
    default:
      return null;
  }
}

function mapAgentRunRecord(
  run: typeof symphonyAgentRunsTable.$inferSelect
): SymphonyAgentRunRecord {
  return {
    ...run,
    harnessKind: normalizeHarnessKind(run.harnessKind),
    status: normalizeAgentRunStatus(run.status),
    totalTokens: run.inputTokens + run.cachedInputTokens + run.outputTokens
  };
}

function mapAgentTurnRecord(
  turn: typeof symphonyAgentTurnsTable.$inferSelect
): SymphonyAgentTurnRecord {
  return {
    ...turn,
    harnessKind: normalizeHarnessKind(turn.harnessKind),
    status: normalizeAgentTurnStatus(turn.status),
    totalTokens: turn.inputTokens + turn.cachedInputTokens + turn.outputTokens,
    usage: buildUsage(turn, null)
  };
}

function mapAgentTurnRecords(
  turns: Array<typeof symphonyAgentTurnsTable.$inferSelect>
): SymphonyAgentTurnRecord[] {
  return [...turns]
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map(mapAgentTurnRecord);
}

function mapAgentItemRecord(
  row: typeof symphonyAgentItemsTable.$inferSelect
): SymphonyAgentItemRecord {
  return {
    ...row,
    finalStatus: normalizeItemLifecycleStatus(row.finalStatus)
  };
}

function mapAgentCommandExecutionRecord(
  row: typeof symphonyAgentCommandExecutionsTable.$inferSelect
): SymphonyAgentCommandExecutionRecord {
  return {
    ...row,
    status: normalizeItemLifecycleStatus(row.status) ?? "in_progress"
  };
}

function mapAgentToolCallRecords(
  input: Pick<
    RunData,
    | "toolRows"
    | "piReadRows"
    | "piEditRows"
    | "piWriteRows"
    | "piGrepRows"
    | "piFindRows"
  >
): SymphonyAgentToolCallRecord[] {
  const piReadByKey = new Map(
    input.piReadRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
  );
  const piEditByKey = new Map(
    input.piEditRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
  );
  const piWriteByKey = new Map(
    input.piWriteRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
  );
  const piGrepByKey = new Map(
    input.piGrepRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
  );
  const piFindByKey = new Map(
    input.piFindRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
  );

  return input.toolRows.map((row) => {
    const key = toolRowKey(row.runId, row.turnId, row.itemId);
    const piRead = piReadByKey.get(key);
    const piEdit = piEditByKey.get(key);
    const piWrite = piWriteByKey.get(key);
    const piGrep = piGrepByKey.get(key);
    const piFind = piFindByKey.get(key);

    const parsedPiEdit = parseKnownPiToolArguments(
      row.tool,
      row.argumentsJson
    ) as PiEditArguments | null;
    const parsedPiWrite = parseKnownPiToolArguments(
      row.tool,
      row.argumentsJson
    ) as PiWriteArguments | null;

    return {
      ...row,
      status: normalizeItemLifecycleStatus(row.status) ?? "in_progress",
      argumentsJson: (row.argumentsJson ?? null) as SymphonyAgentToolCallRecord["argumentsJson"],
      piRead:
        piRead === undefined
          ? undefined
          : {
              path: piRead.path,
              offset: piRead.readOffset,
              limit: piRead.readLimit
            },
      piEdit:
        piEdit === undefined
          ? undefined
          : {
              path: piEdit.path,
              editCount: piEdit.editCount,
              lineCount: parsedPiEdit ? countPiEditLines(parsedPiEdit) : piEdit.editCount,
              edits: parsedPiEdit?.edits ?? []
            },
      piWrite:
        piWrite === undefined
          ? undefined
          : {
              path: piWrite.path,
              lineCount: parsedPiWrite ? countNonEmptyLines(parsedPiWrite.content) : 1
            },
      piGrep:
        piGrep === undefined
          ? undefined
          : {
              pattern: piGrep.pattern,
              path: piGrep.searchPath,
              ignoreCase: piGrep.ignoreCase
            },
      piFind:
        piFind === undefined
          ? undefined
          : {
              pattern: piFind.pattern,
              path: piFind.searchPath
            }
    };
  });
}

function countPiEditLines(value: PiEditArguments): number {
  return value.edits.reduce((total, edit) => {
    const oldLineCount = countNonEmptyLines(edit.oldText);
    const newLineCount = countNonEmptyLines(edit.newText);

    return total + Math.max(oldLineCount, newLineCount, 1);
  }, 0);
}

function countNonEmptyLines(value: string): number {
  if (value === "") {
    return 0;
  }

  return value.split("\n").length;
}

function toolRowKey(runId: string, turnId: string, itemId: string): string {
  return `${runId}:${turnId}:${itemId}`;
}

function mapAgentMessageRecord(
  row: typeof symphonyAgentMessagesTable.$inferSelect,
  piMessageEnd?: typeof piMessageEndsTable.$inferSelect
): SymphonyAgentMessageRecord {
  return {
    ...row,
    piMessage:
      piMessageEnd === undefined
        ? undefined
        : {
            responseId: piMessageEnd.responseId,
            api: piMessageEnd.api,
            provider: piMessageEnd.provider,
            model: piMessageEnd.model,
            stopReason: piMessageEnd.stopReason,
            responseTimestamp: piMessageEnd.responseTimestamp,
            inputTokens: piMessageEnd.inputTokens,
            cachedInputTokens: piMessageEnd.cachedInputTokens,
            cacheWriteTokens: piMessageEnd.cacheWriteTokens,
            outputTokens: piMessageEnd.outputTokens,
            totalTokens: piMessageEnd.totalTokens
          }
  };
}

function mapAgentReasoningRecord(
  row: typeof symphonyAgentReasoningTable.$inferSelect,
  piMessageEnd?: typeof piMessageEndsTable.$inferSelect
): SymphonyAgentReasoningBlockRecord {
  return {
    ...row,
    piMessage:
      piMessageEnd === undefined
        ? undefined
        : {
            responseId: piMessageEnd.responseId,
            api: piMessageEnd.api,
            provider: piMessageEnd.provider,
            model: piMessageEnd.model,
            stopReason: piMessageEnd.stopReason,
            responseTimestamp: piMessageEnd.responseTimestamp,
            inputTokens: piMessageEnd.inputTokens,
            cachedInputTokens: piMessageEnd.cachedInputTokens,
            cacheWriteTokens: piMessageEnd.cacheWriteTokens,
            outputTokens: piMessageEnd.outputTokens,
            totalTokens: piMessageEnd.totalTokens
          }
  };
}

function mapAgentFileChangeRecord(
  row: typeof symphonyAgentFileChangesTable.$inferSelect
): SymphonyAgentFileChangeRecord {
  return { ...row };
}

function mapAgentTaskSnapshotRecords(
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
  piMessageEndMap: Map<string, typeof piMessageEndsTable.$inferSelect>;
  fileChangeRows: Array<typeof symphonyAgentFileChangesTable.$inferSelect>;
  taskSnapshotRows: Array<typeof symphonyAgentTaskSnapshotsTable.$inferSelect>;
  taskSnapshotItemRows: Array<typeof symphonyAgentTaskSnapshotItemsTable.$inferSelect>;
}): SymphonyAgentTurnActivityRecord[] {
  const messagesByTurn = groupRowsByTurnId(input.agentMessageRows);
  const reasoningByTurn = groupRowsByTurnId(input.reasoningRows);
  const fileChangesByTurn = groupRowsByTurnId(input.fileChangeRows);
  const taskSnapshots = mapAgentTaskSnapshotRecords(
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
        .map((row) =>
          mapAgentMessageRecord(
            row,
            input.piMessageEndMap.get(toolRowKey(row.runId, row.turnId, row.itemId))
          )
        ),
      reasoningBlocks: (reasoningByTurn.get(turn.turnId) ?? [])
        .sort((left, right) => {
          const recordedAtOrder = compareNullableIso(left.recordedAt, right.recordedAt);
          if (recordedAtOrder !== 0) {
            return recordedAtOrder;
          }

          return compareNullableIso(left.insertedAt, right.insertedAt);
        })
        .map((row) =>
          mapAgentReasoningRecord(
            row,
            input.piMessageEndMap.get(toolRowKey(row.runId, row.turnId, row.itemId))
          )
        ),
      fileChanges: (fileChangesByTurn.get(turn.turnId) ?? []).map(
        mapAgentFileChangeRecord
      ),
      taskSnapshots: taskSnapshotsByTurn.get(turn.turnId) ?? []
    }));
}

function mapAgentEventRecords(
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>,
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>,
  agentTurnMap: Map<string, typeof symphonyAgentTurnsTable.$inferSelect>,
  agentRun: typeof symphonyAgentRunsTable.$inferSelect
): SymphonyAgentEventRecord[] {
  return eventRows.flatMap((row) => {
    const payload = resolveEventPayload(row, overflowMap);

    if (!payload) {
      return [];
    }

    let inferredThreadId: string | null = row.threadId;

    if (inferredThreadId === null && row.turnId) {
      inferredThreadId = agentTurnMap.get(row.turnId)?.threadId ?? null;
    }

    if (inferredThreadId === null) {
      inferredThreadId = agentRun.threadId;
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

function mapAgentOverflowRecord(
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
    mapForensicsTurnRecord(turn, input.agentTurnMap.get(turn.turnId), input.agentRun.threadId ?? null)
  );
  const maxTurnSequence = baseTurns.reduce(
    (max, turn) => Math.max(max, turn.turnSequence),
    0
  );
  const syntheticTurns = input.agentTurns
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
  agentTurn: typeof symphonyAgentTurnsTable.$inferSelect | undefined,
  agentRunThreadId: string | null
): Omit<ForensicsTurn, "eventCount" | "events"> {
  return {
    ...turn,
    threadId: agentTurn?.threadId ?? turn.threadId ?? agentRunThreadId,
    usage: buildUsage(agentTurn, turn.usage),
    metadata: castJsonObject(turn.metadata)
  };
}

function synthesizeForensicsTurnRecord(
  run: typeof symphonyRunsTable.$inferSelect,
  agentTurn: typeof symphonyAgentTurnsTable.$inferSelect,
  turnSequence: number
): Omit<ForensicsTurn, "eventCount" | "events"> {
  return {
    turnId: agentTurn.turnId,
    runId: agentTurn.runId,
    turnSequence,
    threadId: agentTurn.threadId ?? null,
    agentTurnId: agentTurn.turnId,
    sessionId: null,
    promptText: "[agent prompt unavailable]",
    status: agentTurn.status,
    startedAt: agentTurn.startedAt ?? run.startedAt,
    endedAt: agentTurn.endedAt ?? null,
    usage: buildUsage(agentTurn, null),
    metadata: null,
    insertedAt: agentTurn.insertedAt,
    updatedAt: agentTurn.updatedAt
  };
}

function buildForensicsEvents(input: {
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>;
  agentTurnMap: Map<string, typeof symphonyAgentTurnsTable.$inferSelect>;
  agentRun: typeof symphonyAgentRunsTable.$inferSelect;
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
        input.agentTurnMap.get(row.turnId)?.threadId ??
        input.agentRun.threadId ??
        null,
      agentTurnId: row.turnId,
      sessionId: null,
      insertedAt: row.insertedAt
    }];
  });
}

type RunData = {
  run: typeof symphonyRunsTable.$inferSelect;
  agentRun: typeof symphonyAgentRunsTable.$inferSelect;
  issue: typeof symphonyIssuesTable.$inferSelect;
  issueRuns: Array<typeof symphonyRunsTable.$inferSelect>;
  symphonyTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  agentTurns: Array<typeof symphonyAgentTurnsTable.$inferSelect>;
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>;
  agentTurnMap: Map<string, typeof symphonyAgentTurnsTable.$inferSelect>;
  itemRows: Array<typeof symphonyAgentItemsTable.$inferSelect>;
  commandRows: Array<typeof symphonyAgentCommandExecutionsTable.$inferSelect>;
  toolRows: Array<typeof symphonyAgentToolCallsTable.$inferSelect>;
  piReadRows: Array<typeof piReadsTable.$inferSelect>;
  piEditRows: Array<typeof piEditsTable.$inferSelect>;
  piWriteRows: Array<typeof piWritesTable.$inferSelect>;
  piGrepRows: Array<typeof piGrepsTable.$inferSelect>;
  piFindRows: Array<typeof piFindsTable.$inferSelect>;
  piMessageEndRows: Array<typeof piMessageEndsTable.$inferSelect>;
  piMessageEndMap: Map<string, typeof piMessageEndsTable.$inferSelect>;
  agentMessageRows: Array<typeof symphonyAgentMessagesTable.$inferSelect>;
  reasoningRows: Array<typeof symphonyAgentReasoningTable.$inferSelect>;
  fileChangeRows: Array<typeof symphonyAgentFileChangesTable.$inferSelect>;
  taskSnapshotRows: Array<typeof symphonyAgentTaskSnapshotsTable.$inferSelect>;
  taskSnapshotItemRows: Array<typeof symphonyAgentTaskSnapshotItemsTable.$inferSelect>;
  runtimeContext: {
    harness: "pi" | null;
    processId: string | null;
    model: string | null;
    reasoningEffort: string | null;
    profile: string | null;
    providerId: string | null;
    providerName: string | null;
    authMode: string | null;
    providerEnvKey: string | null;
    launchTarget: SymphonyRuntimeLaunchTarget | null;
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

  const [agentRun, issue, issueRuns, symphonyTurns, agentTurns, eventRows, itemRows, commandRows, toolRows, piReadRows, piEditRows, piWriteRows, piGrepRows, piFindRows, piMessageEndRows, agentMessageRows, reasoningRows, fileChangeRows, taskSnapshotRows, runtimeLogRows] =
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
      db.select().from(piReadsTable).where(eq(piReadsTable.runId, runId)).all(),
      db.select().from(piEditsTable).where(eq(piEditsTable.runId, runId)).all(),
      db.select().from(piWritesTable).where(eq(piWritesTable.runId, runId)).all(),
      db.select().from(piGrepsTable).where(eq(piGrepsTable.runId, runId)).all(),
      db.select().from(piFindsTable).where(eq(piFindsTable.runId, runId)).all(),
      db.select().from(piMessageEndsTable).where(eq(piMessageEndsTable.runId, runId)).all(),
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

  if (!agentRun || !issue) {
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
  const agentTurnMap = new Map(agentTurns.map((turn) => [turn.turnId, turn] as const));
  const piMessageEndMap = new Map(
    piMessageEndRows.map((row) => [toolRowKey(row.runId, row.turnId, row.itemId), row] as const)
  );
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
    agentTurnMap,
    agentRun
  });
  const runtimeContext = extractRuntimeContext(runtimeLogRows);

  return {
    run,
    agentRun,
    issue,
    issueRuns,
    symphonyTurns,
    agentTurns,
    eventRows,
    overflowMap,
    agentTurnMap,
    itemRows,
    commandRows,
    toolRows,
    piReadRows,
    piEditRows,
    piWriteRows,
    piGrepRows,
    piFindRows,
    piMessageEndRows,
    piMessageEndMap,
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
  harness: "pi" | null;
  processId: string | null;
  model: string | null;
  reasoningEffort: string | null;
  profile: string | null;
  providerId: string | null;
  providerName: string | null;
  authMode: string | null;
  providerEnvKey: string | null;
  launchTarget: SymphonyRuntimeLaunchTarget | null;
} {
  let harness: "pi" | null = null;
  let processId: string | null = null;
  let model: string | null = null;
  let reasoningEffort: string | null = null;
  let profile: string | null = null;
  let providerId: string | null = null;
  let providerName: string | null = null;
  let authMode: string | null = null;
  let providerEnvKey: string | null = null;
  let launchTarget: SymphonyRuntimeLaunchTarget | null = null;

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
      if (payloadHarness === "codex" || payloadHarness === "pi") {
        harness = "pi";
      }
    }

    model ??=
      typeof payload.model === "string" && payload.model !== ""
        ? payload.model
        : null;
    processId ??=
      typeof payload.processId === "string" && payload.processId !== ""
        ? payload.processId
        : null;
    reasoningEffort ??=
      typeof payload.reasoningEffort === "string" && payload.reasoningEffort !== ""
        ? payload.reasoningEffort
        : null;
    profile ??=
      typeof payload.profile === "string" && payload.profile !== ""
        ? payload.profile
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
    if (
      launchTarget === null &&
      payload.launchTarget &&
      typeof payload.launchTarget === "object" &&
      !Array.isArray(payload.launchTarget)
    ) {
      const candidate = payload.launchTarget as Record<string, unknown>;

      if (
        candidate.kind === "container" &&
        typeof candidate.hostLaunchPath === "string" &&
        typeof candidate.runtimeWorkspacePath === "string" &&
        typeof candidate.containerName === "string" &&
        typeof candidate.shell === "string"
      ) {
        launchTarget = {
          kind: "container",
          hostLaunchPath: candidate.hostLaunchPath,
          hostWorkspacePath:
            typeof candidate.hostWorkspacePath === "string"
              ? candidate.hostWorkspacePath
              : null,
          runtimeWorkspacePath: candidate.runtimeWorkspacePath,
          containerId:
            typeof candidate.containerId === "string" ? candidate.containerId : null,
          containerName: candidate.containerName,
          shell: candidate.shell
        };
      }
    }
  }

  return {
    harness,
    processId,
    model,
    reasoningEffort,
    profile,
    providerId,
    providerName,
    authMode,
    providerEnvKey,
    launchTarget
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
