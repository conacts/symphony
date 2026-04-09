import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  SymphonyAgentAnalyticsEvent,
  SymphonyAgentThreadItemStatus,
  SymphonyAgentThreadItemType,
  SymphonyEventAttrs
} from "@symphony/runtime-run-ledger";
import { createSymphonyIssueTimelineStore, type SymphonyIssueTimelineStore } from "./issue-timeline.js";
import {
  symphonyEventsTable,
  symphonyIssuesTable,
  symphonyRunRuntimeContextTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";
import type {
  SymphonyRuntimeMachineLoadSummary,
  SymphonyRuntimeRunContextAttrs,
  SymphonyRuntimeRunMode,
  SymphonyRuntimeRunFinishAttrs,
  SymphonyRuntimeRunStartAttrs,
  SymphonyRuntimeRunUpdateAttrs,
  SymphonyRuntimeTurnFinishAttrs,
  SymphonyRuntimeTurnStartAttrs,
  SymphonyRuntimeTurnUpdateAttrs
} from "./runtime-run-types.js";

export interface SymphonyRuntimeRunStore {
  recordRunStarted(attrs: SymphonyRuntimeRunStartAttrs): Promise<string>;
  recordTurnStarted(runId: string, attrs: SymphonyRuntimeTurnStartAttrs): Promise<string>;
  recordEvent(runId: string, turnId: string, attrs: SymphonyEventAttrs): Promise<string>;
  upsertRunContext(runId: string, attrs: SymphonyRuntimeRunContextAttrs): Promise<void>;
  updateTurn(turnId: string, attrs: SymphonyRuntimeTurnUpdateAttrs): Promise<void>;
  finalizeTurn(turnId: string, attrs: SymphonyRuntimeTurnFinishAttrs): Promise<void>;
  updateRun(runId: string, attrs: SymphonyRuntimeRunUpdateAttrs): Promise<void>;
  finalizeRun(runId: string, attrs: SymphonyRuntimeRunFinishAttrs): Promise<void>;
}

export function createSqliteSymphonyRuntimeRunStore(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  timelineStore?: SymphonyIssueTimelineStore;
  payloadMaxBytes?: number;
}): SymphonyRuntimeRunStore {
  return new SqliteSymphonyRuntimeRunStore(input);
}

