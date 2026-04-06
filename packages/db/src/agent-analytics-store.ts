import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  AgentAnalyticsEventInput,
  AgentAnalyticsRunFinalize,
  AgentAnalyticsTurnFinalize,
  AgentAnalyticsRunStart,
  AgentAnalyticsStore as LegacyAgentAnalyticsStore,
  AgentPayloadOverflowKind,
  AgentRunStatus,
  AgentTurnStatus,
  FileChangeItem,
  ThreadItem
} from "@symphony/agent-analytics";
import {
  commandOutput,
  computeDurationMs,
  extractItemEvent,
  extractItemId,
  extractItemStatus,
  extractThreadId,
  messageText,
  previewItem,
  previewText,
  toolResultContent
} from "@symphony/agent-analytics";
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
  symphonyRunsTable
} from "./schema.js";
import {
  parseKnownPiToolArguments,
  type PiReadArguments,
  type PiEditArguments,
  type PiWriteArguments,
  type PiGrepArguments,
  type PiFindArguments
} from "@symphony/contracts";

export type AgentAnalyticsStore = LegacyAgentAnalyticsStore;

const defaultPayloadMaxBytes = 64 * 1024;
const defaultPreviewMaxChars = 280;

type AgentAnalyticsMutationTx = Pick<
  BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  "delete" | "insert" | "select" | "update"
>;

type AgentRunRow = typeof symphonyAgentRunsTable.$inferSelect;
type AgentTurnPatch = {
  turnId: string;
  threadId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  status?: AgentTurnStatus;
  failureKind?: string | null;
  failureMessagePreview?: string | null;
  usage?: { input_tokens: number; cached_input_tokens: number; output_tokens: number } | null;
};
type AgentOverflowInput = {
  kind: AgentPayloadOverflowKind;
  contentJson?: unknown;
  contentText?: string | null;
  turnId?: string | null;
  itemId?: string | null;
};
type AgentEventMutationContext = {
  tx: AgentAnalyticsMutationTx;
  input: AgentAnalyticsEventInput;
  now: string;
  payloadMaxBytes: number;
  previewMaxChars: number;
};

export function createSqliteAgentAnalyticsStore(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  payloadMaxBytes?: number;
  previewMaxChars?: number;
}): AgentAnalyticsStore {
  return new SqliteAgentAnalyticsStore(input);
}

class SqliteAgentAnalyticsStore implements AgentAnalyticsStore {
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  readonly #payloadMaxBytes: number;
  readonly #previewMaxChars: number;

  constructor(input: {
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
    payloadMaxBytes?: number;
    previewMaxChars?: number;
  }) {
    this.#db = input.db;
    this.#payloadMaxBytes = input.payloadMaxBytes ?? defaultPayloadMaxBytes;
    this.#previewMaxChars = input.previewMaxChars ?? defaultPreviewMaxChars;
  }

  async startRun(input: AgentAnalyticsRunStart): Promise<void> {
    const now = isoNow();
    const existing = this.#db
      .select()
      .from(symphonyAgentRunsTable)
      .where(eq(symphonyAgentRunsTable.runId, input.runId))
      .get();

    if (existing) {
      this.#db
        .update(symphonyAgentRunsTable)
        .set({
          issueId: input.issueId,
          issueIdentifier: input.issueIdentifier,
          startedAt: existing.startedAt ?? input.startedAt ?? null,
          status: input.status,
          threadId: input.threadId ?? existing.threadId,
          harnessKind: input.harnessKind ?? existing.harnessKind,
          model: input.model ?? existing.model,
          providerId: input.providerId ?? existing.providerId,
          providerName: input.providerName ?? existing.providerName,
          updatedAt: now
        })
        .where(eq(symphonyAgentRunsTable.runId, input.runId))
        .run();
      return;
    }

    this.#db
      .insert(symphonyAgentRunsTable)
      .values({
        runId: input.runId,
        threadId: input.threadId,
        harnessKind: input.harnessKind ?? null,
        model: input.model ?? null,
        providerId: input.providerId ?? null,
        providerName: input.providerName ?? null,
        issueId: input.issueId,
        issueIdentifier: input.issueIdentifier,
        startedAt: input.startedAt ?? null,
        endedAt: null,
        status: input.status,
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null,
        finalTurnId: null,
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        turnCount: 0,
        itemCount: 0,
        commandCount: 0,
        toolCallCount: 0,
        fileChangeCount: 0,
        agentMessageCount: 0,
        reasoningCount: 0,
        errorCount: 0,
        latestEventAt: null,
        latestEventType: null,
        insertedAt: now,
        updatedAt: now
      })
      .run();
  }

