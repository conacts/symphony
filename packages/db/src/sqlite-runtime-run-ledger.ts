import { desc, eq, sql } from "drizzle-orm";
import type {
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
import type { JsonValue } from "@symphony/contracts";
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
  readonly #timelineStore: SymphonyIssueTimelineStore | null;
  readonly #runtimeRunStore: SymphonyRuntimeRunStore;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    timelineStore?: SymphonyIssueTimelineStore;
    retentionDays?: number;
    payloadMaxBytes?: number;
    dbFile: string;
  }) {
    this.#db = input.db;
    this.#timelineStore = input.timelineStore ?? null;
    this.#runtimeRunStore = createSqliteSymphonyRuntimeRunStore({
      db: input.db,
      timelineStore: this.#timelineStore ?? undefined,
      payloadMaxBytes: input.payloadMaxBytes
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
      repositoryKey: requireRepositoryKey(attrs.repositoryKey),
      trackerIssueId: attrs.trackerIssueId,
      issueIdentifier: attrs.issueIdentifier,
      runId: attrs.runId,
      attempt: attrs.attempt,
      runMode: attrs.runMode,
      workerHost: attrs.workerHost,
      workspacePath: attrs.workspacePath,
      startedAt: attrs.startedAt,
      commitHashStart: attrs.commitHashStart,
      repoStart: attrs.repoStart,
      metadata: attrs.metadata,
      status: normalizeRuntimeRunStatus(attrs.status, "running")
    });
  }

  async recordTurnStarted(runId: string, attrs: SymphonyTurnStartAttrs): Promise<string> {
    return this.#runtimeRunStore.recordTurnStarted(runId, {
      turnId: attrs.turnId,
      turnSequence: attrs.turnSequence,
      threadId: attrs.threadId,
      agentTurnId: attrs.agentTurnId,
      promptText: attrs.promptText,
      startedAt: attrs.startedAt,
      metadata: attrs.metadata,
      status: normalizeRuntimeTurnStatus(attrs.status, "running")
    });
  }

  async recordEvent(runId: string, turnId: string, attrs: SymphonyEventAttrs): Promise<string> {
    const eventId = await this.#runtimeRunStore.recordEvent(runId, turnId, attrs);
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      throw new TypeError(`Run not found for event: ${runId}`);
    }

    const recordedAt = normalizeIsoTimestamp(attrs.recordedAt) ?? isoNow();
    const payload = (this.#db
      .select({
        payload: symphonyEventsTable.payload
      })
      .from(symphonyEventsTable)
      .where(eq(symphonyEventsTable.eventId, eventId))
      .get()?.payload ?? attrs.payload) as JsonValue;

    await this.#timelineStoreFor(run.repositoryKey).record({
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId,
      source: "agent",
      eventType: attrs.eventType,
      message: attrs.summary ? sanitizeText(attrs.summary) : null,
      payload,
      recordedAt
    });

    return eventId;
  }

  async updateTurn(turnId: string, attrs: SymphonyTurnUpdateAttrs): Promise<void> {
    await this.#runtimeRunStore.updateTurn(turnId, {
      startedAt: attrs.startedAt,
      endedAt: attrs.endedAt,
      threadId: attrs.threadId ?? undefined,
      agentTurnId: attrs.agentTurnId,
      usage: attrs.usage,
      metadata: attrs.metadata,
      status: attrs.status ? normalizeRuntimeTurnStatus(attrs.status, "running") : undefined
    });
  }

  async finalizeTurn(turnId: string, attrs: SymphonyTurnFinishAttrs): Promise<void> {
    await this.#runtimeRunStore.finalizeTurn(turnId, {
      threadId: attrs.threadId ?? undefined,
      agentTurnId: attrs.agentTurnId,
      usage: attrs.usage,
      metadata: attrs.metadata,
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

    await this.#timelineStoreFor(existing.repositoryKey).record({
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
    const issues = this.#db.select().from(symphonyIssuesTable).all();
    const turns = this.#db.select().from(symphonyTurnsTable).all();
    const events = this.#db.select().from(symphonyEventsTable).all();
    const issueByIdentifier = new Map(
      issues.map((issue) => [issue.issueIdentifier, issue] as const)
    );

    return runs
      .filter((run) => matchesRunFilters(run, opts))
      .slice(0, limit)
      .flatMap((run) => {
        const issue = issueByIdentifier.get(run.issueIdentifier);
        return issue ? [buildRuntimeRunSummary(issue, run, turns, events)] : [];
      });
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
      .where(eq(symphonyIssuesTable.issueIdentifier, run.issueIdentifier))
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
      .select({ runId: symphonyRunsTable.runId, issueIdentifier: symphonyRunsTable.issueIdentifier })
      .from(symphonyRunsTable)
      .where(sql`${symphonyRunsTable.startedAt} >= ${cutoffIso}`)
      .all();
    const retainedRunIds = new Set(retainedRuns.map((row) => row.runId));
    const retainedIssueIdentifiers = new Set(retainedRuns.map((row) => row.issueIdentifier));

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
      if (!retainedIssueIdentifiers.has(issue.issueIdentifier)) {
        this.#db.delete(symphonyIssuesTable)
          .where(eq(symphonyIssuesTable.issueIdentifier, issue.issueIdentifier))
          .run();
      }
    }
  }

  #timelineStoreFor(repositoryKey: string): SymphonyIssueTimelineStore {
    return (
      this.#timelineStore ??
      createSymphonyIssueTimelineStore(this.#db, {
        repositoryKey
      })
    );
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

function sanitizeText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/(OPENAI_API_KEY\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(password\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(token\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(session\s*=\s*)(\S+)/gi, "$1[REDACTED]");
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
    threadId: turn.threadId,
    agentTurnId: turn.agentTurnId ?? null,
    usage: (turn.usage ?? null) as {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
    } | null,
    metadata: (turn.metadata ?? null) as SymphonyJsonObject | null,
    events: turn.events.map((event) => ({
      ...event,
      threadId: event.threadId,
      agentTurnId: event.agentTurnId ?? null,
      eventType: event.eventType as SymphonyRunExport["turns"][number]["events"][number]["eventType"],
      itemType: (event.itemType ?? null) as SymphonyRunExport["turns"][number]["events"][number]["itemType"],
      itemStatus: (event.itemStatus ?? null) as SymphonyRunExport["turns"][number]["events"][number]["itemStatus"],
      payload: event.payload as SymphonyRunExport["turns"][number]["events"][number]["payload"]
    }))
  };
}

function requireRepositoryKey(value: string | null | undefined): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  throw new TypeError("repositoryKey is required.");
}
