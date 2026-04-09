import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  AgentCommandResourceProfile,
  AgentAnalyticsEventInput,
  AgentPayloadOverflowKind,
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
  symphonyAgentTaskSnapshotItemsTable,
  symphonyAgentTaskSnapshotsTable,
  symphonyAgentToolCallsTable,
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

export interface AgentAnalyticsStore {
  recordEvent(input: AgentAnalyticsEventInput): Promise<void>;
  recordCommandResourceProfile(input: {
    runId: string;
    turnId: string;
    itemId: string;
    resourceProfile: AgentCommandResourceProfile;
  }): Promise<void>;
}

const defaultPayloadMaxBytes = 64 * 1024;
const defaultPreviewMaxChars = 280;

type AgentAnalyticsMutationTx = Pick<
  BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
  "delete" | "insert" | "select" | "update"
>;

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

  async recordEvent(input: AgentAnalyticsEventInput): Promise<void> {
    this.#db.transaction((tx) => {
      const context: AgentEventMutationContext = {
        tx,
        input,
        now: isoNow(),
        payloadMaxBytes: this.#payloadMaxBytes,
        previewMaxChars: this.#previewMaxChars
      };

      const resolvedThreadId =
        input.threadId ?? extractThreadId(input.payload) ?? null;

      ensureRuntimeRunRecord(context);
      appendEventLogRow(context, resolvedThreadId);

      const itemEvent = extractItemEvent(input.payload);
      if (itemEvent) {
        projectThreadItem(context, itemEvent.item);
      }
    });
  }

  async recordCommandResourceProfile(input: {
    runId: string;
    turnId: string;
    itemId: string;
    resourceProfile: AgentCommandResourceProfile;
  }): Promise<void> {
    this.#db
      .update(symphonyAgentCommandExecutionsTable)
      .set({
        resourceProfileJson: input.resourceProfile,
        updatedAt: isoNow()
      })
      .where(
        and(
          eq(symphonyAgentCommandExecutionsTable.runId, input.runId),
          eq(symphonyAgentCommandExecutionsTable.turnId, input.turnId),
          eq(symphonyAgentCommandExecutionsTable.itemId, input.itemId)
        )
      )
      .run();
  }
}

function ensureRuntimeRunRecord(context: AgentEventMutationContext): void {
  const symphonyRun = context.tx
    .select({
      runId: symphonyRunsTable.runId
    })
    .from(symphonyRunsTable)
    .where(eq(symphonyRunsTable.runId, context.input.runId))
    .get();

  if (!symphonyRun) {
    throw new TypeError(`Agent analytics run not found: ${context.input.runId}`);
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
  const canonicalArguments = chooseCanonicalToolArguments(
    existingToolCall?.argumentsJson,
    item.arguments
  );
  const canonicalItem =
    canonicalArguments === item.arguments
      ? item
      : {
          ...item,
          arguments: canonicalArguments
        };

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
        argumentsJson: canonicalArguments,
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
    upsertPiToolRows(context, canonicalItem);
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
      argumentsJson: canonicalArguments,
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

  if (
    canonicalArguments != null &&
    typeof canonicalArguments === "object" &&
    !Array.isArray(canonicalArguments)
  ) {
    upsertPiToolRows(context, canonicalItem);
  }

  return resultOverflowId;
}

function chooseCanonicalToolArguments(
  existingArguments: unknown,
  nextArguments: unknown
): unknown {
  if (isToolArgumentRecord(existingArguments) && isToolArgumentRecord(nextArguments)) {
    return mergeToolArgumentRecords(existingArguments, nextArguments);
  }

  if (isMeaningfulToolArguments(nextArguments)) {
    return nextArguments;
  }

  if (isMeaningfulToolArguments(existingArguments)) {
    return existingArguments;
  }

  return nextArguments;
}

function isMeaningfulToolArguments(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).length > 0;
}

function isToolArgumentRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeToolArgumentRecords(
  existingArguments: Record<string, unknown>,
  nextArguments: Record<string, unknown>
): Record<string, unknown> {
  const mergedEntries = new Map<string, unknown>(Object.entries(existingArguments));

  for (const [key, value] of Object.entries(nextArguments)) {
    const existingValue = mergedEntries.get(key);

    if (isToolArgumentRecord(existingValue) && isToolArgumentRecord(value)) {
      mergedEntries.set(key, mergeToolArgumentRecords(existingValue, value));
      continue;
    }

    if (isMeaningfulToolArgumentValue(value)) {
      mergedEntries.set(key, value);
      continue;
    }

    if (!mergedEntries.has(key)) {
      mergedEntries.set(key, value);
    }
  }

  return Object.fromEntries(mergedEntries);
}

function isMeaningfulToolArgumentValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isToolArgumentRecord(value)) {
    return Object.values(value).some((entry) => isMeaningfulToolArgumentValue(entry));
  }

  return true;
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
      const writeResult = extractPiWriteResult(context, parsed);
      context.tx
        .insert(piWritesTable)
        .values({
          ...pk,
          path: parsed.path,
          lineCount: writeResult.lineCount,
          contentBytes: writeResult.contentBytes,
          bytesWritten: writeResult.bytesWritten,
          diffPreview: writeResult.diffPreview,
          diffOverflowId: writeResult.diffOverflowId,
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
  const diff = normalizePiEditDiff(parsed.path, getString(details, "diff"), parsed.edits);
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
  context: AgentEventMutationContext,
  parsed: PiWriteArguments
): {
  lineCount: number;
  contentBytes: number;
  bytesWritten: number | null;
  diffPreview: string | null;
  diffOverflowId: string | null;
} {
  const rawPayload = asRecord(context.input.rawPayload);
  const result = asRecord(rawPayload?.result);
  const resultText = extractToolResultText(result);
  const bytesWrittenMatch = resultText?.match(/\bSuccessfully wrote (\d+) bytes to\b/);
  const diff = buildPiWriteDiff(parsed.path, parsed.content);
  const diffOverflowId =
    context.input.turnId
      ? maybeStoreTextOverflow(
          context.payloadMaxBytes,
          (overflow) => storeOverflowRecord(context, overflow),
          "tool_result",
          diff,
          context.input.turnId,
          `${parsed.path}:write-diff`
        )
      : null;

  return {
    lineCount: countTextLines(parsed.content),
    contentBytes: byteLength(parsed.content),
    bytesWritten: bytesWrittenMatch ? Number.parseInt(bytesWrittenMatch[1] ?? "", 10) : null,
    diffPreview: previewText(diff, 500),
    diffOverflowId
  };
}

function buildPiWriteDiff(path: string, content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ write @@",
    ...lines.map((line) => `+${line}`)
  ].join("\n");
}

function normalizePiEditDiff(
  path: string,
  diffText: string | null,
  edits: PiEditArguments["edits"]
): string | null {
  if (diffText && diffText.trim() !== "") {
    return ensureDiffHasFileHeaders(path, diffText);
  }

  return buildPiEditDiff(path, edits);
}

function buildPiEditDiff(
  path: string,
  edits: PiEditArguments["edits"]
): string | null {
  if (edits.length === 0) {
    return null;
  }

  const hunks = edits.map((edit, index) => {
    const oldLines = edit.oldText.replace(/\r\n/g, "\n").split("\n");
    const newLines = edit.newText.replace(/\r\n/g, "\n").split("\n");

    return [
      `@@ edit ${index + 1} @@`,
      ...oldLines.map((line) => `-${line}`),
      ...newLines.map((line) => `+${line}`)
    ].join("\n");
  });

  return ensureDiffHasFileHeaders(path, hunks.join("\n\n"));
}

function ensureDiffHasFileHeaders(path: string, diffText: string): string {
  const normalized = diffText.replace(/\r\n/g, "\n").trim();
  if (normalized.startsWith("--- ") || normalized.startsWith("diff --git ")) {
    return normalized;
  }

  return [`--- a/${path}`, `+++ b/${path}`, normalized].join("\n");
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

function byteLength(value: string | null): number {
  return Buffer.byteLength(value ?? "", "utf8");
}

function isoNow(): string {
  return new Date().toISOString();
}