  async recordEvent(input: AgentAnalyticsEventInput): Promise<void> {
    this.#db.transaction((tx) => {
      const context: AgentEventMutationContext = {
        tx,
        input,
        now: isoNow(),
        payloadMaxBytes: this.#payloadMaxBytes,
        previewMaxChars: this.#previewMaxChars
      };

      const run = ensureAgentRunRecord(context);
      const resolvedThreadId =
        input.threadId ?? extractThreadId(input.payload) ?? run.threadId ?? null;

      syncRunThreadId(context, run.threadId, resolvedThreadId);
      appendEventLogRow(context, resolvedThreadId);
      applyTurnEventProjection(context, resolvedThreadId);

      const itemEvent = extractItemEvent(input.payload);
      if (itemEvent) {
        projectThreadItem(context, itemEvent.item);
      }

      if (input.turnId) {
        refreshTurnRollups(context, input.turnId);
      }
      refreshRunRollups(context, resolvedThreadId);
    });
  }

  async finalizeTurn(input: AgentAnalyticsTurnFinalize): Promise<void> {
    const now = isoNow();
    this.#db.transaction((tx) => {
      const existing = tx
        .select()
        .from(symphonyAgentTurnsTable)
        .where(eq(symphonyAgentTurnsTable.turnId, input.turnId))
        .get();

      if (!existing) {
        tx
          .insert(symphonyAgentTurnsTable)
          .values({
            turnId: input.turnId,
            runId: input.runId,
            threadId: input.threadId,
            harnessKind: input.harnessKind ?? null,
            model: input.model ?? null,
            providerId: input.providerId ?? null,
            providerName: input.providerName ?? null,
            startedAt: null,
            endedAt: input.endedAt,
            status: input.status,
            failureKind: input.failureKind,
            failureMessagePreview: input.failureMessagePreview,
            lastAgentMessageItemId: null,
            lastAgentMessagePreview: null,
            lastAgentMessageOverflowId: null,
            inputTokens: input.usage?.input_tokens ?? 0,
            cachedInputTokens: input.usage?.cached_input_tokens ?? 0,
            outputTokens: input.usage?.output_tokens ?? 0,
            itemCount: 0,
            commandCount: 0,
            toolCallCount: 0,
            fileChangeCount: 0,
            agentMessageCount: 0,
            reasoningCount: 0,
            errorCount: 0,
            latestEventAt: input.endedAt,
            latestEventType: null,
            insertedAt: now,
            updatedAt: now
          })
          .run();
      } else {
        tx
          .update(symphonyAgentTurnsTable)
          .set({
            threadId: input.threadId ?? existing.threadId,
            harnessKind: input.harnessKind ?? existing.harnessKind,
            model: input.model ?? existing.model,
            providerId: input.providerId ?? existing.providerId,
            providerName: input.providerName ?? existing.providerName,
            endedAt: input.endedAt,
            status: input.status,
            failureKind: input.failureKind ?? existing.failureKind,
            failureMessagePreview:
              input.failureMessagePreview ?? existing.failureMessagePreview,
            inputTokens: input.usage?.input_tokens ?? existing.inputTokens,
            cachedInputTokens:
              input.usage?.cached_input_tokens ?? existing.cachedInputTokens,
            outputTokens: input.usage?.output_tokens ?? existing.outputTokens,
            updatedAt: now
          })
          .where(eq(symphonyAgentTurnsTable.turnId, input.turnId))
          .run();
      }

      const usageTotals = tx
        .select({
          inputTokens: sql<number>`coalesce(sum(${symphonyAgentTurnsTable.inputTokens}), 0)`,
          cachedInputTokens: sql<number>`coalesce(sum(${symphonyAgentTurnsTable.cachedInputTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${symphonyAgentTurnsTable.outputTokens}), 0)`
        })
        .from(symphonyAgentTurnsTable)
        .where(eq(symphonyAgentTurnsTable.runId, input.runId))
        .get();

      tx
        .update(symphonyAgentRunsTable)
        .set({
          inputTokens: usageTotals?.inputTokens ?? 0,
          cachedInputTokens: usageTotals?.cachedInputTokens ?? 0,
          outputTokens: usageTotals?.outputTokens ?? 0,
          updatedAt: now
        })
        .where(eq(symphonyAgentRunsTable.runId, input.runId))
        .run();
    });
  }

  async finalizeRun(input: AgentAnalyticsRunFinalize): Promise<void> {
    const now = isoNow();
    const existing = this.#db
      .select()
      .from(symphonyAgentRunsTable)
      .where(eq(symphonyAgentRunsTable.runId, input.runId))
      .get();

    if (!existing) {
      const symphonyRun = this.#db
        .select({
          issueId: symphonyRunsTable.issueId,
          issueIdentifier: symphonyRunsTable.issueIdentifier,
          startedAt: symphonyRunsTable.startedAt
        })
        .from(symphonyRunsTable)
        .where(eq(symphonyRunsTable.runId, input.runId))
        .get();

      if (!symphonyRun) {
        return;
      }

      await this.startRun({
        runId: input.runId,
        issueId: symphonyRun.issueId,
        issueIdentifier: symphonyRun.issueIdentifier,
        startedAt: symphonyRun.startedAt,
        status: "running",
        threadId: input.threadId,
        harnessKind: input.harnessKind ?? null,
        model: input.model ?? null,
        providerId: input.providerId ?? null,
        providerName: input.providerName ?? null
      });
    }

    this.#db
      .update(symphonyAgentRunsTable)
      .set({
        threadId: input.threadId ?? existing?.threadId ?? null,
        harnessKind: input.harnessKind ?? existing?.harnessKind ?? null,
        model: input.model ?? existing?.model ?? null,
        providerId: input.providerId ?? existing?.providerId ?? null,
        providerName: input.providerName ?? existing?.providerName ?? null,
        endedAt: input.endedAt,
        status: input.status,
        failureKind:
          input.failureKind === undefined ? existing?.failureKind ?? null : input.failureKind,
        failureOrigin:
          input.failureOrigin === undefined
            ? existing?.failureOrigin ?? null
            : input.failureOrigin,
        failureMessagePreview:
          input.failureMessagePreview === undefined
            ? existing?.failureMessagePreview ?? null
            : input.failureMessagePreview,
        updatedAt: now
      })
      .where(eq(symphonyAgentRunsTable.runId, input.runId))
      .run();
  }
}

function ensureAgentRunRecord(context: AgentEventMutationContext): AgentRunRow {
  const existingRun = context.tx
    .select()
    .from(symphonyAgentRunsTable)
    .where(eq(symphonyAgentRunsTable.runId, context.input.runId))
    .get();

  if (existingRun) {
    return existingRun;
  }

  const symphonyRun = context.tx
    .select({
      issueId: symphonyRunsTable.issueId,
      issueIdentifier: symphonyRunsTable.issueIdentifier,
      startedAt: symphonyRunsTable.startedAt,
      status: symphonyRunsTable.status
    })
    .from(symphonyRunsTable)
    .where(eq(symphonyRunsTable.runId, context.input.runId))
    .get();

  if (!symphonyRun) {
    throw new TypeError(`Agent analytics run not found: ${context.input.runId}`);
  }

  context.tx
    .insert(symphonyAgentRunsTable)
    .values({
      runId: context.input.runId,
      threadId: context.input.threadId ?? extractThreadId(context.input.payload),
      harnessKind: null,
      model: null,
      providerId: null,
      providerName: null,
      issueId: symphonyRun.issueId,
      issueIdentifier: symphonyRun.issueIdentifier,
      startedAt: symphonyRun.startedAt,
      endedAt: null,
      status: mapLegacyRunStatus(symphonyRun.status),
      failureKind: null,
      failureOrigin: null,
      failureMessagePreview: null,
      finalTurnId: null,
      lastAgentMessageItemId: null,
      lastAgentMessagePreview: null,
      lastAgentMessageOverflowId: null,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      turnCount: 0,
      itemCount: 0,
      commandCount: 0,
      toolCallCount: 0,
      fileChangeCount: 0,
      agentMessageCount: 0,
      reasoningCount: 0,
      errorCount: 0,
      latestEventAt: null,
      latestEventType: null,
      insertedAt: context.now,
      updatedAt: context.now
    })
    .run();

  const initializedRun = context.tx
    .select()
    .from(symphonyAgentRunsTable)
    .where(eq(symphonyAgentRunsTable.runId, context.input.runId))
    .get();

  if (!initializedRun) {
    throw new TypeError(`Failed to initialize agent run ${context.input.runId}`);
  }

  return initializedRun;
}

function syncRunThreadId(
  context: AgentEventMutationContext,
  existingThreadId: string | null,
  resolvedThreadId: string | null
): void {
  if (!resolvedThreadId || resolvedThreadId === existingThreadId) {
    return;
  }

  context.tx
    .update(symphonyAgentRunsTable)
    .set({
      threadId: resolvedThreadId,
      updatedAt: context.now
    })
    .where(eq(symphonyAgentRunsTable.runId, context.input.runId))
    .run();
}

