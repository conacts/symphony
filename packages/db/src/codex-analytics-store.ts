import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  CodexAnalyticsEventInput,
  CodexAnalyticsRunFinalize,
  CodexAnalyticsTurnFinalize,
  CodexAnalyticsRunStart,
  CodexAnalyticsStore,
  CodexPayloadOverflowKind,
  CodexRunStatus,
  CodexTurnStatus,
  FileChangeItem,
  ThreadItem
} from "@symphony/codex-analytics";
import {
  codexAgentMessagesTable,
  codexCommandExecutionsTable,
  codexEventLogTable,
  codexFileChangesTable,
  codexItemsTable,
  codexPayloadOverflowTable,
  codexReasoningTable,
  codexRunsTable,
  codexToolCallsTable,
  codexTurnsTable,
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
} from "@symphony/codex-analytics";
import { symphonyRunsTable } from "./schema.js";

const defaultPayloadMaxBytes = 64 * 1024;
const defaultPreviewMaxChars = 280;

type CodexAnalyticsMutationTx = Pick<
  BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  "delete" | "insert" | "select" | "update"
>;

type CodexRunRow = typeof codexRunsTable.$inferSelect;
type CodexTurnPatch = {
  turnId: string;
  threadId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  status?: CodexTurnStatus;
  failureKind?: string | null;
  failureMessagePreview?: string | null;
  usage?: { input_tokens: number; cached_input_tokens: number; output_tokens: number } | null;
};
type CodexOverflowInput = {
  kind: CodexPayloadOverflowKind;
  contentJson?: unknown;
  contentText?: string | null;
  turnId?: string | null;
  itemId?: string | null;
};
type CodexEventMutationContext = {
  tx: CodexAnalyticsMutationTx;
  input: CodexAnalyticsEventInput;
  now: string;
  payloadMaxBytes: number;
  previewMaxChars: number;
};

export function createSqliteCodexAnalyticsStore(input: {
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;
  payloadMaxBytes?: number;
  previewMaxChars?: number;
}): CodexAnalyticsStore {
  return new SqliteCodexAnalyticsStore(input);
}

class SqliteCodexAnalyticsStore implements CodexAnalyticsStore {
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

  async startRun(input: CodexAnalyticsRunStart): Promise<void> {
    const now = isoNow();
    const existing = this.#db
      .select()
      .from(codexRunsTable)
      .where(eq(codexRunsTable.runId, input.runId))
      .get();

    if (existing) {
      this.#db
        .update(codexRunsTable)
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
        .where(eq(codexRunsTable.runId, input.runId))
        .run();
      return;
    }

    this.#db
      .insert(codexRunsTable)
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

  async recordEvent(input: CodexAnalyticsEventInput): Promise<void> {
    this.#db.transaction((tx) => {
      const context: CodexEventMutationContext = {
        tx,
        input,
        now: isoNow(),
        payloadMaxBytes: this.#payloadMaxBytes,
        previewMaxChars: this.#previewMaxChars
      };

      const run = ensureCodexRunRecord(context);
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

  async finalizeTurn(input: CodexAnalyticsTurnFinalize): Promise<void> {
    const now = isoNow();
    const existing = this.#db
      .select()
      .from(codexTurnsTable)
      .where(eq(codexTurnsTable.turnId, input.turnId))
      .get();

    if (!existing) {
      this.#db
        .insert(codexTurnsTable)
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
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
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
      this.#db
        .update(codexTurnsTable)
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
          updatedAt: now
        })
        .where(eq(codexTurnsTable.turnId, input.turnId))
        .run();
    }
  }

  async finalizeRun(input: CodexAnalyticsRunFinalize): Promise<void> {
    const now = isoNow();
    const existing = this.#db
      .select()
      .from(codexRunsTable)
      .where(eq(codexRunsTable.runId, input.runId))
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
      .update(codexRunsTable)
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
      .where(eq(codexRunsTable.runId, input.runId))
      .run();
  }
}

