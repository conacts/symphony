import { asc, desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  JsonObject,
  SymphonyForensicsIssueQuery,
  SymphonyForensicsProblemRunsQuery,
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsRunSummary,
  SymphonyForensicsRunsQuery
} from "@symphony/contracts";
import {
  symphonyIssueDeliveryReportsTable,
  symphonyIssuesTable,
  symphonyRunRuntimeContextTable,
  symphonyRunsTable,
  symphonyTurnsTable,
  symphonyEventsTable
} from "./schema.js";
import {
  buildRuntimeRunContextMap,
  mapRuntimeRunContextRow,
  type SymphonyRuntimeRunContext
} from "./runtime-run-context.js";
import {
  buildRuntimeIssueSummary,
  buildRuntimeRunSummary,
  isProblemOutcome,
  normalizeRuntimeTurnStatus
} from "./runtime-run-summary.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;
type PersistedRunRecord = typeof symphonyRunsTable.$inferSelect & {
  repoStart: JsonObject | null;
  repoEnd: JsonObject | null;
  metadata: JsonObject | null;
};
type ForensicsTurn = SymphonyForensicsRunDetailResult["turns"][number];
type ForensicsEvent = ForensicsTurn["events"][number];

export interface SymphonyRuntimeForensicsReadStore {
  listRuns(opts?: SymphonyForensicsRunsQuery): Promise<SymphonyForensicsRunSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: Partial<SymphonyForensicsIssueQuery>
  ): Promise<SymphonyForensicsRunSummary[]>;
  listProblemRuns(
    opts?: Partial<SymphonyForensicsProblemRunsQuery>
  ): Promise<SymphonyForensicsRunSummary[]>;
  fetchRunDetail(runId: string): Promise<SymphonyForensicsRunDetailResult | null>;
}

export function createSqliteRuntimeForensicsReadStore(input: {
  db: BetterSQLite3Database<SymphonyDbShape>;
}): SymphonyRuntimeForensicsReadStore {
  return new SqliteRuntimeForensicsReadStore(input.db);
}

class SqliteRuntimeForensicsReadStore implements SymphonyRuntimeForensicsReadStore {
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
    const issueIdentifiers = [...new Set(runs.map((run) => run.issueIdentifier))];
    const [issues, runtimeTurns, runtimeEvents, runtimeContextRows, deliveryRows] = await Promise.all([
      this.#db
        .select()
        .from(symphonyIssuesTable)
        .where(inArray(symphonyIssuesTable.issueIdentifier, issueIdentifiers))
        .all(),
      this.#db
        .select()
        .from(symphonyTurnsTable)
        .where(inArray(symphonyTurnsTable.runId, runIds))
        .all(),
      this.#db
        .select()
        .from(symphonyEventsTable)
        .where(inArray(symphonyEventsTable.runId, runIds))
        .all(),
      this.#db
        .select()
        .from(symphonyRunRuntimeContextTable)
        .where(inArray(symphonyRunRuntimeContextTable.runId, runIds))
        .all(),
      this.#db
        .select()
        .from(symphonyIssueDeliveryReportsTable)
        .where(inArray(symphonyIssueDeliveryReportsTable.runId, runIds))
        .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
        .all()
    ]);

    const runtimeTurnsByRunId = groupRowsByRunId(runtimeTurns);
    const runtimeEventsByRunId = groupRowsByRunId(runtimeEvents);
    const runtimeContextByRunId = buildRuntimeRunContextMap(runtimeContextRows);
    const deliveryByRunId = buildLatestDeliveryReportByRunId(deliveryRows);
    const issueByIdentifier = new Map(
      issues.map((issue) => [issue.issueIdentifier, issue] as const)
    );

