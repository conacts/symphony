import { asc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  isThreadEvent,
  previewItem,
  previewText,
  type ThreadEvent
} from "@symphony/codex-analytics";
import {
  buildIssueSummary,
  buildRunExport
} from "@symphony/run-journal/internal";
import type {
  SymphonyEventRecord,
  SymphonyIssueRecord,
  SymphonyJsonObject,
  SymphonyRunExport,
  SymphonyRunRecord,
  SymphonyTurnRecord
} from "@symphony/run-journal";
import {
  codexEventLogTable,
  codexPayloadOverflowTable,
  codexRunsTable,
  codexTurnsTable,
  symphonyIssuesTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";

type SymphonyDbShape = typeof import("./schema.js").symphonySchema;

export interface CodexAnalyticsReadStore {
  fetchRunExport(runId: string): Promise<SymphonyRunExport | null>;
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

  async fetchRunExport(runId: string): Promise<SymphonyRunExport | null> {
    const run = this.#db
      .select()
      .from(symphonyRunsTable)
      .where(eq(symphonyRunsTable.runId, runId))
      .get();

    if (!run) {
      return null;
    }

    const codexRun = this.#db
      .select()
      .from(codexRunsTable)
      .where(eq(codexRunsTable.runId, runId))
      .get();

    if (!codexRun) {
      return null;
    }

    const issue = this.#db
      .select()
      .from(symphonyIssuesTable)
      .where(eq(symphonyIssuesTable.issueId, run.issueId))
      .get();

    if (!issue) {
      return null;
    }

    const [symphonyTurns, codexTurns, eventRows] = await Promise.all([
      this.#db
        .select()
        .from(symphonyTurnsTable)
        .where(eq(symphonyTurnsTable.runId, runId))
        .orderBy(asc(symphonyTurnsTable.turnSequence))
        .all(),
      this.#db
        .select()
        .from(codexTurnsTable)
        .where(eq(codexTurnsTable.runId, runId))
        .all(),
      this.#db
        .select()
        .from(codexEventLogTable)
        .where(eq(codexEventLogTable.runId, runId))
        .orderBy(asc(codexEventLogTable.sequence))
        .all()
    ]);

    if (codexTurns.length === 0 && eventRows.length === 0) {
      return null;
    }

    const overflowIds = eventRows
      .map((row) => row.payloadOverflowId)
      .filter((value): value is string => typeof value === "string");
    const overflowRows =
      overflowIds.length === 0
        ? []
        : this.#db
            .select()
            .from(codexPayloadOverflowTable)
            .where(inArray(codexPayloadOverflowTable.id, overflowIds))
            .all();
    const overflowMap = new Map(overflowRows.map((row) => [row.id, row] as const));
    const codexTurnMap = new Map(codexTurns.map((turn) => [turn.turnId, turn] as const));

    const events: SymphonyEventRecord[] = eventRows.flatMap((row) => {
      const payload = resolveEventPayload(row, overflowMap);

      if (!row.turnId || !payload) {
        return [];
      }

      return [
        {
          eventId: row.id,
          turnId: row.turnId,
          runId: row.runId,
          eventSequence: row.sequence,
          eventType: row.eventType as SymphonyEventRecord["eventType"],
          itemType: deriveItemType(payload),
          itemStatus: deriveItemStatus(payload),
          recordedAt: row.recordedAt,
          payload: payload as SymphonyEventRecord["payload"],
          payloadTruncated: row.payloadTruncated,
          payloadBytes: byteLength(JSON.stringify(payload)),
          summary: summarizeEvent(payload),
          codexThreadId:
            row.threadId ??
            codexTurnMap.get(row.turnId)?.threadId ??
            codexRun.threadId ??
            null,
          codexTurnId: row.turnId,
          codexSessionId: null,
          insertedAt: row.insertedAt
        }
      ];
    });

    const turns = buildTurnRecords({
      run,
      symphonyTurns,
      codexTurns,
      codexRunThreadId: codexRun.threadId ?? null
    });

    return buildRunExport(
      buildIssueSummary(castIssueRecord(issue), [castRunRecord(run)]),
      castRunRecord(run),
      turns,
      events
    );
  }
}

function buildTurnRecords(input: {
  run: typeof symphonyRunsTable.$inferSelect;
  symphonyTurns: Array<typeof symphonyTurnsTable.$inferSelect>;
  codexTurns: Array<typeof codexTurnsTable.$inferSelect>;
  codexRunThreadId: string | null;
}): SymphonyTurnRecord[] {
  const codexTurnMap = new Map(
    input.codexTurns.map((turn) => [turn.turnId, turn] as const)
  );
  const knownTurnIds = new Set(input.symphonyTurns.map((turn) => turn.turnId));
  const baseTurns = input.symphonyTurns.map((turn) =>
    castTurnRecord(turn, codexTurnMap.get(turn.turnId), input.codexRunThreadId)
  );
  const maxTurnSequence = baseTurns.reduce(
    (max, turn) => Math.max(max, turn.turnSequence),
    0
  );
  const syntheticTurns = input.codexTurns
    .filter((turn) => !knownTurnIds.has(turn.turnId))
    .sort((left, right) => compareNullableIso(left.startedAt, right.startedAt))
    .map((turn, index) => synthesizeTurnRecord(input.run, turn, maxTurnSequence + index + 1));

  return [...baseTurns, ...syntheticTurns];
}

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

function castIssueRecord(
  issue: typeof symphonyIssuesTable.$inferSelect
): SymphonyIssueRecord {
  return {
    issueId: issue.issueId,
    issueIdentifier: issue.issueIdentifier,
    latestRunStartedAt: issue.latestRunStartedAt,
    insertedAt: issue.insertedAt,
    updatedAt: issue.updatedAt
  };
}

function castRunRecord(
  run: typeof symphonyRunsTable.$inferSelect
): SymphonyRunRecord {
  return {
    ...run,
    repoStart: castJsonObject(run.repoStart),
    repoEnd: castJsonObject(run.repoEnd),
    metadata: castJsonObject(run.metadata)
  };
}

function castTurnRecord(
  turn: typeof symphonyTurnsTable.$inferSelect,
  codexTurn: typeof codexTurnsTable.$inferSelect | undefined,
  codexRunThreadId: string | null
): SymphonyTurnRecord {
  return {
    ...turn,
    codexThreadId: codexTurn?.threadId ?? turn.codexThreadId ?? codexRunThreadId,
    usage: buildUsage(codexTurn, turn.usage),
    metadata: castJsonObject(turn.metadata)
  };
}

function synthesizeTurnRecord(
  run: typeof symphonyRunsTable.$inferSelect,
  codexTurn: typeof codexTurnsTable.$inferSelect,
  turnSequence: number
): SymphonyTurnRecord {
  return {
    turnId: codexTurn.turnId,
    runId: codexTurn.runId,
    turnSequence,
    codexThreadId: codexTurn.threadId ?? null,
    codexTurnId: codexTurn.turnId,
    codexSessionId: null,
    // Keep the transcript readable if a legacy prompt row is absent.
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

function buildUsage(
  codexTurn: typeof codexTurnsTable.$inferSelect | undefined,
  legacyUsage: unknown
): SymphonyTurnRecord["usage"] {
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

function castJsonObject(value: unknown): SymphonyJsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SymphonyJsonObject)
    : null;
}

function deriveItemType(
  payload: ThreadEvent
): SymphonyEventRecord["itemType"] {
  switch (payload.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      return payload.item.type as SymphonyEventRecord["itemType"];
    default:
      return null;
  }
}

function deriveItemStatus(
  payload: ThreadEvent
): SymphonyEventRecord["itemStatus"] {
  switch (payload.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      switch (payload.item.type) {
        case "command_execution":
        case "file_change":
        case "mcp_tool_call":
          return payload.item.status as SymphonyEventRecord["itemStatus"];
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
