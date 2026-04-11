import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  type PiEditArguments
} from "@symphony/contracts";
import {
  symphonyAgentCommandExecutionsTable,
  symphonyAgentEventLogTable,
  symphonyAgentFileChangesTable,
  symphonyAgentItemsTable,
  symphonyAgentMessagesTable,
  symphonyAgentPayloadOverflowTable,
  symphonyAgentReasoningTable,
  symphonyAgentTaskSnapshotItemsTable,
  symphonyAgentTaskSnapshotsTable,
  symphonyAgentToolCallsTable,
  piReadsTable,
  piEditsTable,
  piWritesTable,
  piGrepsTable,
  piFindsTable,
  piMessageEndsTable,
  symphonyIssueDeliveryReportsTable,
  symphonyIssuesTable,
  symphonyRunRuntimeContextTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";
import {
  buildRuntimeRunContextMap,
  mapRuntimeRunContextRow,
  requireRuntimeRunContextRow
} from "./runtime-run-context.js";
import type { SymphonyRuntimeRunContext } from "./runtime-run-context.js";
import {
  buildRuntimeIssueSummary,
  buildRuntimeRunSummary,
  computeRuntimeRunTokenTotals,
  isProblemOutcome,
  normalizeOptionalRuntimeRunOutcome,
  normalizeRuntimeTurnStatus
} from "./runtime-run-summary.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;

export interface AgentAnalyticsReadStore {
  hasRun(runId: SymphonyAgentRunQuery["runId"]): Promise<boolean>;
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

  async hasRun(runId: SymphonyAgentRunQuery["runId"]): Promise<boolean> {
    const row = await this.#db
      .select({
        runId: symphonyRunsTable.runId
      })
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    return row !== undefined;
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
    const issueIdentifiers = [...new Set(runs.map((run) => run.issueIdentifier))];
    const issues = this.#db
      .select()
      .from(symphonyIssuesTable)
      .where(inArray(symphonyIssuesTable.issueIdentifier, issueIdentifiers))
      .all();
    const runtimeTurns = this.#db
      .select()
      .from(symphonyTurnsTable)
      .where(inArray(symphonyTurnsTable.runId, runIds))
      .all();
    const eventRows = this.#db
      .select()
      .from(symphonyAgentEventLogTable)
      .where(inArray(symphonyAgentEventLogTable.runId, runIds))
      .all();
    const runtimeContextRows = this.#db
      .select()
      .from(symphonyRunRuntimeContextTable)
      .where(inArray(symphonyRunRuntimeContextTable.runId, runIds))
      .all();
    const deliveryRows = this.#db
      .select()
      .from(symphonyIssueDeliveryReportsTable)
      .where(inArray(symphonyIssueDeliveryReportsTable.runId, runIds))
      .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
      .all();

    const runtimeTurnsByRunId = groupRowsByRunId(runtimeTurns);
    const eventRowsByRunId = groupRowsByRunId(eventRows);
    const runtimeContextMap = buildRuntimeRunContextMap(runtimeContextRows);
    const deliveryMap = buildLatestDeliveryReportByRunId(deliveryRows);
    const issueMap = new Map(
      issues.map((issue) => [issue.issueIdentifier, issue] as const)
    );

    return runs.map((run) => {
      const issue = requireIssueRecord(
        issueMap.get(run.issueIdentifier),
        run.runId,
        run.issueIdentifier
      );

      return buildForensicsRunSummary(
        issue,
        run,
        runtimeTurnsByRunId.get(run.runId) ?? [],
        mapEventRowsForRunSummary(eventRowsByRunId.get(run.runId) ?? []),
        deliveryMap.get(run.runId),
        runtimeContextMap.get(run.runId)
      );
    });
  }

  async listRunsForIssue(
    issueIdentifier: string,
    opts: Partial<SymphonyForensicsIssueQuery> = {}
  ): Promise<SymphonyForensicsRunSummary[]> {
    return this.listRuns({
      repo: opts.repo,
      issueIdentifier,
      limit: opts.limit
    });
  }

  async listProblemRuns(
    opts: Partial<SymphonyForensicsProblemRunsQuery> = {}
  ): Promise<SymphonyForensicsRunSummary[]> {
    return this.listRuns({
      limit: opts.limit,
      repo: opts.repo,
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

    const runtimeContext = requireRuntimeRunContextRow(
      data.runtimeContextRow,
      `Run ${runId}`
    );
    const turns = buildForensicsTurns(data, runtimeContext);
    const allEvents = turns.flatMap((turn) => turn.events);
    const lastEvent = [...allEvents].sort((left, right) => {
      const recordedAtOrder = (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "");

      if (recordedAtOrder !== 0) {
        return recordedAtOrder;
      }

      return right.eventSequence - left.eventSequence;
    })[0];

    return {
      issue: buildForensicsIssueExport(data.issue, data.issueRuns, data.issueDeliveryRows),
      run: {
        ...buildForensicsRunSummary(
          data.issue,
          mapPersistedRunRecord(data.run),
          data.symphonyTurns,
          mapEventRowsForRunSummary(data.eventRows),
          data.latestRunDelivery ?? undefined,
          runtimeContext
        ),
        threadId: runtimeContext.threadId,
        processId: runtimeContext.processId,
        providerId: runtimeContext.providerId,
        providerName: runtimeContext.providerName,
        reasoningEffort: runtimeContext.reasoningEffort,
        profile: runtimeContext.profile,
        authMode: normalizeForensicsAuthMode(runtimeContext.authMode),
        providerEnvKey: runtimeContext.providerEnvKey,
        launchTarget: runtimeContext.launchTarget,
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
      deliveryReport: data.latestRunDelivery
        ? mapForensicsDeliveryReport(data.latestRunDelivery, data.issue)
        : null,
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

    const runtimeContext = requireRuntimeRunContextRow(
      data.runtimeContextRow,
      `Run ${runId}`
    );
    const turns = buildAgentArtifactTurnRecords(data);

    return {
      run: buildAgentArtifactRunRecord(data, turns, runtimeContext),
      turns,
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
        turns,
        agentMessageRows: data.agentMessageRows,
        reasoningRows: data.reasoningRows,
        piMessageEndMap: data.piMessageEndMap,
        fileChangeRows: data.fileChangeRows,
        taskSnapshotRows: data.taskSnapshotRows,
        taskSnapshotItemRows: data.taskSnapshotItemRows
      }),
      events: mapAgentEventRecords(
        data.eventRows,
        data.overflowMap,
        buildRuntimeTurnMap(data.symphonyTurns),
        runtimeContext.threadId
      )
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
    const data = await loadRunData(this.#db, runId);
    return data ? buildAgentArtifactTurnRecords(data) : [];
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
      turns: buildAgentArtifactTurnRecords(data),
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

type SummaryEventRow = {
  runId: string;
  eventSequence: number;
  eventType: string;
  recordedAt: string;
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
  issue: typeof symphonyIssuesTable.$inferSelect,
  run: PersistedRunRecord,
  runtimeTurns: Array<typeof symphonyTurnsTable.$inferSelect>,
  eventRows: SummaryEventRow[],
  deliveryReport: typeof symphonyIssueDeliveryReportsTable.$inferSelect | undefined,
  runtimeContext?: {
    harness: "pi" | null;
    model: string | null;
    providerId: string | null;
    providerName: string | null;
  }
): SymphonyForensicsRunSummary {
  const runtimeSummary = buildRuntimeRunSummary(issue, run, runtimeTurns, eventRows);
  const runtimeTokenTotals = computeRuntimeRunTokenTotals(runtimeTurns);
  const inputTokens = runtimeSummary.inputTokens;
  const cachedInputTokens = runtimeTokenTotals.cachedInputTokens;
  const outputTokens = runtimeSummary.outputTokens;
  const totalTokens = inputTokens + cachedInputTokens + outputTokens;

  return {
    runId: run.runId,
    repositoryKey: run.repositoryKey,
    trackerIssueId: issue.trackerIssueId,
    issueIdentifier: run.issueIdentifier,
    attempt: run.attempt,
    runMode: run.runMode,
    status: runtimeSummary.status,
    outcome: runtimeSummary.outcome,
    agentHarness: runtimeContext?.harness ?? null,
    agentStatus: normalizeAgentRunStatus(run.status),
    agentFailureKind: deriveFailureKind(run),
    agentFailureOrigin: null,
    agentFailureMessagePreview: run.errorMessage ?? null,
    model: runtimeContext?.model ?? null,
    workerHost: run.workerHost,
    workspacePath: run.workspacePath,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    commitHashStart: run.commitHashStart,
    commitHashEnd: run.commitHashEnd,
    turnCount: runtimeSummary.turnCount,
    eventCount: runtimeSummary.eventCount,
    lastEventType: runtimeSummary.lastEventType,
    lastEventAt: runtimeSummary.lastEventAt,
    durationSeconds: runtimeSummary.durationSeconds,
    errorClass: run.errorClass ?? null,
    errorMessage: run.errorMessage ?? null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    deliveryStatus: normalizeOptionalDeliveryStatus(deliveryReport?.status, "delivery report"),
    deliveryReportedAt: deliveryReport?.reportedAt ?? null,
    deliveryPrUrl: deliveryReport?.prUrl ?? null,
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

function deriveFailureKind(run: typeof symphonyRunsTable.$inferSelect): string | null {
  if (run.errorClass) {
    return run.errorClass;
  }

  const outcome = normalizeOptionalRuntimeRunOutcome(run.outcome);
  return outcome && isProblemOutcome(outcome) ? outcome : null;
}

function buildUsage(legacyUsage: unknown): SymphonyAgentTurnRecord["usage"] {
  return parseLegacyUsage(legacyUsage);
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

function groupRowsByRunId<T extends { runId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const group = groups.get(row.runId);

    if (group) {
      group.push(row);
      continue;
    }

    groups.set(row.runId, [row]);
  }

  return groups;
}

function mapEventRowsForRunSummary(
  rows: Array<typeof symphonyAgentEventLogTable.$inferSelect>
): SummaryEventRow[] {
  return rows.map((row) => ({
    runId: row.runId,
    eventSequence: row.sequence,
    eventType: row.eventType,
    recordedAt: row.recordedAt
  }));
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

function matchesRunFilters(
  run: PersistedRunRecord,
  opts: SymphonyForensicsRunsQuery
): boolean {
  if (opts.issueIdentifier && run.issueIdentifier !== opts.issueIdentifier) {
    return false;
  }

  if (opts.repo && run.repositoryKey !== opts.repo) {
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
  runs: Array<typeof symphonyRunsTable.$inferSelect>,
  deliveryRows: Array<typeof symphonyIssueDeliveryReportsTable.$inferSelect>
): SymphonyForensicsRunDetailResult["issue"] {
  const summary = buildRuntimeIssueSummary(issue, runs);
  const latestDelivery = deliveryRows[0] ?? null;
  const latestByRunId = buildLatestDeliveryReportByRunId(deliveryRows);

  return {
    ...summary,
    latestDeliveryStatus: normalizeOptionalDeliveryStatus(
      latestDelivery?.status,
      "delivery report"
    ),
    latestDeliveryReportedAt: latestDelivery?.reportedAt ?? null,
    latestDeliveryRunId: latestDelivery?.runId ?? null,
    latestDeliveryPrUrl: latestDelivery?.prUrl ?? null,
    deliveredRunCount: Array.from(latestByRunId.values()).filter(
      (row) => normalizeOptionalDeliveryStatus(row.status, "delivery report") === "completed"
    ).length
  };
}

function requireIssueRecord(
  issue: typeof symphonyIssuesTable.$inferSelect | undefined,
  runId: string,
  issueIdentifier: string
): typeof symphonyIssuesTable.$inferSelect {
  if (issue) {
    return issue;
  }

  throw new TypeError(
    `Run ${runId} is missing canonical issue ${issueIdentifier}.`
  );
}

function buildLatestDeliveryReportByRunId(
  rows: Array<typeof symphonyIssueDeliveryReportsTable.$inferSelect>
): Map<string, typeof symphonyIssueDeliveryReportsTable.$inferSelect> {
  const result = new Map<string, typeof symphonyIssueDeliveryReportsTable.$inferSelect>();

  for (const row of rows) {
    if (!result.has(row.runId)) {
      result.set(row.runId, row);
    }
  }

  return result;
}

function mapForensicsDeliveryReport(
  row: typeof symphonyIssueDeliveryReportsTable.$inferSelect,
  issue: typeof symphonyIssuesTable.$inferSelect
): SymphonyForensicsRunDetailResult["deliveryReport"] {
  return {
    repositoryKey: issue.repositoryKey,
    reportId: row.reportId,
    trackerIssueId: issue.trackerIssueId,
    issueIdentifier: row.issueIdentifier,
    runId: row.runId,
    turnId: row.turnId ?? null,
    status: normalizeRequiredDeliveryStatus(row.status, "delivery report"),
    summary: row.summary,
    prUrl: row.prUrl ?? null,
    prNumber: row.prNumber ?? null,
    branchName: row.branchName ?? null,
    blockingReason: row.blockingReason ?? null,
    testsSummary: row.testsSummary ?? null,
    source: row.source,
    reportedAt: row.reportedAt,
    insertedAt: row.insertedAt
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
      throw new TypeError(`Unknown agent run status: ${status}`);
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
      throw new TypeError(`Unknown agent turn status: ${status}`);
  }
}

function normalizeItemLifecycleStatus(
  status: string | null
): SymphonyAgentItemLifecycleStatus | null {
  if (status === null) {
    return null;
  }

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
      throw new TypeError(`Unknown agent item lifecycle status: ${status}`);
  }
}

function normalizeOptionalDeliveryStatus(
  status: string | null | undefined,
  subject: string
): "completed" | "blocked" | "partial" | null {
  if (status === null || status === undefined) {
    return null;
  }

  switch (status) {
    case "completed":
    case "blocked":
    case "partial":
      return status;
    default:
      throw new TypeError(`Unknown ${subject} status: ${status}`);
  }
}

function normalizeRequiredDeliveryStatus(
  status: string | null | undefined,
  subject: string
): "completed" | "blocked" | "partial" {
  const normalized = normalizeOptionalDeliveryStatus(status, subject);

  if (normalized !== null) {
    return normalized;
  }

  throw new TypeError(`Missing ${subject} status.`);
}

function normalizeForensicsAuthMode(
  value: string | null
): "auth_json" | "api_key_env" | null {
  if (value === null) {
    return null;
  }

  switch (value) {
    case "auth_json":
    case "api_key_env":
      return value;
    default:
      throw new TypeError(`Unknown forensics auth mode: ${value}`);
  }
}

function buildAgentArtifactRunRecord(
  input: RunData,
  turns: SymphonyAgentTurnRecord[],
  runtimeContext: SymphonyRuntimeRunContext
): SymphonyAgentRunRecord {
  const tokenTotals = computeRuntimeRunTokenTotals(input.symphonyTurns);
  const latestEvent = input.eventRows.at(-1) ?? null;

  return {
    runId: input.run.runId,
    threadId: runtimeContext.threadId,
    harnessKind: runtimeContext.harness,
    model: runtimeContext.model,
    providerId: runtimeContext.providerId,
    providerName: runtimeContext.providerName,
    trackerIssueId: input.issue.trackerIssueId,
    issueIdentifier: input.run.issueIdentifier,
    startedAt: input.run.startedAt,
    endedAt: input.run.endedAt,
    status: normalizeAgentRunStatus(input.run.status),
    failureKind: deriveFailureKind(input.run),
    failureOrigin: null,
    failureMessagePreview: input.run.errorMessage ?? null,
    finalTurnId: turns.at(-1)?.turnId ?? null,
    lastAgentMessageItemId: null,
    lastAgentMessagePreview: null,
    lastAgentMessageOverflowId: null,
    inputTokens: tokenTotals.inputTokens,
    cachedInputTokens: tokenTotals.cachedInputTokens,
    outputTokens: tokenTotals.outputTokens,
    totalTokens:
      tokenTotals.inputTokens +
      tokenTotals.cachedInputTokens +
      tokenTotals.outputTokens,
    turnCount: turns.length,
    itemCount: input.itemRows.length,
    commandCount: input.commandRows.length,
    toolCallCount: input.toolRows.length,
    fileChangeCount: input.fileChangeRows.length,
    agentMessageCount: input.agentMessageRows.length,
    reasoningCount: input.reasoningRows.length,
    errorCount: input.eventRows.filter((row) => row.eventType === "error").length,
    latestEventAt: latestEvent?.recordedAt ?? null,
    latestEventType: latestEvent?.eventType ?? null,
    insertedAt: input.run.insertedAt,
    updatedAt: input.run.updatedAt
  };
}

function buildAgentArtifactTurnRecords(input: RunData): SymphonyAgentTurnRecord[] {
  return input.symphonyTurns.map((runtimeTurn) => synthesizeAgentTurnRecord(input, runtimeTurn)).sort((left, right) =>
    compareNullableIso(
      left.startedAt ?? left.latestEventAt ?? left.insertedAt,
      right.startedAt ?? right.latestEventAt ?? right.insertedAt
    )
  );
}

function synthesizeAgentTurnRecord(
  input: RunData,
  runtimeTurn: typeof symphonyTurnsTable.$inferSelect
): SymphonyAgentTurnRecord {
  const usage = buildUsage(runtimeTurn.usage);
  const latestEvent = latestTurnEventRow(input.eventRows, runtimeTurn.turnId);
  const inputTokens = usage?.input_tokens ?? 0;
  const cachedInputTokens = usage?.cached_input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  return {
    turnId: runtimeTurn.turnId,
    runId: runtimeTurn.runId,
    threadId: runtimeTurn.threadId,
    harnessKind: input.runtimeContext?.harness ?? null,
    model: input.runtimeContext?.model ?? null,
    providerId: input.runtimeContext?.providerId ?? null,
    providerName: input.runtimeContext?.providerName ?? null,
    startedAt: runtimeTurn.startedAt,
    endedAt: runtimeTurn.endedAt,
    status: normalizeAgentTurnStatus(runtimeTurn.status),
    failureKind: null,
    failureMessagePreview: null,
    lastAgentMessageItemId: null,
    lastAgentMessagePreview: null,
    lastAgentMessageOverflowId: null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + cachedInputTokens + outputTokens,
    usage,
    itemCount: countRowsForTurn(input.itemRows, runtimeTurn.turnId),
    commandCount: countRowsForTurn(input.commandRows, runtimeTurn.turnId),
    toolCallCount: countRowsForTurn(input.toolRows, runtimeTurn.turnId),
    fileChangeCount: countRowsForTurn(input.fileChangeRows, runtimeTurn.turnId),
    agentMessageCount: countRowsForTurn(input.agentMessageRows, runtimeTurn.turnId),
    reasoningCount: countRowsForTurn(input.reasoningRows, runtimeTurn.turnId),
    errorCount: countRowsForTurn(
      input.eventRows.filter((row) => row.eventType === "error"),
      runtimeTurn.turnId
    ),
    latestEventAt: latestEvent?.recordedAt ?? null,
    latestEventType: latestEvent?.eventType ?? null,
    insertedAt: runtimeTurn.insertedAt,
    updatedAt: runtimeTurn.updatedAt
  };
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
  const { resourceProfileJson, ...rest } = row;

  return {
    ...rest,
    status: normalizeRequiredItemLifecycleStatus(rest.status, "command execution"),
    resourceProfile: normalizeAgentCommandResourceProfile(resourceProfileJson)
  };
}

function normalizeRequiredItemLifecycleStatus(
  status: string | null,
  subject: string
): SymphonyAgentItemLifecycleStatus {
  const normalized = normalizeItemLifecycleStatus(status);

  if (normalized !== null) {
    return normalized;
  }

  throw new TypeError(`Missing ${subject} lifecycle status.`);
}

function normalizeAgentCommandResourceProfile(
  value: unknown
): SymphonyAgentCommandExecutionRecord["resourceProfile"] {
  const emptyProfile: SymphonyAgentCommandExecutionRecord["resourceProfile"] = {
    captureScope: "session_process_tree",
    samplingIntervalMs: 1_000,
    firstSampledAt: null,
    lastSampledAt: null,
    sampleCount: 0,
    peakCpuPercent: 0,
    peakMemPercent: 0,
    peakRssKb: 0,
    peakProcessCount: 0,
    topProcesses: [],
    samples: []
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyProfile;
  }

  const record = value as Record<string, unknown>;
  const normalizeProcessSummary = (
    candidate: unknown
  ): SymphonyAgentCommandExecutionRecord["resourceProfile"]["topProcesses"][number] | null => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }

    const entry = candidate as Record<string, unknown>;
    return {
      command: typeof entry.command === "string" ? entry.command : "",
      executable: typeof entry.executable === "string" ? entry.executable : null,
      peakCpuPercent:
        typeof entry.peakCpuPercent === "number" && Number.isFinite(entry.peakCpuPercent)
          ? Math.max(0, entry.peakCpuPercent)
          : 0,
      peakMemPercent:
        typeof entry.peakMemPercent === "number" && Number.isFinite(entry.peakMemPercent)
          ? Math.max(0, entry.peakMemPercent)
          : 0,
      peakRssKb:
        typeof entry.peakRssKb === "number" && Number.isFinite(entry.peakRssKb)
          ? Math.max(0, Math.trunc(entry.peakRssKb))
          : 0,
      sampleCount:
        typeof entry.sampleCount === "number" && Number.isFinite(entry.sampleCount)
          ? Math.max(0, Math.trunc(entry.sampleCount))
          : 0
    };
  };

  const topProcesses = Array.isArray(record.topProcesses)
    ? record.topProcesses
        .map(normalizeProcessSummary)
        .filter(
          (
            entry
          ): entry is SymphonyAgentCommandExecutionRecord["resourceProfile"]["topProcesses"][number] =>
            entry !== null
        )
    : [];

  const samples = Array.isArray(record.samples)
    ? record.samples
        .map((candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            return null;
          }

          const entry = candidate as Record<string, unknown>;
          return {
            recordedAt:
              typeof entry.recordedAt === "string"
                ? entry.recordedAt
                : new Date(0).toISOString(),
            processCount:
              typeof entry.processCount === "number" && Number.isFinite(entry.processCount)
                ? Math.max(0, Math.trunc(entry.processCount))
                : 0,
            totalCpuPercent:
              typeof entry.totalCpuPercent === "number" && Number.isFinite(entry.totalCpuPercent)
                ? Math.max(0, entry.totalCpuPercent)
                : 0,
            totalMemPercent:
              typeof entry.totalMemPercent === "number" && Number.isFinite(entry.totalMemPercent)
                ? Math.max(0, entry.totalMemPercent)
                : 0,
            totalRssKb:
              typeof entry.totalRssKb === "number" && Number.isFinite(entry.totalRssKb)
                ? Math.max(0, Math.trunc(entry.totalRssKb))
                : 0,
            topProcesses: Array.isArray(entry.topProcesses)
              ? entry.topProcesses
                  .map(normalizeProcessSummary)
                  .filter(
                    (
                      processEntry
                    ): processEntry is SymphonyAgentCommandExecutionRecord["resourceProfile"]["topProcesses"][number] =>
                      processEntry !== null
                  )
              : []
          };
        })
        .filter(
          (
            entry
          ): entry is SymphonyAgentCommandExecutionRecord["resourceProfile"]["samples"][number] =>
            entry !== null
        )
    : [];

  return {
    captureScope:
      record.captureScope === "session_process_tree"
        ? "session_process_tree"
        : emptyProfile.captureScope,
    samplingIntervalMs:
      typeof record.samplingIntervalMs === "number" && Number.isFinite(record.samplingIntervalMs)
        ? Math.max(1, Math.trunc(record.samplingIntervalMs))
        : emptyProfile.samplingIntervalMs,
    firstSampledAt:
      typeof record.firstSampledAt === "string" ? record.firstSampledAt : emptyProfile.firstSampledAt,
    lastSampledAt:
      typeof record.lastSampledAt === "string" ? record.lastSampledAt : emptyProfile.lastSampledAt,
    sampleCount:
      typeof record.sampleCount === "number" && Number.isFinite(record.sampleCount)
        ? Math.max(0, Math.trunc(record.sampleCount))
        : samples.length,
    peakCpuPercent:
      typeof record.peakCpuPercent === "number" && Number.isFinite(record.peakCpuPercent)
        ? Math.max(0, record.peakCpuPercent)
        : 0,
    peakMemPercent:
      typeof record.peakMemPercent === "number" && Number.isFinite(record.peakMemPercent)
        ? Math.max(0, record.peakMemPercent)
        : 0,
    peakRssKb:
      typeof record.peakRssKb === "number" && Number.isFinite(record.peakRssKb)
        ? Math.max(0, Math.trunc(record.peakRssKb))
        : 0,
    peakProcessCount:
      typeof record.peakProcessCount === "number" && Number.isFinite(record.peakProcessCount)
        ? Math.max(0, Math.trunc(record.peakProcessCount))
        : 0,
    topProcesses,
    samples
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

    const parsedPiEdit = parseKnownPiToolArguments(row.tool, row.argumentsJson) as PiEditArguments | null;

    return {
      ...row,
      status: normalizeRequiredItemLifecycleStatus(row.status, "tool call"),
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
              lineCount: piEdit.lineCount,
              firstChangedLine: piEdit.firstChangedLine,
              diffPreview: piEdit.diffPreview,
              diffOverflowId: piEdit.diffOverflowId,
              edits: parsedPiEdit?.edits ?? []
            },
      piWrite:
        piWrite === undefined
          ? undefined
          : {
              path: piWrite.path,
              lineCount: piWrite.lineCount,
              contentBytes: piWrite.contentBytes,
              bytesWritten: piWrite.bytesWritten,
              diffPreview: piWrite.diffPreview,
              diffOverflowId: piWrite.diffOverflowId
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
  turns: SymphonyAgentTurnRecord[];
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

  return [...input.turns]
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
  runtimeTurnMap: Map<string, typeof symphonyTurnsTable.$inferSelect>,
  runThreadId: string | null
): SymphonyAgentEventRecord[] {
  return eventRows.flatMap((row) => {
    const payload = resolveEventPayload(row, overflowMap);

    if (!payload) {
      return [];
    }

    let inferredThreadId: string | null = row.threadId;

    if (inferredThreadId === null && row.turnId) {
      inferredThreadId = runtimeTurnMap.get(row.turnId)?.threadId ?? null;
    }

    if (inferredThreadId === null) {
      inferredThreadId = runThreadId;
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

function buildForensicsTurns(
  input: RunData,
  runtimeContext: SymphonyRuntimeRunContext
): ForensicsTurn[] {
  const turns = input.symphonyTurns.map((turn) =>
    mapForensicsTurnRecord(turn, runtimeContext.threadId)
  );

  return turns.map((turn) => ({
    ...turn,
    eventCount: input.events.filter((event) => event.turnId === turn.turnId).length,
    events: input.events.filter((event) => event.turnId === turn.turnId)
  }));
}

function mapForensicsTurnRecord(
  turn: typeof symphonyTurnsTable.$inferSelect,
  runThreadId: string | null
): Omit<ForensicsTurn, "eventCount" | "events"> {
  const threadId = requireForensicsThreadId(
    turn.threadId ?? runThreadId,
    `turn ${turn.turnId}`
  );

  return {
    ...turn,
    status: normalizeRuntimeTurnStatus(turn.status),
    threadId,
    usage: buildUsage(turn.usage),
    metadata: castJsonObject(turn.metadata)
  };
}

function parseLegacyUsage(
  legacyUsage: unknown
): SymphonyAgentTurnRecord["usage"] {
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

function buildForensicsEvents(input: {
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>;
  runtimeTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  runThreadId: string | null;
}): ForensicsEvent[] {
  const runtimeTurnMap = buildRuntimeTurnMap(input.runtimeTurns);

  return input.eventRows.flatMap((row) => {
    const payload = resolveEventPayload(row, input.overflowMap);

    if (!row.turnId || !payload) {
      return [];
    }

    const threadId = requireForensicsThreadId(
      row.threadId ??
        runtimeTurnMap.get(row.turnId)?.threadId ??
        input.runThreadId ??
        null,
      `event ${row.id}`
    );

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
      threadId,
      agentTurnId: row.turnId,
      insertedAt: row.insertedAt
    }];
  });
}

function requireForensicsThreadId(
  value: string | null | undefined,
  subject: string
): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  throw new TypeError(`Forensics ${subject} is missing a thread id.`);
}

type RunData = {
  run: typeof symphonyRunsTable.$inferSelect;
  issue: typeof symphonyIssuesTable.$inferSelect;
  issueRuns: Array<typeof symphonyRunsTable.$inferSelect>;
  issueDeliveryRows: Array<typeof symphonyIssueDeliveryReportsTable.$inferSelect>;
  latestRunDelivery: typeof symphonyIssueDeliveryReportsTable.$inferSelect | null;
  symphonyTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  eventRows: Array<typeof symphonyAgentEventLogTable.$inferSelect>;
  overflowMap: Map<string, typeof symphonyAgentPayloadOverflowTable.$inferSelect>;
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
  runtimeContextRow: typeof symphonyRunRuntimeContextTable.$inferSelect | null;
  runtimeContext: {
    harness: "pi" | null;
    threadId: string;
    processId: string | null;
    model: string | null;
    reasoningEffort: string | null;
    profile: string | null;
    providerId: string | null;
    providerName: string | null;
    authMode: string | null;
    providerEnvKey: string | null;
    launchTarget: SymphonyRuntimeLaunchTarget | null;
  } | null;
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

  const [issue, issueRuns, issueDeliveryRows, symphonyTurns, eventRows, itemRows, commandRows, toolRows, piReadRows, piEditRows, piWriteRows, piGrepRows, piFindRows, piMessageEndRows, agentMessageRows, reasoningRows, fileChangeRows, taskSnapshotRows, runtimeContextRow] =
    await Promise.all([
      db.select().from(symphonyIssuesTable).where(eq(symphonyIssuesTable.issueIdentifier, run.issueIdentifier)).get(),
      db.select().from(symphonyRunsTable).where(eq(symphonyRunsTable.issueIdentifier, run.issueIdentifier)).all(),
      db.select().from(symphonyIssueDeliveryReportsTable).where(eq(symphonyIssueDeliveryReportsTable.issueIdentifier, run.issueIdentifier)).orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt)).all(),
      db.select().from(symphonyTurnsTable).where(eq(symphonyTurnsTable.runId, runId)).orderBy(asc(symphonyTurnsTable.turnSequence)).all(),
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
      db.select().from(symphonyRunRuntimeContextTable).where(eq(symphonyRunRuntimeContextTable.runId, runId)).get()
    ]);

  const resolvedIssue = requireIssueRecord(issue, runId, run.issueIdentifier);

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
  const runtimeContext: RunData["runtimeContext"] = runtimeContextRow
    ? mapRuntimeRunContextRow(runtimeContextRow)
    : null;
  const events = buildForensicsEvents({
    eventRows,
    overflowMap,
    runtimeTurns: symphonyTurns,
    runThreadId:
      runtimeContext?.threadId ??
      symphonyTurns.find((turn) => typeof turn.threadId === "string" && turn.threadId.trim() !== "")?.threadId ??
      null
  });
  const latestRunDelivery = issueDeliveryRows.find((row) => row.runId === runId) ?? null;

  return {
    run,
    issue: resolvedIssue,
    issueRuns,
    issueDeliveryRows,
    latestRunDelivery,
    symphonyTurns,
    eventRows,
    overflowMap,
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
    runtimeContextRow: runtimeContextRow ?? null,
    runtimeContext,
    events
  };
}

function buildRuntimeTurnMap(
  turns: Array<typeof symphonyTurnsTable.$inferSelect>
): Map<string, typeof symphonyTurnsTable.$inferSelect> {
  return new Map(turns.map((turn) => [turn.turnId, turn] as const));
}

function latestTurnEventRow(
  rows: Array<{ turnId: string | null; recordedAt: string; eventType: string }>,
  turnId: string
): { recordedAt: string; eventType: string } | null {
  return rows.filter((row) => row.turnId === turnId).at(-1) ?? null;
}

function countRowsForTurn(
  rows: Array<{ turnId: string | null }>,
  turnId: string
): number {
  return rows.filter((row) => row.turnId === turnId).length;
}