function upsertTurnRecord(
  context: AgentEventMutationContext,
  patch: AgentTurnPatch
): void {
  const existingTurn = context.tx
    .select()
    .from(symphonyAgentTurnsTable)
    .where(eq(symphonyAgentTurnsTable.turnId, patch.turnId))
    .get();

  if (!existingTurn) {
    context.tx
      .insert(symphonyAgentTurnsTable)
      .values({
        turnId: patch.turnId,
        runId: context.input.runId,
        threadId: patch.threadId ?? null,
        startedAt: patch.startedAt ?? null,
        endedAt: patch.endedAt ?? null,
        status: patch.status ?? "running",
        failureKind: patch.failureKind ?? null,
        failureMessagePreview: patch.failureMessagePreview ?? null,
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: patch.usage?.input_tokens ?? 0,
        cachedInputTokens: patch.usage?.cached_input_tokens ?? 0,
        outputTokens: patch.usage?.output_tokens ?? 0,
        itemCount: 0,
        commandCount: 0,
        toolCallCount: 0,
        fileChangeCount: 0,
        agentMessageCount: 0,
        reasoningCount: 0,
        errorCount: 0,
        latestEventAt: context.input.recordedAt,
        latestEventType: context.input.payload.type,
        insertedAt: context.now,
        updatedAt: context.now
      })
      .run();
    return;
  }

  context.tx
    .update(symphonyAgentTurnsTable)
    .set({
      threadId: patch.threadId ?? existingTurn.threadId,
      startedAt: existingTurn.startedAt ?? patch.startedAt ?? null,
      endedAt: patch.endedAt ?? existingTurn.endedAt,
      status: patch.status ?? existingTurn.status,
      failureKind:
        patch.failureKind === undefined ? existingTurn.failureKind : patch.failureKind,
      failureMessagePreview:
        patch.failureMessagePreview === undefined
          ? existingTurn.failureMessagePreview
          : patch.failureMessagePreview,
      inputTokens: patch.usage?.input_tokens ?? existingTurn.inputTokens,
      cachedInputTokens:
        patch.usage?.cached_input_tokens ?? existingTurn.cachedInputTokens,
      outputTokens: patch.usage?.output_tokens ?? existingTurn.outputTokens,
      latestEventAt: context.input.recordedAt,
      latestEventType: context.input.payload.type,
      updatedAt: context.now
    })
    .where(eq(symphonyAgentTurnsTable.turnId, patch.turnId))
    .run();
}

function applyTurnEventProjection(
  context: AgentEventMutationContext,
  resolvedThreadId: string | null
): void {
  if (!context.input.turnId) {
    return;
  }

  switch (context.input.payload.type) {
    case "turn.started":
      upsertTurnRecord(context, {
        turnId: context.input.turnId,
        threadId: resolvedThreadId,
        startedAt: context.input.recordedAt,
        status: "running"
      });
      return;
    case "turn.completed":
      upsertTurnRecord(context, {
        turnId: context.input.turnId,
        threadId: resolvedThreadId,
        endedAt: context.input.recordedAt,
        status: "completed",
        usage: context.input.payload.usage
      });
      return;
    case "turn.failed":
      upsertTurnRecord(context, {
        turnId: context.input.turnId,
        threadId: resolvedThreadId,
        endedAt: context.input.recordedAt,
        status: "failed",
        failureKind: "turn_failed",
        failureMessagePreview: previewText(
          context.input.payload.error.message,
          context.previewMaxChars
        )
      });
      return;
    default:
      upsertTurnRecord(context, {
        turnId: context.input.turnId,
        threadId: resolvedThreadId
      });
  }
}

function storeOverflowRecord(
  context: AgentEventMutationContext,
  overflow: AgentOverflowInput
): string {
  const overflowId = randomUUID();
  const byteCount = byteLength(
    overflow.contentText ??
      (overflow.contentJson === undefined ? null : JSON.stringify(overflow.contentJson))
  );

  context.tx
    .insert(symphonyAgentPayloadOverflowTable)
    .values({
      id: overflowId,
      kind: overflow.kind,
      runId: context.input.runId,
      turnId: overflow.turnId ?? context.input.turnId ?? null,
      itemId: overflow.itemId ?? null,
      contentJson: overflow.contentJson,
      contentText: overflow.contentText ?? null,
      byteCount,
      insertedAt: context.now
    })
    .run();

  return overflowId;
}

function appendEventLogRow(
  context: AgentEventMutationContext,
  threadId: string | null
): void {
  const latestEventRow = context.tx
    .select({
      sequence: symphonyAgentEventLogTable.sequence
    })
    .from(symphonyAgentEventLogTable)
    .where(eq(symphonyAgentEventLogTable.runId, context.input.runId))
    .orderBy(desc(symphonyAgentEventLogTable.sequence))
    .limit(1)
    .get();
  const sequence = (latestEventRow?.sequence ?? 0) + 1;
  const payloadBytes = byteLength(JSON.stringify(context.input.payload));
  const payloadOverflowId =
    payloadBytes > context.payloadMaxBytes
      ? storeOverflowRecord(context, {
          kind: "event_payload",
          contentJson: context.input.payload,
          turnId: context.input.turnId,
          itemId: extractItemId(context.input.payload)
        })
      : null;
  const projectionLossOverflowId =
    context.input.projectionLosses && context.input.projectionLosses.length > 0
      ? storeOverflowRecord(context, {
          kind: "projection_losses",
          contentJson: context.input.projectionLosses,
          turnId: context.input.turnId,
          itemId: extractItemId(context.input.payload)
        })
      : null;
  const rawPayloadOverflowId =
    context.input.rawPayload === undefined
      ? null
      : storeOverflowRecord(context, {
          kind: "raw_harness_payload",
          contentJson: context.input.rawPayload,
          turnId: context.input.turnId,
          itemId: extractItemId(context.input.payload)
        });

  context.tx
    .insert(symphonyAgentEventLogTable)
    .values({
      id: randomUUID(),
      runId: context.input.runId,
      turnId: context.input.turnId,
      threadId,
      itemId: extractItemId(context.input.payload),
      eventType: context.input.payload.type,
      sequence,
      recordedAt: context.input.recordedAt,
      payloadJson: payloadOverflowId ? null : context.input.payload,
      payloadOverflowId,
      projectionLossOverflowId,
      rawPayloadOverflowId,
      payloadTruncated: false,
      insertedAt: context.now
    })
    .run();
}

function upsertItemLifecycleRecord(
  context: AgentEventMutationContext,
  item: ThreadItem,
  latestOverflowId: string | null,
  latestPreview: string | null
): void {
  if (!context.input.turnId) {
    return;
  }

  const existingItem = context.tx
    .select()
    .from(symphonyAgentItemsTable)
    .where(
      and(
        eq(symphonyAgentItemsTable.runId, context.input.runId),
        eq(symphonyAgentItemsTable.turnId, context.input.turnId),
        eq(symphonyAgentItemsTable.itemId, item.id)
      )
    )
    .get();
  const itemStatus = deriveItemLifecycleStatus(context.input, item);
  const startedAt = existingItem?.startedAt ?? context.input.recordedAt;
  const completedAt =
    context.input.payload.type === "item.completed"
      ? context.input.recordedAt
      : existingItem?.completedAt ?? null;

  if (!existingItem) {
    context.tx
      .insert(symphonyAgentItemsTable)
      .values({
        runId: context.input.runId,
        turnId: context.input.turnId,
        itemId: item.id,
        itemType: item.type,
        startedAt,
        lastUpdatedAt: context.input.recordedAt,
        completedAt,
        finalStatus: itemStatus,
        updateCount: 1,
        durationMs: computeDurationMs(startedAt, completedAt),
        latestPreview,
        latestOverflowId,
        insertedAt: context.now,
        updatedAt: context.now
      })
      .run();
    return;
  }

  context.tx
    .update(symphonyAgentItemsTable)
    .set({
      itemType: item.type,
      lastUpdatedAt: context.input.recordedAt,
      completedAt,
      finalStatus:
        context.input.payload.type === "item.completed"
          ? itemStatus
          : existingItem.finalStatus ?? itemStatus,
      updateCount: existingItem.updateCount + 1,
      durationMs: computeDurationMs(existingItem.startedAt ?? startedAt, completedAt),
      latestPreview,
      latestOverflowId: latestOverflowId ?? existingItem.latestOverflowId,
      updatedAt: context.now
    })
    .where(
      and(
        eq(symphonyAgentItemsTable.runId, context.input.runId),
        eq(symphonyAgentItemsTable.turnId, context.input.turnId),
        eq(symphonyAgentItemsTable.itemId, item.id)
      )
    )
    .run();
}

