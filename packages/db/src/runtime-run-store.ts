import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createSymphonyIssueTimelineStore, type SymphonyIssueTimelineStore } from "./issue-timeline.js";
import {
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";
import type {
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
  updateTurn(turnId: string, attrs: SymphonyRuntimeTurnUpdateAttrs): Promise<void>;
  finalizeTurn(turnId: string, attrs: SymphonyRuntimeTurnFinishAttrs): Promise<void>;
  updateRun(runId: string, attrs: SymphonyRuntimeRunUpdateAttrs): Promise<void>;
  finalizeRun(runId: string, attrs: SymphonyRuntimeRunFinishAttrs): Promise<void>;
}

export function createSqliteSymphonyRuntimeRunStore(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  timelineStore?: SymphonyIssueTimelineStore;
}): SymphonyRuntimeRunStore {
  return new SqliteSymphonyRuntimeRunStore(input);
}

class SqliteSymphonyRuntimeRunStore implements SymphonyRuntimeRunStore {
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #timelineStore: SymphonyIssueTimelineStore;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    timelineStore?: SymphonyIssueTimelineStore;
  }) {
    this.#db = input.db;
    this.#timelineStore =
      input.timelineStore ?? createSymphonyIssueTimelineStore(input.db);
  }

  async recordRunStarted(attrs: SymphonyRuntimeRunStartAttrs): Promise<string> {
    const runId = attrs.runId ?? randomUUID();
    const now = isoNow();
    const startedAt = normalizeIsoTimestamp(attrs.startedAt) ?? now;

    this.#db.transaction((tx) => {
      const existingIssue = tx
        .select()
        .from(symphonyIssuesTable)
        .where(eq(symphonyIssuesTable.issueId, attrs.issueId))
        .get();

      if (existingIssue) {
        tx.update(symphonyIssuesTable)
          .set({
            issueIdentifier: attrs.issueIdentifier,
            latestRunStartedAt:
              compareDescendingTimestamps(startedAt, existingIssue.latestRunStartedAt) < 0
                ? existingIssue.latestRunStartedAt
                : startedAt,
            updatedAt: now
          })
          .where(eq(symphonyIssuesTable.issueId, attrs.issueId))
          .run();
      } else {
        tx.insert(symphonyIssuesTable)
          .values({
            issueId: attrs.issueId,
            issueIdentifier: attrs.issueIdentifier,
            latestRunStartedAt: startedAt,
            insertedAt: now,
            updatedAt: now
          })
          .run();
      }

      tx.insert(symphonyRunsTable)
        .values({
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
        })
        .run();
    });

    await this.#timelineStore.record({
      issueId: attrs.issueId,
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

    if (!promptText) {
      throw new TypeError(`Turn prompt text is required for run ${runId}`);
    }

    this.#db.insert(symphonyTurnsTable)
      .values({
        turnId,
        runId,
        turnSequence,
        codexThreadId: attrs.codexThreadId ?? null,
        codexTurnId: attrs.codexTurnId ?? null,
        codexSessionId: attrs.codexSessionId ?? null,
        promptText,
        status: attrs.status ?? "running",
        startedAt,
        endedAt: null,
        usage: null,
        metadata: sanitizeJsonObject(attrs.metadata),
        insertedAt: now,
        updatedAt: now
      })
      .run();

    await this.#timelineStore.record({
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      runId,
      turnId,
      source: "codex",
      eventType: "turn_started",
      message: `Turn ${turnSequence} started.`,
      payload: {
        turnSequence,
        codexSessionId: attrs.codexSessionId ?? null
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
        codexThreadId: attrs.codexThreadId ?? existing.codexThreadId,
        codexTurnId: attrs.codexTurnId ?? existing.codexTurnId,
        codexSessionId: attrs.codexSessionId ?? existing.codexSessionId,
        usage: sanitizeUsage(attrs.usage) ?? existing.usage,
        metadata: mergeSanitizedJsonObjects(existing.metadata, attrs.metadata),
        updatedAt: isoNow()
      })
      .where(eq(symphonyTurnsTable.turnId, turnId))
      .run();
  }

  async finalizeTurn(turnId: string, attrs: SymphonyRuntimeTurnFinishAttrs): Promise<void> {
    await this.updateTurn(turnId, {
      status: attrs.status ?? "completed",
      endedAt: attrs.endedAt,
      codexThreadId: attrs.codexThreadId,
      codexTurnId: attrs.codexTurnId,
      codexSessionId: attrs.codexSessionId,
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
          metadata: mergeSanitizedJsonObjects(existing.metadata, attrs.metadata),
          errorClass: attrs.errorClass ? sanitizeText(attrs.errorClass) : existing.errorClass,
          errorMessage:
            attrs.errorMessage ? sanitizeText(attrs.errorMessage) : existing.errorMessage,
          updatedAt
        })
        .where(eq(symphonyRunsTable.runId, runId))
        .run();

      tx.update(symphonyIssuesTable)
        .set({
          updatedAt
        })
        .where(eq(symphonyIssuesTable.issueId, existing.issueId))
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
      status: attrs.status ?? "finished",
      outcome: attrs.outcome ?? null,
      endedAt: attrs.endedAt,
      commitHashEnd: attrs.commitHashEnd,
      repoEnd: attrs.repoEnd,
      metadata: attrs.metadata,
      errorClass: attrs.errorClass,
      errorMessage: attrs.errorMessage
    });

    await this.#timelineStore.record({
      issueId: existing.issueId,
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