function ensureCodexRunRecord(context: CodexEventMutationContext): CodexRunRow {
  const existingRun = context.tx
    .select()
    .from(codexRunsTable)
    .where(eq(codexRunsTable.runId, context.input.runId))
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
    throw new TypeError(`Codex analytics run not found: ${context.input.runId}`);
  }

  context.tx
    .insert(codexRunsTable)
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
    .from(codexRunsTable)
    .where(eq(codexRunsTable.runId, context.input.runId))
    .get();

  if (!initializedRun) {
    throw new TypeError(`Failed to initialize codex run ${context.input.runId}`);
  }

  return initializedRun;
}

function syncRunThreadId(
  context: CodexEventMutationContext,
  existingThreadId: string | null,
  resolvedThreadId: string | null
): void {
  if (!resolvedThreadId || resolvedThreadId === existingThreadId) {
    return;
  }

  context.tx
    .update(codexRunsTable)
    .set({
      threadId: resolvedThreadId,
      updatedAt: context.now
    })
    .where(eq(codexRunsTable.runId, context.input.runId))
    .run();
}

function upsertTurnRecord(
  context: CodexEventMutationContext,
  patch: CodexTurnPatch
): void {
  const existingTurn = context.tx
    .select()
    .from(codexTurnsTable)
    .where(eq(codexTurnsTable.turnId, patch.turnId))
    .get();

  if (!existingTurn) {
    context.tx
      .insert(codexTurnsTable)
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
    .update(codexTurnsTable)
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
    .where(eq(codexTurnsTable.turnId, patch.turnId))
    .run();
}

function applyTurnEventProjection(
  context: CodexEventMutationContext,
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
  context: CodexEventMutationContext,
  overflow: CodexOverflowInput
): string {
  const overflowId = randomUUID();
  const byteCount = byteLength(
    overflow.contentText ??
      (overflow.contentJson === undefined ? null : JSON.stringify(overflow.contentJson))
  );

  context.tx
    .insert(codexPayloadOverflowTable)
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
  context: CodexEventMutationContext,
  threadId: string | null
): void {
  const latestEventRow = context.tx
    .select({
      sequence: codexEventLogTable.sequence
    })
    .from(codexEventLogTable)
    .where(eq(codexEventLogTable.runId, context.input.runId))
    .orderBy(desc(codexEventLogTable.sequence))
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
    .insert(codexEventLogTable)
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
  context: CodexEventMutationContext,
  item: ThreadItem,
  latestOverflowId: string | null,
  latestPreview: string | null
): void {
  if (!context.input.turnId) {
    return;
  }

  const existingItem = context.tx
    .select()
    .from(codexItemsTable)
    .where(
      and(
        eq(codexItemsTable.runId, context.input.runId),
        eq(codexItemsTable.turnId, context.input.turnId),
        eq(codexItemsTable.itemId, item.id)
      )
    )
    .get();
  const itemStatus = extractItemStatus(context.input.payload);
  const startedAt = existingItem?.startedAt ?? context.input.recordedAt;
  const completedAt =
    context.input.payload.type === "item.completed"
      ? context.input.recordedAt
      : existingItem?.completedAt ?? null;

  if (!existingItem) {
    context.tx
      .insert(codexItemsTable)
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
    .update(codexItemsTable)
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
        eq(codexItemsTable.runId, context.input.runId),
        eq(codexItemsTable.turnId, context.input.turnId),
        eq(codexItemsTable.itemId, item.id)
      )
    )
    .run();
}

function projectThreadItem(
  context: CodexEventMutationContext,
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
    case "web_search":
    case "todo_list":
    case "error":
      break;
  }

  upsertItemLifecycleRecord(context, item, latestOverflowId, latestPreview);
}