function deriveItemLifecycleStatus(
  input: AgentAnalyticsEventInput,
  item: ThreadItem
): string | null {
  const directStatus = extractItemStatus(input.payload);
  if (directStatus) {
    return directStatus;
  }

  if (item.type !== "todo_list") {
    return null;
  }

  const snapshot = buildTaskSnapshotProjection(input, item);
  if (!snapshot || snapshot.items.length === 0) {
    return "in_progress";
  }

  return snapshot.items.every(
    (task) => task.state === "completed" || task.state === "cancelled"
  )
    ? "completed"
    : "in_progress";
}

function projectThreadItem(
  context: AgentEventMutationContext,
  item: ThreadItem
): void {
  if (!context.input.turnId) {
    return;
  }

  const latestPreview = previewItem(item, context.previewMaxChars);
  let latestOverflowId: string | null = null;

  switch (item.type) {
    case "command_execution":
      latestOverflowId = projectCommandExecutionItem(context, item);
      break;
    case "mcp_tool_call":
      latestOverflowId = projectToolCallItem(context, item);
      break;
    case "agent_message":
      latestOverflowId = projectTextItem(context, "agent_message", item.id, messageText(item));
      break;
    case "reasoning":
      latestOverflowId = projectTextItem(context, "reasoning", item.id, messageText(item));
      break;
    case "file_change":
      projectFileChangeItem(context, item);
      break;
    case "todo_list":
      projectTaskSnapshotItem(context, item);
      break;
    case "web_search":
    case "error":
      break;
  }

  upsertItemLifecycleRecord(context, item, latestOverflowId, latestPreview);
}

function projectCommandExecutionItem(
  context: AgentEventMutationContext,
  item: Extract<ThreadItem, { type: "command_execution" }>
): string | null {
  if (!context.input.turnId) {
    return null;
  }

  const output = commandOutput(item);
  const outputOverflowId = maybeStoreTextOverflow(
    context.payloadMaxBytes,
    (overflow) => storeOverflowRecord(context, overflow),
    "command_output",
    output,
    context.input.turnId,
    item.id
  );
  const existingCommand = context.tx
    .select()
    .from(symphonyAgentCommandExecutionsTable)
    .where(
      and(
        eq(symphonyAgentCommandExecutionsTable.runId, context.input.runId),
        eq(symphonyAgentCommandExecutionsTable.turnId, context.input.turnId),
        eq(symphonyAgentCommandExecutionsTable.itemId, item.id)
      )
    )
    .get();

  if (!existingCommand) {
    context.tx
      .insert(symphonyAgentCommandExecutionsTable)
      .values({
        runId: context.input.runId,
        turnId: context.input.turnId,
        itemId: item.id,
        command: item.command,
        status: item.status,
        exitCode: item.exit_code ?? null,
        timeoutSeconds: extractPiCommandTimeoutSeconds(context.input.rawPayload),
        startedAt: context.input.recordedAt,
        completedAt:
          context.input.payload.type === "item.completed" ? context.input.recordedAt : null,
        durationMs: context.input.payload.type === "item.completed" ? 0 : null,
        outputPreview: previewText(output, context.previewMaxChars),
        outputOverflowId,
        insertedAt: context.now,
        updatedAt: context.now
      })
      .run();
    return outputOverflowId;
  }

  const completedAt =
    context.input.payload.type === "item.completed"
      ? context.input.recordedAt
      : existingCommand.completedAt;

  context.tx
    .update(symphonyAgentCommandExecutionsTable)
    .set({
      command: chooseCanonicalCommand(existingCommand.command, item.command),
      status: item.status,
      exitCode: item.exit_code ?? existingCommand.exitCode,
      timeoutSeconds:
        extractPiCommandTimeoutSeconds(context.input.rawPayload) ?? existingCommand.timeoutSeconds,
      completedAt,
      durationMs: computeDurationMs(existingCommand.startedAt, completedAt),
      outputPreview: previewText(output, context.previewMaxChars),
      outputOverflowId: outputOverflowId ?? existingCommand.outputOverflowId,
      updatedAt: context.now
    })
    .where(
      and(
        eq(symphonyAgentCommandExecutionsTable.runId, context.input.runId),
        eq(symphonyAgentCommandExecutionsTable.turnId, context.input.turnId),
        eq(symphonyAgentCommandExecutionsTable.itemId, item.id)
      )
    )
    .run();

  return outputOverflowId;
}

function chooseCanonicalCommand(
  existingCommand: string,
  nextCommand: string
): string {
  const normalizedExisting = existingCommand.trim();
  const normalizedNext = nextCommand.trim();

  if (normalizedNext === "") {
    return normalizedExisting;
  }

  if (normalizedExisting !== "" && normalizedNext === "bash") {
    return normalizedExisting;
  }

  return normalizedNext;
}

function projectToolCallItem(
  context: AgentEventMutationContext,
  item: Extract<ThreadItem, { type: "mcp_tool_call" }>
): string | null {
  if (!context.input.turnId) {
    return null;
  }

  const resultText = toolResultContent(item);
  const resultOverflowId =
    resultText && byteLength(resultText) > context.payloadMaxBytes
      ? storeOverflowRecord(context, {
          kind: "tool_result",
          contentJson: item.result ?? item.error ?? null,
          turnId: context.input.turnId,
          itemId: item.id
        })
      : null;
  const existingToolCall = context.tx
    .select()
    .from(symphonyAgentToolCallsTable)
    .where(
      and(
        eq(symphonyAgentToolCallsTable.runId, context.input.runId),
        eq(symphonyAgentToolCallsTable.turnId, context.input.turnId),
        eq(symphonyAgentToolCallsTable.itemId, item.id)
      )
    )
    .get();

  if (!existingToolCall) {
    context.tx
      .insert(symphonyAgentToolCallsTable)
      .values({
        runId: context.input.runId,
        turnId: context.input.turnId,
        itemId: item.id,
        server: item.server,
        tool: item.tool,
        status: item.status,
        errorMessage: item.error?.message ?? null,
        argumentsJson: item.arguments,
        resultPreview: previewText(resultText, context.previewMaxChars),
        resultOverflowId,
        startedAt: context.input.recordedAt,
        completedAt:
          context.input.payload.type === "item.completed" ? context.input.recordedAt : null,
        durationMs: context.input.payload.type === "item.completed" ? 0 : null,
        insertedAt: context.now,
        updatedAt: context.now
      })
      .run();
    upsertPiToolRows(context, item);
    return resultOverflowId;
  }

  const completedAt =
    context.input.payload.type === "item.completed"
      ? context.input.recordedAt
      : existingToolCall.completedAt;

  context.tx
    .update(symphonyAgentToolCallsTable)
    .set({
      server: item.server,
      tool: item.tool,
      status: item.status,
      errorMessage: item.error?.message ?? existingToolCall.errorMessage,
      argumentsJson: item.arguments,
      resultPreview: previewText(resultText, context.previewMaxChars),
      resultOverflowId: resultOverflowId ?? existingToolCall.resultOverflowId,
      completedAt,
      durationMs: computeDurationMs(existingToolCall.startedAt, completedAt),
      updatedAt: context.now
    })
    .where(
      and(
        eq(symphonyAgentToolCallsTable.runId, context.input.runId),
        eq(symphonyAgentToolCallsTable.turnId, context.input.turnId),
        eq(symphonyAgentToolCallsTable.itemId, item.id)
      )
    )
    .run();

  if (item.arguments != null && typeof item.arguments === "object" && !Array.isArray(item.arguments)) {
    upsertPiToolRows(context, item);
  }

  return resultOverflowId;
}

