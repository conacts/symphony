import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildIssueSummary,
  buildRunExport,
  buildRunSummary,
  clampPositiveInteger,
  compareDescendingTimestamps,
  createEmptyRuntimeRunLedgerDocument,
  isoNow,
  matchesRunFilters,
  normalizeIsoTimestamp,
  normalizeLimit,
  normalizeOptionalFilter,
  sanitizeJsonObject,
  sanitizeText,
  truncatePayload
} from "./runtime-run-ledger-private.js";
import type {
  SymphonyAgentAnalyticsEvent,
  SymphonyAgentThreadItemStatus,
  SymphonyAgentThreadItemType
} from "./agent-analytics-types.js";
import type {
  SymphonyEventAttrs,
  SymphonyFileBackedRuntimeRunLedgerOptions,
  SymphonyIssueRecord,
  SymphonyIssueSummary,
  SymphonyRunExport,
  SymphonyRunFinishAttrs,
  SymphonyRuntimeRunLedger,
  SymphonyRuntimeRunLedgerDocument,
  SymphonyRuntimeRunLedgerListOptions,
  SymphonyRuntimeRunLedgerRunsOptions,
  SymphonyRuntimeRunLedgerProblemRunsOptions,
  SymphonyRunRecord,
  SymphonyRunStartAttrs,
  SymphonyRunSummary,
  SymphonyRunUpdateAttrs,
  SymphonyTurnFinishAttrs,
  SymphonyTurnRecord,
  SymphonyTurnStartAttrs,
  SymphonyTurnUpdateAttrs
} from "./runtime-run-ledger-types.js";

const defaultRetentionDays = 90;
const defaultPayloadMaxBytes = 64 * 1024;
const defaultLedgerRelativePath = path.join("log", "runtime-run-ledger.json");

export function defaultSymphonyRuntimeRunLedgerFile(logsRoot = process.cwd()): string {
  return path.join(logsRoot, defaultLedgerRelativePath);
}

export function createFileBackedSymphonyRuntimeRunLedger(
  options: SymphonyFileBackedRuntimeRunLedgerOptions
): SymphonyRuntimeRunLedger {
  return new FileBackedSymphonyRuntimeRunLedger(options);
}

class FileBackedSymphonyRuntimeRunLedger implements SymphonyRuntimeRunLedger {
  readonly dbFile: string;
  readonly retentionDays: number;
  readonly payloadMaxBytes: number;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(options: SymphonyFileBackedRuntimeRunLedgerOptions) {
    this.dbFile = path.resolve(options.dbFile);
    this.retentionDays = clampPositiveInteger(options.retentionDays, defaultRetentionDays);
    this.payloadMaxBytes = clampPositiveInteger(options.payloadMaxBytes, defaultPayloadMaxBytes);
  }