function projectCommandExecutionItem(
  context: CodexEventMutationContext,
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
    .from(codexCommandExecutionsTable)
    .where(
      and(
        eq(codexCommandExecutionsTable.runId, context.input.runId),
        eq(codexCommandExecutionsTable.turnId, context.input.turnId),
        eq(codexCommandExecutionsTable.itemId, item.id)
      )
    )
    .get();

  if (!existingCommand) {
    context.tx
      .insert(codexCommandExecutionsTable)
      .values({
        runId: context.input.runId,
        turnId: context.input.turnId,
        itemId: item.id,
        command: item.command,
        status: item.status,
        exitCode: item.exit_code ?? null,
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
    .update(codexCommandExecutionsTable)
    .set({
      command: item.command,
      status: item.status,
      exitCode: item.exit_code ?? existingCommand.exitCode,
      completedAt,
      durationMs: computeDurationMs(existingCommand.startedAt, completedAt),
      outputPreview: previewText(output, context.previewMaxChars),
      outputOverflowId: outputOverflowId ?? existingCommand.outputOverflowId,
      updatedAt: context.now
    })
    .where(
      and(
        eq(codexCommandExecutionsTable.runId, context.input.runId),
        eq(codexCommandExecutionsTable.turnId, context.input.turnId),
        eq(codexCommandExecutionsTable.itemId, item.id)
      )
    )
    .run();

  return outputOverflowId;
}

function projectToolCallItem(
  context: CodexEventMutationContext,
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
    .from(codexToolCallsTable)
    .where(
      and(
        eq(codexToolCallsTable.runId, context.input.runId),
        eq(codexToolCallsTable.turnId, context.input.turnId),
        eq(codexToolCallsTable.itemId, item.id)
      )
    )
    .get();

  if (!existingToolCall) {
    context.tx
      .insert(codexToolCallsTable)
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
    return resultOverflowId;
  }

  const completedAt =
    context.input.payload.type === "item.completed"
      ? context.input.recordedAt
      : existingToolCall.completedAt;

  context.tx
    .update(codexToolCallsTable)
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
        eq(codexToolCallsTable.runId, context.input.runId),
        eq(codexToolCallsTable.turnId, context.input.turnId),
        eq(codexToolCallsTable.itemId, item.id)
      )
    )
    .run();

  return resultOverflowId;
}

function projectTextItem(
  context: CodexEventMutationContext,
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
    context.now,
    context.previewMaxChars
  );

  return textOverflowId;
}