/**
 * Upsert into the dedicated pi tool tables (pi_reads, pi_edits, etc.).
 *
 * Validates raw arguments through the Zod schemas derived from the real
 * pi tool definitions and inserts a row only when validation succeeds.
 * This keeps the dedicated tables always correctly typed.
 */
function upsertPiToolRows(
  context: AgentEventMutationContext,
  item: Extract<ThreadItem, { type: "mcp_tool_call" }>
): void {
  if (!context.input.turnId) {
    return;
  }

  const runId = context.input.runId;
  const turnId = context.input.turnId;
  const itemId = item.id;
  const now = context.now;

  if (item.server !== "pi") {
    return;
  }

  const rawArgs = item.arguments;
  if (rawArgs == null || typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return;
  }

  const pk = { runId, turnId, itemId };

  switch (item.tool) {
    case "read": {
      const parsed = parseKnownPiToolArguments("read", rawArgs) as PiReadArguments | null;
      if (!parsed) return;
      context.tx.delete(piReadsTable).where(and(eq(piReadsTable.runId, runId), eq(piReadsTable.turnId, turnId), eq(piReadsTable.itemId, itemId))).run();
      context.tx.insert(piReadsTable).values({ ...pk, path: parsed.path, readOffset: parsed.offset ?? null, readLimit: parsed.limit ?? null, insertedAt: now, updatedAt: now }).run();
      break;
    }
    case "edit": {
      const parsed = parseKnownPiToolArguments("edit", rawArgs) as PiEditArguments | null;
      if (!parsed) return;
      context.tx.delete(piEditsTable).where(and(eq(piEditsTable.runId, runId), eq(piEditsTable.turnId, turnId), eq(piEditsTable.itemId, itemId))).run();
      const editResult = extractPiEditResult(context, parsed);
      context.tx
        .insert(piEditsTable)
        .values({
          ...pk,
          path: parsed.path,
          editCount: parsed.edits.length,
          lineCount: editResult.lineCount,
          firstChangedLine: editResult.firstChangedLine,
          diffPreview: editResult.diffPreview,
          diffOverflowId: editResult.diffOverflowId,
          insertedAt: now,
          updatedAt: now
        })
        .run();
      break;
    }
    case "write": {
      const parsed = parseKnownPiToolArguments("write", rawArgs) as PiWriteArguments | null;
      if (!parsed) return;
      context.tx.delete(piWritesTable).where(and(eq(piWritesTable.runId, runId), eq(piWritesTable.turnId, turnId), eq(piWritesTable.itemId, itemId))).run();
      const writeResult = extractPiWriteResult(context.input.rawPayload, parsed);
      context.tx
        .insert(piWritesTable)
        .values({
          ...pk,
          path: parsed.path,
          lineCount: writeResult.lineCount,
          contentBytes: writeResult.contentBytes,
          bytesWritten: writeResult.bytesWritten,
          insertedAt: now,
          updatedAt: now
        })
        .run();
      break;
    }
    case "grep": {
      const parsed = parseKnownPiToolArguments("grep", rawArgs) as PiGrepArguments | null;
      if (!parsed) return;
      context.tx.delete(piGrepsTable).where(and(eq(piGrepsTable.runId, runId), eq(piGrepsTable.turnId, turnId), eq(piGrepsTable.itemId, itemId))).run();
      context.tx.insert(piGrepsTable).values({ ...pk, pattern: parsed.pattern, searchPath: parsed.path ?? null, ignoreCase: parsed.ignoreCase ?? null, insertedAt: now, updatedAt: now }).run();
      break;
    }
    case "find": {
      const parsed = parseKnownPiToolArguments("find", rawArgs) as PiFindArguments | null;
      if (!parsed) return;
      context.tx.delete(piFindsTable).where(and(eq(piFindsTable.runId, runId), eq(piFindsTable.turnId, turnId), eq(piFindsTable.itemId, itemId))).run();
      context.tx.insert(piFindsTable).values({ ...pk, pattern: parsed.pattern, searchPath: parsed.path ?? null, insertedAt: now, updatedAt: now }).run();
      break;
    }
    default:
      break;
  }
}

function projectTextItem(
  context: AgentEventMutationContext,
  kind: "agent_message" | "reasoning",
  itemId: string,
  textContent: string | null
): string | null {
  if (!context.input.turnId) {
    return null;
  }

  const textOverflowId = maybeStoreTextOverflow(
    context.payloadMaxBytes,
    (overflow) => storeOverflowRecord(context, overflow),
    kind,
    textContent,
    context.input.turnId,
    itemId
  );

  upsertTextItemRow(
    context.tx,
    kind,
    context.input.runId,
    context.input.turnId,
    itemId,
    textContent,
    textOverflowId,
    context.input.recordedAt,
    context.now,
    context.previewMaxChars
  );
  upsertPiMessageEndRow(
    context.tx,
    context.input.runId,
    context.input.turnId,
    itemId,
    context.input.rawPayload,
    context.input.recordedAt,
    context.now
  );

  return textOverflowId;
}

function projectFileChangeItem(
  context: AgentEventMutationContext,
  item: Extract<ThreadItem, { type: "file_change" }>
): void {
  if (!context.input.turnId) {
    return;
  }

  context.tx
    .delete(symphonyAgentFileChangesTable)
    .where(
      and(
        eq(symphonyAgentFileChangesTable.runId, context.input.runId),
        eq(symphonyAgentFileChangesTable.turnId, context.input.turnId),
        eq(symphonyAgentFileChangesTable.itemId, item.id)
      )
    )
    .run();

  if (item.changes.length === 0) {
    return;
  }

  context.tx
    .insert(symphonyAgentFileChangesTable)
    .values(
      item.changes.map((change: FileChangeItem["changes"][number]) => ({
        runId: context.input.runId,
        turnId: context.input.turnId!,
        itemId: item.id,
        path: change.path,
        changeKind: change.kind,
        recordedAt: context.input.recordedAt,
        insertedAt: context.now
      }))
    )
    .run();
}

function projectTaskSnapshotItem(
  context: AgentEventMutationContext,
  item: Extract<ThreadItem, { type: "todo_list" }>
): void {
  if (!context.input.turnId) {
    return;
  }

  const snapshot = buildTaskSnapshotProjection(context.input, item);
  if (!snapshot) {
    return;
  }

  const snapshotId = randomUUID();

  context.tx
    .insert(symphonyAgentTaskSnapshotsTable)
    .values({
      snapshotId,
      runId: context.input.runId,
      turnId: context.input.turnId,
      itemId: item.id,
      sourceKind: snapshot.sourceKind,
      recordedAt: context.input.recordedAt,
      insertedAt: context.now
    })
    .run();

  if (snapshot.items.length === 0) {
    return;
  }

  context.tx
    .insert(symphonyAgentTaskSnapshotItemsTable)
    .values(
      snapshot.items.map((task, index) => ({
        snapshotId,
        position: index,
        label: task.label,
        state: task.state,
        section: task.section,
        insertedAt: context.now
      }))
    )
    .run();
}