  async recordRunStarted(attrs: SymphonyRunStartAttrs): Promise<string> {
    const runId = attrs.runId ?? randomUUID();

    await this.#mutate(async (document) => {
      const now = isoNow();
      const startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? now;

      const nextIssue = upsertIssueRecord(document.issues, {
        issueId: attrs.issueId,
        issueIdentifier: attrs.issueIdentifier,
        latestRunStartedAt: startedAt,
        insertedAt: now,
        updatedAt: now
      });

      document.issues = nextIssue;
      document.runs.push({
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
      });
    });

    return runId;
  }

  async recordTurnStarted(runId: string, attrs: SymphonyTurnStartAttrs): Promise<string> {
    const turnId = attrs.turnId ?? randomUUID();

    await this.#mutate(async (document) => {
      const run = findRunRecord(document.runs, runId);
      if (!run) {
        throw new TypeError(`Run not found for turn start: ${runId}`);
      }

      const now = isoNow();
      const nextSequence =
        attrs.turnSequence ??
        document.turns
          .filter((turn) => turn.runId === runId)
          .reduce((max, turn) => Math.max(max, turn.turnSequence), 0) +
          1;

      document.turns.push({
        turnId,
        runId,
        turnSequence: nextSequence,
        threadId: attrs.threadId ?? null,
        agentTurnId: attrs.agentTurnId ?? null,
        sessionId: attrs.sessionId ?? null,
        promptText: sanitizeText(attrs.promptText),
        status: attrs.status ?? "running",
        startedAt: normalizeIsoTimestamp(attrs.startedAt) ?? now,
        endedAt: null,
        usage: null,
        metadata: sanitizeJsonObject(attrs.metadata),
        insertedAt: now,
        updatedAt: now
      });
    });

    return turnId;
  }

  async recordEvent(runId: string, turnId: string, attrs: SymphonyEventAttrs): Promise<string> {
    const eventId = attrs.eventId ?? randomUUID();

    await this.#mutate(async (document) => {
      const run = findRunRecord(document.runs, runId);
      if (!run) {
        throw new TypeError(`Run not found for event: ${runId}`);
      }

      const turn = findTurnRecord(document.turns, turnId);
      if (!turn || turn.runId !== runId) {
        throw new TypeError(`Turn not found for event: ${turnId}`);
      }

      const now = isoNow();
      const nextSequence =
        attrs.eventSequence ??
        document.events
          .filter((event) => event.turnId === turnId)
          .reduce((max, event) => Math.max(max, event.eventSequence), 0) +
          1;

      const truncatedPayload = truncatePayload(attrs.payload, this.payloadMaxBytes);

      document.events.push({
        eventId,
        turnId,
        runId,
        eventSequence: nextSequence,
        eventType: attrs.eventType,
        itemType: deriveItemType(truncatedPayload.payload),
        itemStatus: deriveItemStatus(truncatedPayload.payload),
        recordedAt: normalizeIsoTimestamp(attrs.recordedAt) ?? now,
        payload: truncatedPayload.payload,
        payloadTruncated: truncatedPayload.payloadTruncated,
        payloadBytes: truncatedPayload.payloadBytes,
        summary: attrs.summary ? sanitizeText(attrs.summary) : null,
        threadId: attrs.threadId ?? null,
        agentTurnId: attrs.agentTurnId ?? null,
        sessionId: attrs.sessionId ?? null,
        insertedAt: now
      });
    });

    return eventId;
  }

  async updateTurn(turnId: string, attrs: SymphonyTurnUpdateAttrs): Promise<void> {
    await this.#mutate(async (document) => {
      const turn = findTurnRecord(document.turns, turnId);
      if (!turn) {
        throw new TypeError(`Turn not found for update: ${turnId}`);
      }

      turn.status = attrs.status ?? turn.status;
      turn.startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? turn.startedAt;
      turn.endedAt = normalizeIsoTimestamp(attrs.endedAt) ?? turn.endedAt;
      turn.threadId = attrs.threadId ?? turn.threadId;
      turn.agentTurnId = attrs.agentTurnId ?? turn.agentTurnId;
      turn.sessionId = attrs.sessionId ?? turn.sessionId;
      turn.usage = sanitizeUsage(attrs.usage) ?? turn.usage;
      turn.metadata = mergeSanitizedJsonObjects(turn.metadata, attrs.metadata);
      turn.updatedAt = isoNow();
    });
  }

  async finalizeTurn(turnId: string, attrs: SymphonyTurnFinishAttrs): Promise<void> {
    await this.updateTurn(turnId, {
      status: attrs.status ?? "completed",
      endedAt: attrs.endedAt,
      threadId: attrs.threadId,
      agentTurnId: attrs.agentTurnId,
      sessionId: attrs.sessionId,
      usage: attrs.usage,
      metadata: attrs.metadata
    });
  }

  async updateRun(runId: string, attrs: SymphonyRunUpdateAttrs): Promise<void> {
    await this.#mutate(async (document) => {
      const run = findRunRecord(document.runs, runId);
      if (!run) {
        throw new TypeError(`Run not found for update: ${runId}`);
      }

      run.status = attrs.status ?? run.status;
      run.outcome = attrs.outcome ?? run.outcome;
      run.workerHost = attrs.workerHost ?? run.workerHost;
      run.workspacePath = attrs.workspacePath ?? run.workspacePath;
      run.startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? run.startedAt;
      run.endedAt = normalizeIsoTimestamp(attrs.endedAt) ?? run.endedAt;
      run.commitHashStart = attrs.commitHashStart ?? run.commitHashStart;
      run.commitHashEnd = attrs.commitHashEnd ?? run.commitHashEnd;
      run.repoStart = sanitizeJsonObject(attrs.repoStart) ?? run.repoStart;
      run.repoEnd = sanitizeJsonObject(attrs.repoEnd) ?? run.repoEnd;
      run.metadata = mergeSanitizedJsonObjects(run.metadata, attrs.metadata);
      run.errorClass = attrs.errorClass ? sanitizeText(attrs.errorClass) : run.errorClass;
      run.errorMessage = attrs.errorMessage
        ? sanitizeText(attrs.errorMessage)
        : run.errorMessage;
      run.updatedAt = isoNow();

      const issue = document.issues.find((entry) => entry.issueId === run.issueId);
      if (issue) {
        issue.updatedAt = isoNow();
      }
    });
  }

  async finalizeRun(runId: string, attrs: SymphonyRunFinishAttrs): Promise<void> {
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
  }

  async listIssues(
    opts: SymphonyRuntimeRunLedgerListOptions = {}
  ): Promise<SymphonyIssueSummary[]> {
    const document = await this.#read();
    const limit = normalizeLimit(opts.limit, 50);

    return [...document.issues]
      .sort((left, right) =>
        compareDescendingTimestamps(left.latestRunStartedAt, right.latestRunStartedAt)
      )
      .slice(0, limit)
      .map((issue) => buildIssueSummary(issue, document.runs));
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

  async listRuns(
    opts: SymphonyRuntimeRunLedgerRunsOptions = {}
  ): Promise<SymphonyRunSummary[]> {
    const document = await this.#read();
    const limit = normalizeLimit(opts.limit, 200);

    return document.runs
      .filter((run) => matchesRunFilters(run, opts))
      .sort((left, right) => compareDescendingTimestamps(left.startedAt, right.startedAt))
      .slice(0, limit)
      .map((run) => buildRunSummary(run, document.turns, document.events));
  }

  async listProblemRuns(
    opts: SymphonyRuntimeRunLedgerProblemRunsOptions = {}
  ): Promise<SymphonyRunSummary[]> {
    return this.listRuns({
      limit: opts.limit,
      outcome: normalizeOptionalFilter(opts.outcome),
      issueIdentifier: normalizeOptionalFilter(opts.issueIdentifier),
      problemOnly: true
    });
  }

  async fetchRunExport(runId: string): Promise<SymphonyRunExport | null> {
    const document = await this.#read();
    const run = document.runs.find((entry) => entry.runId === runId);
    if (!run) {
      return null;
    }

    const issueRecord = document.issues.find((entry) => entry.issueId === run.issueId);
    if (!issueRecord) {
      return null;
    }

    const issueSummary = buildIssueSummary(issueRecord, document.runs);

    return buildRunExport(issueSummary, run, document.turns, document.events);
  }

  async pruneRetention(now = new Date()): Promise<void> {
    await this.#mutate(async (document) => {
      const cutoffMs = now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000;
      const retainedRuns = document.runs.filter((run) => {
        const startedAtMs = Date.parse(run.startedAt);
        return Number.isNaN(startedAtMs) ? true : startedAtMs >= cutoffMs;
      });
      const retainedRunIds = new Set(retainedRuns.map((run) => run.runId));
      const retainedIssueIds = new Set(retainedRuns.map((run) => run.issueId));
      const retainedTurns = document.turns.filter((turn) => retainedRunIds.has(turn.runId));
      const retainedTurnIds = new Set(retainedTurns.map((turn) => turn.turnId));
      const retainedEvents = document.events.filter((event) => retainedTurnIds.has(event.turnId));
      const retainedIssues = document.issues.filter((issue) => retainedIssueIds.has(issue.issueId));

      document.runs = retainedRuns;
      document.turns = retainedTurns;
      document.events = retainedEvents;
      document.issues = retainedIssues;
    });
  }

  async #read(): Promise<SymphonyRuntimeRunLedgerDocument> {
    await this.#writeQueue;
    return readJournalDocument(this.dbFile);
  }

  async #mutate(
    mutator: (document: SymphonyRuntimeRunLedgerDocument) => Promise<void> | void
  ): Promise<void> {
    const run = this.#writeQueue.then(async () => {
      const document = await readJournalDocument(this.dbFile);
      await mutator(document);
      await writeJournalDocument(this.dbFile, document);
    });

    this.#writeQueue = run.then(() => undefined, () => undefined);
    await run;
  }
}

