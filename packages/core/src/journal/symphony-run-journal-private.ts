import type {
  SymphonyEventRecord,
  SymphonyIssueRecord,
  SymphonyIssueSummary,
  SymphonyJsonObject,
  SymphonyJsonValue,
  SymphonyRunExport,
  SymphonyRunJournalRunsOptions,
  SymphonyRunJournalDocument,
  SymphonyRunSummary,
  SymphonyRunRecord,
  SymphonyTurnExport,
  SymphonyTurnRecord
} from "./symphony-run-journal-types.js";

export const symphonyCompletedRunOutcomes = new Set([
  "completed",
  "completed_turn_batch",
  "merged",
  "done"
]);

export function createEmptyRunJournalDocument(): SymphonyRunJournalDocument {
  return {
    schemaVersion: "1",
    issues: [],
    runs: [],
    turns: [],
    events: []
  };
}

export function normalizeIsoTimestamp(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return null;
}

export function isoNow(now = new Date()): string {
  return now.toISOString();
}

export function clampPositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

export function normalizeLimit(limit: number | undefined, fallback = 50): number {
  return clampPositiveInteger(limit, fallback);
}

export function normalizeOptionalFilter(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function compareDescendingTimestamps(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

export function durationSeconds(
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

  return Math.max(0, Math.floor((endedMs - startedMs) / 1000));
}

export function buildRunSummary(
  run: SymphonyRunRecord,
  turns: SymphonyTurnRecord[],
  events: SymphonyEventRecord[]
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

export function buildIssueSummary(
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

export function buildRunExport(
  issue: SymphonyIssueSummary,
  run: SymphonyRunRecord,
  turns: SymphonyTurnRecord[],
  events: SymphonyEventRecord[]
): SymphonyRunExport {
  const runTurns = turns
    .filter((turn) => turn.runId === run.runId)
    .sort((left, right) => left.turnSequence - right.turnSequence);

  const exportedTurns: SymphonyTurnExport[] = runTurns.map((turn) => {
    const turnEvents = events
      .filter((event) => event.turnId === turn.turnId)
      .sort((left, right) => left.eventSequence - right.eventSequence);

    return {
      ...turn,
      eventCount: turnEvents.length,
      events: turnEvents
    };
  });

  return {
    issue,
    run,
    turns: exportedTurns
  };
}

export function problemSummary(runs: SymphonyRunSummary[]): Record<string, number> {
  return runs.reduce<Record<string, number>>((summary, run) => {
    if (!run.outcome) {
      return summary;
    }

    summary[run.outcome] = (summary[run.outcome] ?? 0) + 1;
    return summary;
  }, {});
}

export function isProblemOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && !symphonyCompletedRunOutcomes.has(outcome);
}

export function isCompletedOutcome(outcome: string | null): boolean {
  return typeof outcome === "string" && symphonyCompletedRunOutcomes.has(outcome);
}

export function matchesRunFilters(
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

const secretKeyPattern = /(authorization|cookie|token|password|secret|api[_-]?key)/i;

export function sanitizeText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/(OPENAI_API_KEY\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(password\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(token\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(session\s*=\s*)(\S+)/gi, "$1[REDACTED]");
}

export function sanitizeJsonValue(
  value: SymphonyJsonValue,
  keyHint?: string
): SymphonyJsonValue {
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
    const sanitizedEntries = Object.entries(value).map(([key, nestedValue]) => [
      key,
      sanitizeJsonValue(nestedValue, key)
    ]);

    return Object.fromEntries(sanitizedEntries) as SymphonyJsonObject;
  }

  return value;
}

export function sanitizeJsonObject(
  value: SymphonyJsonObject | null | undefined
): SymphonyJsonObject | null {
  if (!value) {
    return null;
  }

  return sanitizeJsonValue(value) as SymphonyJsonObject;
}

function parseTokenTotals(tokens: SymphonyJsonObject | null): {
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

function parseTokenCount(value: SymphonyJsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function truncatePayload(
  payload: SymphonyJsonValue,
  payloadMaxBytes: number
): {
  payload: SymphonyJsonValue;
  payloadBytes: number;
  payloadTruncated: boolean;
} {
  const sanitizedPayload = sanitizeJsonValue(payload);
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
    },
    payloadBytes,
    payloadTruncated: true
  };
}