function buildTaskSnapshotProjection(
  input: AgentAnalyticsEventInput,
  item: Extract<ThreadItem, { type: "todo_list" }>
): {
  sourceKind: string;
  items: Array<{
    label: string;
    state: "pending" | "in_progress" | "completed" | "cancelled";
    section: string | null;
  }>;
} | null {
  const rawPayload = asRecord(input.rawPayload);
  const rawPayloadType = getString(rawPayload, "type");

  if (rawPayloadType === "queue_update") {
    const structuredItems = extractStructuredPiQueueItems(rawPayload);
    if (structuredItems.length > 0) {
      return {
        sourceKind: "pi_queue_update",
        items: structuredItems
      };
    }
  }

  return {
    sourceKind: "todo_list_projection",
    items: item.items.map((task) => {
      const parsed = parseTaskLabel(task.text);
      return {
        label: parsed.label,
        section: parsed.section,
        state: task.completed ? "completed" : "pending"
      };
    })
  };
}

function extractStructuredPiQueueItems(
  rawPayload: Record<string, unknown> | null
): Array<{
  label: string;
  state: "pending" | "in_progress" | "completed" | "cancelled";
  section: string | null;
}> {
  if (!rawPayload) {
    return [];
  }

  const explicitTasks = getArray(rawPayload, "tasks")
    .flatMap((entry) => normalizeTaskDescriptor(asRecord(entry)))
    .filter(isTaskSnapshotEntry);
  if (explicitTasks.length > 0) {
    return explicitTasks;
  }

  return [
    ...getStringArray(rawPayload.steering).map((label) => ({
      label,
      state: "pending" as const,
      section: "steering"
    })),
    ...getStringArray(rawPayload.followUp).map((label) => ({
      label,
      state: "pending" as const,
      section: "follow_up"
    })),
    ...getStringArray(rawPayload.inProgress).map((label) => ({
      label,
      state: "in_progress" as const,
      section: null
    })),
    ...getStringArray(rawPayload.completed).map((label) => ({
      label,
      state: "completed" as const,
      section: null
    })),
    ...getStringArray(rawPayload.cancelled).map((label) => ({
      label,
      state: "cancelled" as const,
      section: null
    }))
  ];
}

function normalizeTaskDescriptor(value: Record<string, unknown> | null): {
  label: string;
  state: "pending" | "in_progress" | "completed" | "cancelled";
  section: string | null;
} | null {
  if (!value) {
    return null;
  }

  const label = getString(value, "label") ?? getString(value, "text");
  if (!label) {
    return null;
  }

  const state = normalizeTaskState(getString(value, "state") ?? getString(value, "status"));

  return {
    label,
    state,
    section: getString(value, "section")
  };
}

function normalizeTaskState(
  value: string | null
): "pending" | "in_progress" | "completed" | "cancelled" {
  switch (value) {
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function parseTaskLabel(input: string): {
  label: string;
  section: string | null;
} {
  const steeringPrefix = "[Steering] ";
  const followUpPrefix = "[Follow-up] ";

  if (input.startsWith(steeringPrefix)) {
    return {
      label: input.slice(steeringPrefix.length),
      section: "steering"
    };
  }

  if (input.startsWith(followUpPrefix)) {
    return {
      label: input.slice(followUpPrefix.length),
      section: "follow_up"
    };
  }

  return {
    label: input,
    section: null
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: Record<string, unknown> | null, key: string): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function getArray(value: Record<string, unknown> | null, key: string): unknown[] {
  const nested = value?.[key];
  return Array.isArray(nested) ? nested : [];
}

function getInteger(value: Record<string, unknown> | null, key: string): number | null {
  const nested = value?.[key];
  return typeof nested === "number" && Number.isFinite(nested) && nested >= 0
    ? Math.floor(nested)
    : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function isTaskSnapshotEntry(
  value: {
    label: string;
    state: "pending" | "in_progress" | "completed" | "cancelled";
    section: string | null;
  } | null
): value is {
  label: string;
  state: "pending" | "in_progress" | "completed" | "cancelled";
  section: string | null;
} {
  return value !== null;
}

function refreshTurnRollups(
  context: AgentEventMutationContext,
  turnId: string
): void {
  const latestEvent = context.tx
    .select({
      recordedAt: symphonyAgentEventLogTable.recordedAt,
      eventType: symphonyAgentEventLogTable.eventType
    })
    .from(symphonyAgentEventLogTable)
    .where(
      and(
        eq(symphonyAgentEventLogTable.runId, context.input.runId),
        eq(symphonyAgentEventLogTable.turnId, turnId)
      )
    )
    .orderBy(desc(symphonyAgentEventLogTable.sequence))
    .limit(1)
    .get();
  const latestAgentItem = context.tx
    .select({
      itemId: symphonyAgentItemsTable.itemId
    })
    .from(symphonyAgentItemsTable)
    .where(
      and(
        eq(symphonyAgentItemsTable.runId, context.input.runId),
        eq(symphonyAgentItemsTable.turnId, turnId),
        eq(symphonyAgentItemsTable.itemType, "agent_message")
      )
    )
    .orderBy(desc(symphonyAgentItemsTable.updatedAt))
    .limit(1)
    .get();
  const latestAgentMessage = latestAgentItem
    ? context.tx
        .select({
          textPreview: symphonyAgentMessagesTable.textPreview,
          textOverflowId: symphonyAgentMessagesTable.textOverflowId
        })
        .from(symphonyAgentMessagesTable)
        .where(
          and(
            eq(symphonyAgentMessagesTable.runId, context.input.runId),
            eq(symphonyAgentMessagesTable.turnId, turnId),
            eq(symphonyAgentMessagesTable.itemId, latestAgentItem.itemId)
          )
        )
        .get()
    : null;

  context.tx
    .update(symphonyAgentTurnsTable)
    .set({
      itemCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentItemsTable)
          .where(
            and(
              eq(symphonyAgentItemsTable.runId, context.input.runId),
              eq(symphonyAgentItemsTable.turnId, turnId)
            )
          )
          .get()
      ),
      commandCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentCommandExecutionsTable)
          .where(
            and(
              eq(symphonyAgentCommandExecutionsTable.runId, context.input.runId),
              eq(symphonyAgentCommandExecutionsTable.turnId, turnId)
            )
          )
          .get()
      ),
      toolCallCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentToolCallsTable)
          .where(
            and(
              eq(symphonyAgentToolCallsTable.runId, context.input.runId),
              eq(symphonyAgentToolCallsTable.turnId, turnId)
            )
          )
          .get()
      ),
      fileChangeCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentFileChangesTable)
          .where(
            and(
              eq(symphonyAgentFileChangesTable.runId, context.input.runId),
              eq(symphonyAgentFileChangesTable.turnId, turnId)
            )
          )
          .get()
      ),
      agentMessageCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentMessagesTable)
          .where(
            and(
              eq(symphonyAgentMessagesTable.runId, context.input.runId),
              eq(symphonyAgentMessagesTable.turnId, turnId)
            )
          )
          .get()
      ),
      reasoningCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentReasoningTable)
          .where(
            and(
              eq(symphonyAgentReasoningTable.runId, context.input.runId),
              eq(symphonyAgentReasoningTable.turnId, turnId)
            )
          )
          .get()
      ),
      errorCount:
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(symphonyAgentItemsTable)
            .where(
              and(
                eq(symphonyAgentItemsTable.runId, context.input.runId),
                eq(symphonyAgentItemsTable.turnId, turnId),
                eq(symphonyAgentItemsTable.itemType, "error")
              )
            )
            .get()
        ) +
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(symphonyAgentEventLogTable)
            .where(
              and(
                eq(symphonyAgentEventLogTable.runId, context.input.runId),
                eq(symphonyAgentEventLogTable.turnId, turnId),
                eq(symphonyAgentEventLogTable.eventType, "error")
              )
            )
            .get()
        ),
      lastAgentMessageItemId: latestAgentItem?.itemId ?? null,
      lastAgentMessagePreview: latestAgentMessage?.textPreview ?? null,
      lastAgentMessageOverflowId: latestAgentMessage?.textOverflowId ?? null,
      latestEventAt: latestEvent?.recordedAt ?? null,
      latestEventType: latestEvent?.eventType ?? null,
      updatedAt: context.now
    })
    .where(eq(symphonyAgentTurnsTable.turnId, turnId))
    .run();
}