class SqliteSymphonyRuntimeRunStore implements SymphonyRuntimeRunStore {
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #timelineStore: SymphonyIssueTimelineStore | null;
  readonly #payloadMaxBytes: number;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    timelineStore?: SymphonyIssueTimelineStore;
    payloadMaxBytes?: number;
  }) {
    this.#db = input.db;
    this.#timelineStore = input.timelineStore ?? null;
    this.#payloadMaxBytes = normalizePositiveInteger(input.payloadMaxBytes, 64 * 1024);
  }

  async recordRunStarted(attrs: SymphonyRuntimeRunStartAttrs): Promise<string> {
    const runId = attrs.runId ?? randomUUID();
    const now = isoNow();
    const startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? now;
    const repositoryKey = sanitizeRequiredText(attrs.repositoryKey, "repositoryKey");
    const metadata = withRunModeMetadata(attrs.metadata, attrs.runMode);

    this.#db.transaction((tx) => {
      const existingIssue = tx
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueIdentifier, attrs.issueIdentifier))
        .get();

      if (existingIssue) {
        tx.update(symphonyIssuesTable)
          .set({
            repositoryKey,
            trackerIssueId: attrs.trackerIssueId,
            latestRunStartedAt:
              compareDescendingTimestamps(startedAt, existingIssue.latestRunStartedAt) < 0
                ? existingIssue.latestRunStartedAt
                : startedAt,
            updatedAt: now
          })
          .where(eq(symphonyIssuesTable.issueIdentifier, attrs.issueIdentifier))
          .run();
      } else {
        tx.insert(symphonyIssuesTable)
          .values({
            issueIdentifier: attrs.issueIdentifier,
            trackerIssueId: attrs.trackerIssueId,
            repositoryKey,
            latestRunStartedAt: startedAt,
            insertedAt: now,
            updatedAt: now
          })
          .run();
      }

      tx.insert(symphonyRunsTable)
        .values({
          runId,
          repositoryKey,
          issueIdentifier: attrs.issueIdentifier,
          attempt: attrs.attempt ?? null,
          status: attrs.status,
          outcome: null,
          workerHost: attrs.workerHost ?? null,
          workspacePath: attrs.workspacePath ?? null,
          startedAt,
          endedAt: null,
          commitHashStart: attrs.commitHashStart ?? null,
          commitHashEnd: null,
          repoStart: sanitizeJsonObject(attrs.repoStart),
          repoEnd: null,
          metadata,
          errorClass: null,
          errorMessage: null,
          machineLoadSampleCount: null,
          machineLoadMaxCpuPercent: null,
          machineLoadAvgCpuPercent: null,
          machineLoadMaxMemoryPercent: null,
          machineLoadAvgMemoryPercent: null,
          machineLoadMaxDiskPercent: null,
          machineLoadAvgDiskPercent: null,
          machineLoadHadHighCpu: null,
          machineLoadHadHighMemory: null,
          machineLoadHadHighDisk: null,
          insertedAt: now,
          updatedAt: now
        })
        .run();
    });

    await this.#timelineStoreFor(repositoryKey).record({
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

  async recordTurnStarted(runId: string, attrs: SymphonyRuntimeTurnStartAttrs): Promise<string> {
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
    const startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? now;
    const promptText = sanitizeText(attrs.promptText);
    const threadId = sanitizeText(attrs.threadId);

    if (!promptText) {
      throw new TypeError(`Turn prompt text is required for run ${runId}`);
    }
    if (!threadId) {
      throw new TypeError(`Turn thread id is required for run ${runId}`);
    }

    this.#db.insert(symphonyTurnsTable)
      .values({
        turnId,
        runId,
        turnSequence,
        threadId,
        agentTurnId: attrs.agentTurnId ?? null,
        promptText,
        status: attrs.status,
        startedAt,
        endedAt: null,
        usage: null,
        metadata: sanitizeJsonObject(attrs.metadata),
        insertedAt: now,
        updatedAt: now
      })
      .run();

    await this.#timelineStoreFor(run.repositoryKey).record({
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId,
      source: "agent",
      eventType: "turn_started",
      message: `Turn ${turnSequence} started.`,
      payload: {
        turnSequence,
        threadId
      },
      recordedAt: startedAt
    });

    return turnId;
  }

  async updateTurn(turnId: string, attrs: SymphonyRuntimeTurnUpdateAttrs): Promise<void> {
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
        threadId: sanitizeText(attrs.threadId) ?? existing.threadId,
        agentTurnId: attrs.agentTurnId ?? existing.agentTurnId,
        usage: sanitizeUsage(attrs.usage) ?? existing.usage,
        metadata: mergeSanitizedJsonObjects(existing.metadata, attrs.metadata),
        updatedAt: isoNow()
      })
      .where(eq(symphonyTurnsTable.turnId, turnId))
      .run();
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
    const truncatedPayload = truncatePayload(attrs.payload, this.#payloadMaxBytes);
    const recordedAt = normalizeIsoTimestamp(attrs.recordedAt) ?? isoNow();
    const threadId = sanitizeText(attrs.threadId) ?? turn.threadId;

    this.#db.insert(symphonyEventsTable)
      .values({
        eventId,
        turnId,
        runId,
        eventSequence,
        eventType: attrs.eventType,
        itemType: deriveItemType(truncatedPayload.payload),
        itemStatus: deriveItemStatus(truncatedPayload.payload),
        recordedAt,
        payload: truncatedPayload.payload,
        payloadTruncated: truncatedPayload.payloadTruncated,
        payloadBytes: truncatedPayload.payloadBytes,
        summary: attrs.summary ? sanitizeRuntimeEventSummary(attrs.summary) : null,
        threadId,
        agentTurnId: attrs.agentTurnId ?? null,
        insertedAt: isoNow()
      })
      .run();

    return eventId;
  }

  async upsertRunContext(runId: string, attrs: SymphonyRuntimeRunContextAttrs): Promise<void> {
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      throw new TypeError(`Run not found for runtime context: ${runId}`);
    }

    const existing = this.#db
      .select()
      .from(symphonyRunRuntimeContextTable)
      .where(eq(symphonyRunRuntimeContextTable.runId, runId))
      .get();
    const now = isoNow();
    const threadId = sanitizeText(attrs.threadId) ?? existing?.threadId ?? null;

    if (!threadId) {
      throw new TypeError(`Runtime context thread id is required for run ${runId}`);
    }

    const nextValues = {
      harnessKind: sanitizeHarnessKind(attrs.harnessKind) ?? existing?.harnessKind ?? null,
      threadId,
      processId: sanitizeText(attrs.processId) ?? existing?.processId ?? null,
      model: sanitizeText(attrs.model) ?? existing?.model ?? null,
      reasoningEffort:
        sanitizeText(attrs.reasoningEffort) ?? existing?.reasoningEffort ?? null,
      profile: sanitizeText(attrs.profile) ?? existing?.profile ?? null,
      providerId: sanitizeText(attrs.providerId) ?? existing?.providerId ?? null,
      providerName: sanitizeText(attrs.providerName) ?? existing?.providerName ?? null,
      authMode: sanitizeText(attrs.authMode) ?? existing?.authMode ?? null,
      providerEnvKey:
        sanitizeText(attrs.providerEnvKey) ?? existing?.providerEnvKey ?? null,
      launchTarget:
        sanitizeJsonObject(attrs.launchTarget) ?? existing?.launchTarget ?? null,
      updatedAt: now
    };

    if (existing) {
      this.#db.update(symphonyRunRuntimeContextTable)
        .set(nextValues)
        .where(eq(symphonyRunRuntimeContextTable.runId, runId))
        .run();
      return;
    }

    this.#db.insert(symphonyRunRuntimeContextTable)
      .values({
        runId,
        ...nextValues,
        insertedAt: now
      })
      .run();
  }

  async finalizeTurn(turnId: string, attrs: SymphonyRuntimeTurnFinishAttrs): Promise<void> {
    await this.updateTurn(turnId, {
      status: attrs.status,
      endedAt: attrs.endedAt,
      threadId: attrs.threadId,
      agentTurnId: attrs.agentTurnId,
      usage: attrs.usage,
      metadata: attrs.metadata
    });
  }

  async updateRun(runId: string, attrs: SymphonyRuntimeRunUpdateAttrs): Promise<void> {
    const existing = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!existing) {
      throw new TypeError(`Run not found for update: ${runId}`);
    }

    const updatedAt = isoNow();
    const machineLoadSummary = sanitizeMachineLoadSummary(attrs.machineLoadSummary);

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
          metadata: mergeSanitizedJsonObjects(
            existing.metadata,
            withRunModeMetadata(attrs.metadata, attrs.runMode)
          ),
          errorClass: attrs.errorClass ? sanitizeText(attrs.errorClass) : existing.errorClass,
          errorMessage:
            attrs.errorMessage ? sanitizeText(attrs.errorMessage) : existing.errorMessage,
          machineLoadSampleCount:
            machineLoadSummary?.sampleCount ?? existing.machineLoadSampleCount,
          machineLoadMaxCpuPercent:
            machineLoadSummary?.maxCpuPercent ?? existing.machineLoadMaxCpuPercent,
          machineLoadAvgCpuPercent:
            machineLoadSummary?.avgCpuPercent ?? existing.machineLoadAvgCpuPercent,
          machineLoadMaxMemoryPercent:
            machineLoadSummary?.maxMemoryPercent ?? existing.machineLoadMaxMemoryPercent,
          machineLoadAvgMemoryPercent:
            machineLoadSummary?.avgMemoryPercent ?? existing.machineLoadAvgMemoryPercent,
          machineLoadMaxDiskPercent:
            machineLoadSummary?.maxDiskPercent ?? existing.machineLoadMaxDiskPercent,
          machineLoadAvgDiskPercent:
            machineLoadSummary?.avgDiskPercent ?? existing.machineLoadAvgDiskPercent,
          machineLoadHadHighCpu:
            machineLoadSummary?.hadHighCpu ?? existing.machineLoadHadHighCpu,
          machineLoadHadHighMemory:
            machineLoadSummary?.hadHighMemory ?? existing.machineLoadHadHighMemory,
          machineLoadHadHighDisk:
            machineLoadSummary?.hadHighDisk ?? existing.machineLoadHadHighDisk,
          updatedAt
        })
        .where(eq(symphonyRunsTable.runId, runId))
        .run();

      tx.update(symphonyIssuesTable)
        .set({
          updatedAt
        })
        .where(eq(symphonyIssuesTable.issueIdentifier, existing.issueIdentifier))
        .run();
    });
  }

  async finalizeRun(runId: string, attrs: SymphonyRuntimeRunFinishAttrs): Promise<void> {
    const existing = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!existing) {
      throw new TypeError(`Run not found for update: ${runId}`);
    }

    await this.updateRun(runId, {
      status: attrs.status,
      outcome: attrs.outcome ?? null,
      endedAt: attrs.endedAt,
      commitHashEnd: attrs.commitHashEnd,
      repoEnd: attrs.repoEnd,
      metadata: attrs.metadata,
      errorClass: attrs.errorClass,
      errorMessage: attrs.errorMessage,
      machineLoadSummary: attrs.machineLoadSummary
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
        status: attrs.status,
        errorClass: attrs.errorClass ?? null,
        errorMessage: attrs.errorMessage ?? null
      },
      recordedAt: normalizeIsoTimestamp(attrs.endedAt) ?? isoNow()
    });
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