async function readJournalDocument(dbFile: string): Promise<SymphonyRuntimeRunLedgerDocument> {
  try {
    const raw = await readFile(dbFile, "utf8");
    const parsed = JSON.parse(raw) as SymphonyRuntimeRunLedgerDocument;
    return {
      schemaVersion: "1",
      issues: parsed.issues ?? [],
      runs: parsed.runs ?? [],
      turns: parsed.turns ?? [],
      events: parsed.events ?? []
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return createEmptyRuntimeRunLedgerDocument();
    }

    throw error;
  }
}

async function writeJournalDocument(
  dbFile: string,
  document: SymphonyRuntimeRunLedgerDocument
): Promise<void> {
  const directory = path.dirname(dbFile);
  await mkdir(directory, { recursive: true });

  const tempFile = `${dbFile}.${randomUUID()}.tmp`;
  await writeFile(tempFile, JSON.stringify(document, null, 2));
  await rename(tempFile, dbFile);
}

function upsertIssueRecord(
  issues: SymphonyIssueRecord[],
  issue: SymphonyIssueRecord
): SymphonyIssueRecord[] {
  const existing = issues.find((entry) => entry.issueId === issue.issueId);

  if (!existing) {
    return [...issues, issue];
  }

  existing.issueIdentifier = issue.issueIdentifier;
  existing.latestRunStartedAt =
    Date.parse(issue.latestRunStartedAt) > Date.parse(existing.latestRunStartedAt)
      ? issue.latestRunStartedAt
      : existing.latestRunStartedAt;
  existing.updatedAt = issue.updatedAt;
  return issues;
}