    return runs.map((run) => {
      const issue = requireIssueRecord(
        issueByIdentifier.get(run.issueIdentifier),
        run.runId,
        run.issueIdentifier
      );

      return buildForensicsRunSummary(
        issue,
        run,
        runtimeTurnsByRunId.get(run.runId) ?? [],
        runtimeEventsByRunId.get(run.runId) ?? [],
        deliveryByRunId.get(run.runId),
        runtimeContextByRunId.get(run.runId)
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

  async fetchRunDetail(runId: string): Promise<SymphonyForensicsRunDetailResult | null> {
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      return null;
    }

    const [issue, issueRuns, issueDeliveryRows, turns, events, runtimeContextRow] =
      await Promise.all([
        this.#db
          .select()
          .from(symphonyIssuesTable)
          .where(eq(symphonyIssuesTable.issueIdentifier, run.issueIdentifier))
          .get(),
        this.#db
          .select()
          .from(symphonyRunsTable)
          .where(eq(symphonyRunsTable.issueIdentifier, run.issueIdentifier))
          .all(),
        this.#db
          .select()
          .from(symphonyIssueDeliveryReportsTable)
          .where(eq(symphonyIssueDeliveryReportsTable.issueIdentifier, run.issueIdentifier))
          .orderBy(desc(symphonyIssueDeliveryReportsTable.reportedAt))
          .all(),
        this.#db
          .select()
          .from(symphonyTurnsTable)
          .where(eq(symphonyTurnsTable.runId, runId))
          .orderBy(asc(symphonyTurnsTable.turnSequence))
          .all(),
        this.#db
          .select()
          .from(symphonyEventsTable)
          .where(eq(symphonyEventsTable.runId, runId))
          .orderBy(asc(symphonyEventsTable.recordedAt), asc(symphonyEventsTable.eventSequence))
          .all(),
        this.#db
          .select()
          .from(symphonyRunRuntimeContextTable)
          .where(eq(symphonyRunRuntimeContextTable.runId, runId))
          .get()
      ]);

    const resolvedIssue = requireIssueRecord(issue, runId, run.issueIdentifier);

    const runtimeContext = mapRuntimeRunContextRow(runtimeContextRow);
    const latestRunDelivery = issueDeliveryRows.find((row) => row.runId === runId) ?? null;
    const turnEventsByTurnId = groupRowsByTurnId(events);
    const mappedTurns = turns.map((turn) =>
      mapForensicsTurn(
        turn,
        turnEventsByTurnId.get(turn.turnId) ?? []
      )
    );
    const runSummary = buildForensicsRunSummary(
      resolvedIssue,
      mapPersistedRunRecord(run),
      turns,
      events,
      latestRunDelivery ?? undefined,
      runtimeContext
    );

    return {
      issue: buildForensicsIssueExport(resolvedIssue, issueRuns, issueDeliveryRows),
      run: {
        ...runSummary,
        threadId: runtimeContext.threadId ?? deriveRunThreadId(turns, events),
        processId: runtimeContext.processId,
        providerId: runtimeContext.providerId,
        providerName: runtimeContext.providerName,
        reasoningEffort: runtimeContext.reasoningEffort,
        profile: runtimeContext.profile,
        authMode: normalizeForensicsAuthMode(runtimeContext.authMode),
        providerEnvKey: runtimeContext.providerEnvKey,
        launchTarget: runtimeContext.launchTarget,
        repoStart: castJsonObject(run.repoStart),
        repoEnd: castJsonObject(run.repoEnd),
        metadata: castJsonObject(run.metadata),
        insertedAt: run.insertedAt,
        updatedAt: run.updatedAt
      },
      deliveryReport: latestRunDelivery
        ? mapForensicsDeliveryReport(latestRunDelivery, resolvedIssue)
        : null,
      turns: mappedTurns
    };
  }
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
  runtimeEvents: Array<typeof symphonyEventsTable.$inferSelect>,
  deliveryReport: typeof symphonyIssueDeliveryReportsTable.$inferSelect | undefined,
  runtimeContext?: SymphonyRuntimeRunContext
): SymphonyForensicsRunSummary {
  const runtimeSummary = buildRuntimeRunSummary(issue, run, runtimeTurns, runtimeEvents);

  return {
    runId: run.runId,
    repositoryKey: run.repositoryKey,
    trackerIssueId: issue.trackerIssueId,
    issueIdentifier: run.issueIdentifier,
    attempt: run.attempt,
    runMode: run.runMode,
    status: runtimeSummary.status,
    outcome: run.outcome,
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
    inputTokens: runtimeSummary.inputTokens,
    cachedInputTokens: computeCachedInputTokens(runtimeTurns),
    outputTokens: runtimeSummary.outputTokens,
    totalTokens:
      runtimeSummary.inputTokens +
      computeCachedInputTokens(runtimeTurns) +
      runtimeSummary.outputTokens,
    deliveryStatus: normalizeOptionalDeliveryStatus(
      deliveryReport?.status,
      "delivery report"
    ),
    deliveryReportedAt: deliveryReport?.reportedAt ?? null,
    deliveryPrUrl: deliveryReport?.prUrl ?? null,
    machineLoad: buildRunMachineLoadSummary(run)
  };
}

function mapForensicsTurn(
  turn: typeof symphonyTurnsTable.$inferSelect,
  events: Array<typeof symphonyEventsTable.$inferSelect>
): ForensicsTurn {
  return {
    turnId: turn.turnId,
    runId: turn.runId,
    turnSequence: turn.turnSequence,
    threadId: turn.threadId,
    agentTurnId: turn.agentTurnId ?? null,
    promptText: turn.promptText,
    status: normalizeRuntimeTurnStatus(turn.status),
    startedAt: turn.startedAt,
    endedAt: turn.endedAt ?? null,
    usage: mapTurnUsage(turn.usage),
    metadata: castJsonObject(turn.metadata),
    insertedAt: turn.insertedAt,
    updatedAt: turn.updatedAt,
    eventCount: events.length,
    events: events
      .slice()
      .sort((left, right) => left.eventSequence - right.eventSequence)
      .map(mapForensicsEvent)
  };
}

function mapForensicsEvent(
  event: typeof symphonyEventsTable.$inferSelect
): ForensicsEvent {
  return {
    eventId: event.eventId,
    turnId: event.turnId,
    runId: event.runId,
    eventSequence: event.eventSequence,
    eventType: event.eventType,
    itemType: normalizeEventItemType(event.itemType),
    itemStatus: normalizeEventItemStatus(event.itemStatus),
    recordedAt: event.recordedAt,
    payload: event.payload as ForensicsEvent["payload"],
    payloadTruncated: event.payloadTruncated,
    payloadBytes: event.payloadBytes,
    summary: event.summary ?? null,
    threadId: event.threadId,
    agentTurnId: event.agentTurnId ?? null,
    insertedAt: event.insertedAt
  };
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

function castJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function mapTurnUsage(value: unknown): ForensicsTurn["usage"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const usage = value as Record<string, unknown>;
  return {
    input_tokens: parseTokenCount(usage.input_tokens),
    cached_input_tokens: parseTokenCount(usage.cached_input_tokens),
    output_tokens: parseTokenCount(usage.output_tokens)
  };
}

function deriveRunThreadId(
  turns: Array<typeof symphonyTurnsTable.$inferSelect>,
  events: Array<typeof symphonyEventsTable.$inferSelect>
): string | null {
  const turnThreadId = turns.find((turn) => turn.threadId)?.threadId ?? null;
  if (turnThreadId) {
    return turnThreadId;
  }

  const eventThreadId = events.find((event) => event.threadId)?.threadId ?? null;
  if (eventThreadId) {
    return eventThreadId;
  }

  const sessionEvent = events.find(
    (event) =>
      event.eventType === "session.started" &&
      event.payload &&
      typeof event.payload === "object" &&
      !Array.isArray(event.payload)
  );
  const payload =
    sessionEvent?.payload && typeof sessionEvent.payload === "object" && !Array.isArray(sessionEvent.payload)
      ? (sessionEvent.payload as Record<string, unknown>)
      : null;

  return getNonEmptyString(payload?.thread_id ?? null);
}

function deriveFailureKind(run: typeof symphonyRunsTable.$inferSelect): string | null {
  if (run.errorClass) {
    return run.errorClass;
  }

  return run.outcome && isProblemOutcome(run.outcome) ? run.outcome : null;
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

function groupRowsByRunId<T extends { runId: string }>(rows: T[]): Map<string, T[]> {
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

function groupRowsByTurnId<T extends { turnId: string }>(rows: T[]): Map<string, T[]> {
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

function normalizeAgentRunStatus(
  status: string
): SymphonyForensicsRunSummary["agentStatus"] {
  switch (status) {
    case "dispatching":
    case "running":
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

function normalizeEventItemType(
  value: string | null
): ForensicsEvent["itemType"] {
  if (value === null) {
    return null;
  }

  switch (value) {
    case "agent_message":
    case "reasoning":
    case "command_execution":
    case "file_change":
    case "mcp_tool_call":
    case "web_search":
    case "todo_list":
    case "error":
      return value;
    default:
      throw new TypeError(`Unknown event item type: ${value}`);
  }
}

function normalizeEventItemStatus(
  value: string | null
): ForensicsEvent["itemStatus"] {
  if (value === null) {
    return null;
  }

  switch (value) {
    case "in_progress":
    case "completed":
    case "failed":
      return value;
    default:
      throw new TypeError(`Unknown event item status: ${value}`);
  }
}

function computeCachedInputTokens(
  turns: Array<typeof symphonyTurnsTable.$inferSelect>
): number {
  return turns.reduce((total, turn) => total + parseTokenCount(asUsageRecord(turn.usage)?.cached_input_tokens), 0);
}

function asUsageRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
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

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