function refreshRunRollups(
  context: AgentEventMutationContext,
  resolvedThreadId: string | null
): void {
  const latestEvent = context.tx
    .select({
      recordedAt: symphonyAgentEventLogTable.recordedAt,
      eventType: symphonyAgentEventLogTable.eventType
    })
    .from(symphonyAgentEventLogTable)
    .where(eq(symphonyAgentEventLogTable.runId, context.input.runId))
    .orderBy(desc(symphonyAgentEventLogTable.sequence))
    .limit(1)
    .get();
  const latestAgentItem = context.tx
    .select({
      turnId: symphonyAgentItemsTable.turnId,
      itemId: symphonyAgentItemsTable.itemId
    })
    .from(symphonyAgentItemsTable)
    .where(
      and(
        eq(symphonyAgentItemsTable.runId, context.input.runId),
        eq(symphonyAgentItemsTable.itemType, "agent_message")
      )
    )
    .orderBy(desc(symphonyAgentItemsTable.updatedAt))
    .limit(1)
    .get();
  const latestAgentMessage = latestAgentItem
    ? context.tx
        .select({
          textPreview: symphonyAgentMessagesTable.textPreview,
          textOverflowId: symphonyAgentMessagesTable.textOverflowId
        })
        .from(symphonyAgentMessagesTable)
        .where(
          and(
            eq(symphonyAgentMessagesTable.runId, context.input.runId),
            eq(symphonyAgentMessagesTable.turnId, latestAgentItem.turnId),
            eq(symphonyAgentMessagesTable.itemId, latestAgentItem.itemId)
          )
        )
        .get()
    : null;
  const finalTurn = context.tx
    .select({
      turnId: symphonyAgentTurnsTable.turnId
    })
    .from(symphonyAgentTurnsTable)
    .where(
      and(
        eq(symphonyAgentTurnsTable.runId, context.input.runId),
        sql`${symphonyAgentTurnsTable.status} <> 'running'`
      )
    )
    .orderBy(desc(symphonyAgentTurnsTable.updatedAt))
    .limit(1)
    .get();
  const usageTotals = context.tx
    .select({
      inputTokens: sql<number>`coalesce(sum(${symphonyAgentTurnsTable.inputTokens}), 0)`,
      cachedInputTokens: sql<number>`coalesce(sum(${symphonyAgentTurnsTable.cachedInputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${symphonyAgentTurnsTable.outputTokens}), 0)`
    })
    .from(symphonyAgentTurnsTable)
    .where(eq(symphonyAgentTurnsTable.runId, context.input.runId))
    .get();
  const currentRunThreadId = context.tx
    .select({ threadId: symphonyAgentRunsTable.threadId })
    .from(symphonyAgentRunsTable)
    .where(eq(symphonyAgentRunsTable.runId, context.input.runId))
    .get()?.threadId;

  context.tx
    .update(symphonyAgentRunsTable)
    .set({
      threadId:
        resolvedThreadId ??
        context.input.threadId ??
        extractThreadId(context.input.payload) ??
        currentRunThreadId ??
        null,
      finalTurnId: finalTurn?.turnId ?? null,
      lastAgentMessageItemId: latestAgentItem?.itemId ?? null,
      lastAgentMessagePreview: latestAgentMessage?.textPreview ?? null,
      lastAgentMessageOverflowId: latestAgentMessage?.textOverflowId ?? null,
      inputTokens: usageTotals?.inputTokens ?? 0,
      cachedInputTokens: usageTotals?.cachedInputTokens ?? 0,
      outputTokens: usageTotals?.outputTokens ?? 0,
      turnCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentTurnsTable)
          .where(eq(symphonyAgentTurnsTable.runId, context.input.runId))
          .get()
      ),
      itemCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentItemsTable)
          .where(eq(symphonyAgentItemsTable.runId, context.input.runId))
          .get()
      ),
      commandCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentCommandExecutionsTable)
          .where(eq(symphonyAgentCommandExecutionsTable.runId, context.input.runId))
          .get()
      ),
      toolCallCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentToolCallsTable)
          .where(eq(symphonyAgentToolCallsTable.runId, context.input.runId))
          .get()
      ),
      fileChangeCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentFileChangesTable)
          .where(eq(symphonyAgentFileChangesTable.runId, context.input.runId))
          .get()
      ),
      agentMessageCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentMessagesTable)
          .where(eq(symphonyAgentMessagesTable.runId, context.input.runId))
          .get()
      ),
      reasoningCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(symphonyAgentReasoningTable)
          .where(eq(symphonyAgentReasoningTable.runId, context.input.runId))
          .get()
      ),
      errorCount:
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(symphonyAgentItemsTable)
            .where(
              and(
                eq(symphonyAgentItemsTable.runId, context.input.runId),
                eq(symphonyAgentItemsTable.itemType, "error")
              )
            )
            .get()
        ) +
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(symphonyAgentEventLogTable)
            .where(
              and(
                eq(symphonyAgentEventLogTable.runId, context.input.runId),
                eq(symphonyAgentEventLogTable.eventType, "error")
              )
            )
            .get()
        ),
      latestEventAt: latestEvent?.recordedAt ?? null,
      latestEventType: latestEvent?.eventType ?? null,
      updatedAt: context.now
    })
    .where(eq(symphonyAgentRunsTable.runId, context.input.runId))
    .run();
}