function withRunModeMetadata(
  metadata: Record<string, unknown> | null | undefined,
  runMode: SymphonyRuntimeRunMode | null | undefined
): Record<string, unknown> | null {
  if (!runMode) {
    return sanitizeJsonObject(metadata);
  }

  return sanitizeJsonObject({
    ...(metadata ?? {}),
    runMode
  });
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

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  const normalized = sanitizeText(value);

  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function sanitizeHarnessKind(value: "pi" | null | undefined): "pi" | null {
  return value === "pi" ? value : null;
}

const secretKeyPattern = /(authorization|cookie|token|password|secret|api[_-]?key)/i;

function sanitizeRuntimeEventSummary(value: string): string | null {
  return sanitizeSecrets(value);
}

function sanitizeJsonObject(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const normalized = normalizeJsonValue(entry);
      return normalized === undefined ? [] : [[key, normalized] as const];
    })
  );
}

function sanitizeJsonValue(value: unknown, keyHint?: string): unknown {
  if (typeof value === "string") {
    if (keyHint && secretKeyPattern.test(keyHint)) {
      if (keyHint.toLowerCase() === "authorization" && value.startsWith("Bearer ")) {
        return "Bearer [REDACTED]";
      }

      return "[REDACTED]";
    }

    return sanitizeSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry));
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

function sanitizeSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/(OPENAI_API_KEY\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(password\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(token\s*=\s*)(\S+)/gi, "$1[REDACTED]")
    .replace(/(session\s*=\s*)(\S+)/gi, "$1[REDACTED]");
}

function truncatePayload(
  payload: SymphonyAgentAnalyticsEvent,
  payloadMaxBytes: number
): {
  payload: SymphonyAgentAnalyticsEvent;
  payloadBytes: number;
  payloadTruncated: boolean;
} {
  const sanitizedPayload = sanitizeJsonValue(payload) as SymphonyAgentAnalyticsEvent;
  const encoded = JSON.stringify(sanitizedPayload);
  const payloadBytes = Buffer.byteLength(encoded, "utf8");

  if (payloadBytes <= payloadMaxBytes) {
    return {
      payload: sanitizedPayload,
      payloadBytes,
      payloadTruncated: false
    };
  }

  for (const maxLength of [8192, 2048, 512, 128, 32, 0]) {
    const compactPayload = compactAnalyticsPayload(sanitizedPayload, maxLength);
    const compactEncoded = JSON.stringify(compactPayload);
    if (Buffer.byteLength(compactEncoded, "utf8") <= payloadMaxBytes) {
      return {
        payload: compactPayload,
        payloadBytes,
        payloadTruncated: true
      };
    }
  }

  return {
    payload: compactAnalyticsPayload(sanitizedPayload, 0),
    payloadBytes,
    payloadTruncated: true
  };
}