function projectFileChangeItem(
  context: CodexEventMutationContext,
  item: Extract<ThreadItem, { type: "file_change" }>
): void {
  if (!context.input.turnId) {
    return;
  }

  context.tx
    .delete(codexFileChangesTable)
    .where(
      and(
        eq(codexFileChangesTable.runId, context.input.runId),
        eq(codexFileChangesTable.turnId, context.input.turnId),
        eq(codexFileChangesTable.itemId, item.id)
      )
    )
    .run();

  if (item.changes.length === 0) {
    return;
  }

  context.tx
    .insert(codexFileChangesTable)
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

function refreshTurnRollups(
  context: CodexEventMutationContext,
  turnId: string
): void {
  const latestEvent = context.tx
    .select({
      recordedAt: codexEventLogTable.recordedAt,
      eventType: codexEventLogTable.eventType
    })
    .from(codexEventLogTable)
    .where(
      and(
        eq(codexEventLogTable.runId, context.input.runId),
        eq(codexEventLogTable.turnId, turnId)
      )
    )
    .orderBy(desc(codexEventLogTable.sequence))
    .limit(1)
    .get();
  const latestAgentItem = context.tx
    .select({
      itemId: codexItemsTable.itemId
    })
    .from(codexItemsTable)
    .where(
      and(
        eq(codexItemsTable.runId, context.input.runId),
        eq(codexItemsTable.turnId, turnId),
        eq(codexItemsTable.itemType, "agent_message")
      )
    )
    .orderBy(desc(codexItemsTable.updatedAt))
    .limit(1)
    .get();
  const latestAgentMessage = latestAgentItem
    ? context.tx
        .select({
          textPreview: codexAgentMessagesTable.textPreview,
          textOverflowId: codexAgentMessagesTable.textOverflowId
        })
        .from(codexAgentMessagesTable)
        .where(
          and(
            eq(codexAgentMessagesTable.runId, context.input.runId),
            eq(codexAgentMessagesTable.turnId, turnId),
            eq(codexAgentMessagesTable.itemId, latestAgentItem.itemId)
          )
        )
        .get()
    : null;

  context.tx
    .update(codexTurnsTable)
    .set({
      itemCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexItemsTable)
          .where(
            and(
              eq(codexItemsTable.runId, context.input.runId),
              eq(codexItemsTable.turnId, turnId)
            )
          )
          .get()
      ),
      commandCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexCommandExecutionsTable)
          .where(
            and(
              eq(codexCommandExecutionsTable.runId, context.input.runId),
              eq(codexCommandExecutionsTable.turnId, turnId)
            )
          )
          .get()
      ),
      toolCallCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexToolCallsTable)
          .where(
            and(
              eq(codexToolCallsTable.runId, context.input.runId),
              eq(codexToolCallsTable.turnId, turnId)
            )
          )
          .get()
      ),
      fileChangeCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexFileChangesTable)
          .where(
            and(
              eq(codexFileChangesTable.runId, context.input.runId),
              eq(codexFileChangesTable.turnId, turnId)
            )
          )
          .get()
      ),
      agentMessageCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexAgentMessagesTable)
          .where(
            and(
              eq(codexAgentMessagesTable.runId, context.input.runId),
              eq(codexAgentMessagesTable.turnId, turnId)
            )
          )
          .get()
      ),
      reasoningCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexReasoningTable)
          .where(
            and(
              eq(codexReasoningTable.runId, context.input.runId),
              eq(codexReasoningTable.turnId, turnId)
            )
          )
          .get()
      ),
      errorCount:
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(codexItemsTable)
            .where(
              and(
                eq(codexItemsTable.runId, context.input.runId),
                eq(codexItemsTable.turnId, turnId),
                eq(codexItemsTable.itemType, "error")
              )
            )
            .get()
        ) +
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(codexEventLogTable)
            .where(
              and(
                eq(codexEventLogTable.runId, context.input.runId),
                eq(codexEventLogTable.turnId, turnId),
                eq(codexEventLogTable.eventType, "error")
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
    .where(eq(codexTurnsTable.turnId, turnId))
    .run();
}

function refreshRunRollups(
  context: CodexEventMutationContext,
  resolvedThreadId: string | null
): void {
  const latestEvent = context.tx
    .select({
      recordedAt: codexEventLogTable.recordedAt,
      eventType: codexEventLogTable.eventType
    })
    .from(codexEventLogTable)
    .where(eq(codexEventLogTable.runId, context.input.runId))
    .orderBy(desc(codexEventLogTable.sequence))
    .limit(1)
    .get();
  const latestAgentItem = context.tx
    .select({
      turnId: codexItemsTable.turnId,
      itemId: codexItemsTable.itemId
    })
    .from(codexItemsTable)
    .where(
      and(
        eq(codexItemsTable.runId, context.input.runId),
        eq(codexItemsTable.itemType, "agent_message")
      )
    )
    .orderBy(desc(codexItemsTable.updatedAt))
    .limit(1)
    .get();
  const latestAgentMessage = latestAgentItem
    ? context.tx
        .select({
          textPreview: codexAgentMessagesTable.textPreview,
          textOverflowId: codexAgentMessagesTable.textOverflowId
        })
        .from(codexAgentMessagesTable)
        .where(
          and(
            eq(codexAgentMessagesTable.runId, context.input.runId),
            eq(codexAgentMessagesTable.turnId, latestAgentItem.turnId),
            eq(codexAgentMessagesTable.itemId, latestAgentItem.itemId)
          )
        )
        .get()
    : null;
  const finalTurn = context.tx
    .select({
      turnId: codexTurnsTable.turnId
    })
    .from(codexTurnsTable)
    .where(
      and(
        eq(codexTurnsTable.runId, context.input.runId),
        sql`${codexTurnsTable.status} <> 'running'`
      )
    )
    .orderBy(desc(codexTurnsTable.updatedAt))
    .limit(1)
    .get();
  const usageTotals = context.tx
    .select({
      inputTokens: sql<number>`coalesce(sum(${codexTurnsTable.inputTokens}), 0)`,
      cachedInputTokens: sql<number>`coalesce(sum(${codexTurnsTable.cachedInputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${codexTurnsTable.outputTokens}), 0)`
    })
    .from(codexTurnsTable)
    .where(eq(codexTurnsTable.runId, context.input.runId))
    .get();
  const currentRunThreadId = context.tx
    .select({ threadId: codexRunsTable.threadId })
    .from(codexRunsTable)
    .where(eq(codexRunsTable.runId, context.input.runId))
    .get()?.threadId;

  context.tx
    .update(codexRunsTable)
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
          .from(codexTurnsTable)
          .where(eq(codexTurnsTable.runId, context.input.runId))
          .get()
      ),
      itemCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexItemsTable)
          .where(eq(codexItemsTable.runId, context.input.runId))
          .get()
      ),
      commandCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexCommandExecutionsTable)
          .where(eq(codexCommandExecutionsTable.runId, context.input.runId))
          .get()
      ),
      toolCallCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexToolCallsTable)
          .where(eq(codexToolCallsTable.runId, context.input.runId))
          .get()
      ),
      fileChangeCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexFileChangesTable)
          .where(eq(codexFileChangesTable.runId, context.input.runId))
          .get()
      ),
      agentMessageCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexAgentMessagesTable)
          .where(eq(codexAgentMessagesTable.runId, context.input.runId))
          .get()
      ),
      reasoningCount: countRows(
        context.tx
          .select({ count: sql<number>`count(*)` })
          .from(codexReasoningTable)
          .where(eq(codexReasoningTable.runId, context.input.runId))
          .get()
      ),
      errorCount:
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(codexItemsTable)
            .where(
              and(
                eq(codexItemsTable.runId, context.input.runId),
                eq(codexItemsTable.itemType, "error")
              )
            )
            .get()
        ) +
        countRows(
          context.tx
            .select({ count: sql<number>`count(*)` })
            .from(codexEventLogTable)
            .where(
              and(
                eq(codexEventLogTable.runId, context.input.runId),
                eq(codexEventLogTable.eventType, "error")
              )
            )
            .get()
        ),
      latestEventAt: latestEvent?.recordedAt ?? null,
      latestEventType: latestEvent?.eventType ?? null,
      updatedAt: context.now
    })
    .where(eq(codexRunsTable.runId, context.input.runId))
    .run();
}

function upsertTextItemRow(
  tx: CodexAnalyticsMutationTx,
  kind: "agent_message" | "reasoning",
  runId: string,
  turnId: string,
  itemId: string,
  textContent: string | null,
  overflowId: string | null,
  now: string,
  previewMaxChars: number
): void {
  const table =
    kind === "agent_message" ? codexAgentMessagesTable : codexReasoningTable;
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
      updatedAt: now
    })
    .where(and(eq(table.runId, runId), eq(table.turnId, turnId), eq(table.itemId, itemId)))
    .run();
}

function maybeStoreTextOverflow(
  payloadMaxBytes: number,
  storeOverflow: (input: {
    kind: CodexPayloadOverflowKind;
    contentJson?: unknown;
    contentText?: string | null;
    turnId?: string | null;
    itemId?: string | null;
  }) => string,
  kind: CodexPayloadOverflowKind,
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

function mapLegacyRunStatus(status: string): CodexRunStatus {
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