function upsertTextItemRow(
  tx: AgentAnalyticsMutationTx,
  kind: "agent_message" | "reasoning",
  runId: string,
  turnId: string,
  itemId: string,
  textContent: string | null,
  overflowId: string | null,
  recordedAt: string,
  now: string,
  previewMaxChars: number
): void {
  const table =
    kind === "agent_message" ? symphonyAgentMessagesTable : symphonyAgentReasoningTable;
  const existing = tx
    .select()
    .from(table)
    .where(and(eq(table.runId, runId), eq(table.turnId, turnId), eq(table.itemId, itemId)))
    .get();
  const inlineText = overflowId ? null : textContent;
  const textPreview = previewText(textContent, previewMaxChars);

  if (!existing) {
    tx.insert(table)
      .values({
        runId,
        turnId,
        itemId,
        textContent: inlineText,
        textPreview,
        textOverflowId: overflowId,
        recordedAt,
        insertedAt: now,
        updatedAt: now
      })
      .run();
    return;
  }

  tx.update(table)
    .set({
      textContent: inlineText,
      textPreview,
      textOverflowId: overflowId ?? existing.textOverflowId,
      recordedAt,
      updatedAt: now
    })
    .where(and(eq(table.runId, runId), eq(table.turnId, turnId), eq(table.itemId, itemId)))
    .run();
}

function upsertPiMessageEndRow(
  tx: AgentAnalyticsMutationTx,
  runId: string,
  turnId: string,
  itemId: string,
  rawPayloadValue: unknown,
  recordedAt: string,
  now: string
): void {
  const metadata = extractPiMessageEndMetadata(rawPayloadValue, recordedAt);
  if (!metadata) {
    return;
  }

  tx.delete(piMessageEndsTable)
    .where(
      and(
        eq(piMessageEndsTable.runId, runId),
        eq(piMessageEndsTable.turnId, turnId),
        eq(piMessageEndsTable.itemId, itemId)
      )
    )
    .run();

  tx.insert(piMessageEndsTable)
    .values({
      runId,
      turnId,
      itemId,
      responseId: metadata.responseId,
      api: metadata.api,
      provider: metadata.provider,
      model: metadata.model,
      stopReason: metadata.stopReason,
      responseTimestamp: metadata.responseTimestamp,
      inputTokens: metadata.inputTokens,
      cachedInputTokens: metadata.cachedInputTokens,
      cacheWriteTokens: metadata.cacheWriteTokens,
      outputTokens: metadata.outputTokens,
      totalTokens: metadata.totalTokens,
      insertedAt: now,
      updatedAt: now
    })
    .run();
}

function extractPiMessageEndMetadata(
  rawPayloadValue: unknown,
  recordedAt: string
): {
  responseId: string | null;
  api: string | null;
  provider: string | null;
  model: string | null;
  stopReason: string | null;
  responseTimestamp: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number | null;
  outputTokens: number;
  totalTokens: number;
} | null {
  const rawPayload = asRecord(rawPayloadValue);
  if (getString(rawPayload, "type") !== "message_end") {
    return null;
  }

  const message = asRecord(rawPayload?.message);
  const usage = asRecord(rawPayload?.usage) ?? asRecord(message?.usage);
  const inputTokens = getInteger(usage, "input") ?? 0;
  const cachedInputTokens = getInteger(usage, "cacheRead") ?? 0;
  const cacheWriteTokens = getInteger(usage, "cacheWrite");
  const outputTokens = getInteger(usage, "output") ?? 0;

  return {
    responseId: getString(rawPayload, "responseId") ?? getString(message, "responseId"),
    api: getString(rawPayload, "api") ?? getString(message, "api"),
    provider: getString(rawPayload, "provider") ?? getString(message, "provider"),
    model: getString(rawPayload, "model") ?? getString(message, "model"),
    stopReason: getString(rawPayload, "stopReason") ?? getString(message, "stopReason"),
    responseTimestamp:
      normalizePiTimestamp(rawPayload?.timestamp) ??
      normalizePiTimestamp(message?.timestamp) ??
      recordedAt,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    totalTokens:
      getInteger(usage, "totalTokens") ??
      inputTokens + cachedInputTokens + (cacheWriteTokens ?? 0) + outputTokens
  };
}

function extractPiCommandTimeoutSeconds(rawPayloadValue: unknown): number | null {
  const rawPayload = asRecord(rawPayloadValue);
  const args = asRecord(rawPayload?.args);
  return getInteger(args, "timeout");
}

function extractPiEditResult(
  context: AgentEventMutationContext,
  parsed: PiEditArguments
): {
  lineCount: number;
  firstChangedLine: number | null;
  diffPreview: string | null;
  diffOverflowId: string | null;
} {
  const rawPayload = asRecord(context.input.rawPayload);
  const result = asRecord(rawPayload?.result);
  const details = asRecord(result?.details);
  const diff = getString(details, "diff");
  const firstChangedLine = getInteger(details, "firstChangedLine");
  const lineCount = countPiEditArgumentLines(parsed);
  const diffOverflowId =
    diff && context.input.turnId
      ? maybeStoreTextOverflow(
          context.payloadMaxBytes,
          (overflow) => storeOverflowRecord(context, overflow),
          "tool_result",
          diff,
          context.input.turnId,
          `${parsed.path}:diff`
        )
      : null;

  return {
    lineCount,
    firstChangedLine,
    diffPreview: previewText(diff, 500),
    diffOverflowId
  };
}

function extractPiWriteResult(
  rawPayloadValue: unknown,
  parsed: PiWriteArguments
): {
  lineCount: number;
  contentBytes: number;
  bytesWritten: number | null;
} {
  const rawPayload = asRecord(rawPayloadValue);
  const result = asRecord(rawPayload?.result);
  const resultText = extractToolResultText(result);
  const bytesWrittenMatch = resultText?.match(/\bSuccessfully wrote (\d+) bytes to\b/);

  return {
    lineCount: countTextLines(parsed.content),
    contentBytes: byteLength(parsed.content),
    bytesWritten: bytesWrittenMatch ? Number.parseInt(bytesWrittenMatch[1] ?? "", 10) : null
  };
}

function extractToolResultText(value: Record<string, unknown> | null): string | null {
  const content = getArray(value, "content");
  const firstText = content
    .map((entry) => getString(asRecord(entry), "text"))
    .find((entry): entry is string => typeof entry === "string" && entry.length > 0);

  return firstText ?? null;
}

function normalizePiTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) {
      return new Date(numeric).toISOString();
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  return null;
}

function countPiEditArgumentLines(value: PiEditArguments): number {
  return value.edits.reduce((total, edit) => {
    const oldLineCount = countTextLines(edit.oldText);
    const newLineCount = countTextLines(edit.newText);
    return total + Math.max(oldLineCount, newLineCount, 1);
  }, 0);
}

function countTextLines(value: string): number {
  if (value === "") {
    return 0;
  }

  return value.split("\n").length;
}

function maybeStoreTextOverflow(
  payloadMaxBytes: number,
  storeOverflow: (input: {
    kind: AgentPayloadOverflowKind;
    contentJson?: unknown;
    contentText?: string | null;
    turnId?: string | null;
    itemId?: string | null;
  }) => string,
  kind: AgentPayloadOverflowKind,
  text: string | null,
  turnId: string,
  itemId: string
): string | null {
  if (!text || byteLength(text) <= payloadMaxBytes) {
    return null;
  }

  return storeOverflow({
    kind,
    contentText: text,
    turnId,
    itemId
  });
}

function mapLegacyRunStatus(status: string): AgentRunStatus {
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
      return "running";
  }
}

function countRows(row: { count: number } | undefined): number {
  return typeof row?.count === "number" ? row.count : 0;
}

function byteLength(value: string | null): number {
  return Buffer.byteLength(value ?? "", "utf8");
}

function isoNow(): string {
  return new Date().toISOString();
}