function compactAnalyticsPayload(
  payload: SymphonyAgentAnalyticsEvent,
  maxLength: number
): SymphonyAgentAnalyticsEvent {
  if (payload.type === "session.started") {
    return payload;
  }

  if (
    payload.type === "thread.started" ||
    payload.type === "turn.started" ||
    payload.type === "turn.completed" ||
    payload.type === "turn.failed" ||
    payload.type === "error"
  ) {
    return payload;
  }

  switch (payload.item.type) {
    case "command_execution":
      return {
        ...payload,
        item: {
          ...payload.item,
          aggregated_output: compactString(payload.item.aggregated_output, maxLength)
        }
      };
    case "agent_message":
      return {
        ...payload,
        item: {
          ...payload.item,
          text: compactString(payload.item.text, maxLength)
        }
      };
    case "reasoning":
      return {
        ...payload,
        item: {
          ...payload.item,
          text: compactString(payload.item.text, maxLength)
        }
      };
    case "error":
      return {
        ...payload,
        item: {
          ...payload.item,
          message: compactString(payload.item.message, maxLength)
        }
      };
    default:
      return payload;
  }
}

function compactString(value: string, maxLength = 8192): string {
  if (maxLength <= 0) {
    return `[TRUNCATED ${value.length} chars]`;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[TRUNCATED ${value.length - maxLength} chars]`;
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

function sanitizeMachineLoadSummary(
  value: SymphonyRuntimeMachineLoadSummary | null | undefined
): SymphonyRuntimeMachineLoadSummary | null {
  if (!value || value.sampleCount <= 0) {
    return null;
  }

  return {
    sampleCount: Math.max(1, Math.floor(value.sampleCount)),
    maxCpuPercent: normalizePercent(value.maxCpuPercent),
    avgCpuPercent: normalizePercent(value.avgCpuPercent),
    maxMemoryPercent: normalizeRequiredPercent(value.maxMemoryPercent),
    avgMemoryPercent: normalizeRequiredPercent(value.avgMemoryPercent),
    maxDiskPercent: normalizePercent(value.maxDiskPercent),
    avgDiskPercent: normalizePercent(value.avgDiskPercent),
    hadHighCpu: Boolean(value.hadHighCpu),
    hadHighMemory: Boolean(value.hadHighMemory),
    hadHighDisk: Boolean(value.hadHighDisk)
  };
}

function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeRequiredPercent(value: number): number {
  return normalizePercent(value) ?? 0;
}

function sanitizeUsage(
  value:
    | {
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      }
    | null
    | undefined
): {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
} | null {
  if (!value) {
    return null;
  }

  const inputTokens = normalizeTokenCount(value.input_tokens);
  const cachedInputTokens = normalizeTokenCount(value.cached_input_tokens);
  const outputTokens = normalizeTokenCount(value.output_tokens);

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens
  };
}

function normalizeTokenCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeJsonValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const normalized = normalizeJsonValue(entry);
        return normalized === undefined ? [] : [[key, normalized] as const];
      })
    );
  }

  return String(value);
}

function mergeSanitizedJsonObjects(
  base: Record<string, unknown> | null,
  patch: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const sanitizedPatch = sanitizeJsonObject(patch);
  if (!base && !sanitizedPatch) {
    return null;
  }

  return {
    ...(base ?? {}),
    ...(sanitizedPatch ?? {})
  };
}