function mergeSanitizedJsonObjects(
  existing: SymphonyRunRecord["metadata"] | SymphonyTurnRecord["metadata"],
  next: unknown
): SymphonyRunRecord["metadata"] | SymphonyTurnRecord["metadata"] {
  const sanitizedNext = sanitizeJsonObject(
    next as SymphonyRunRecord["metadata"] | SymphonyTurnRecord["metadata"]
  );

  if (!sanitizedNext) {
    return existing;
  }

  if (!existing) {
    return sanitizedNext;
  }

  return {
    ...existing,
    ...sanitizedNext
  };
}

function sanitizeUsage(
  value:
    | {
        input_tokens?: number;
        cached_input_tokens?: number;
        output_tokens?: number;
      }
    | null
    | undefined
): SymphonyTurnRecord["usage"] {
  if (!value) {
    return null;
  }

  return {
    input_tokens: parseTokenCount(value.input_tokens),
    cached_input_tokens: parseTokenCount(value.cached_input_tokens),
    output_tokens: parseTokenCount(value.output_tokens)
  };
}

function parseTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
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

function findRunRecord(runs: SymphonyRunRecord[], runId: string): SymphonyRunRecord | undefined {
  return runs.find((entry) => entry.runId === runId);
}

function findTurnRecord(
  turns: SymphonyTurnRecord[],
  turnId: string
): SymphonyTurnRecord | undefined {
  return turns.find((entry) => entry.turnId === turnId);
}
