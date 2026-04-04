import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  CodexAnalyticsEventInput,
  CodexAnalyticsRunFinalize,
  CodexAnalyticsRunStart,
  CodexAnalyticsStore,
  CodexAnalyticsTurnFinalize,
  CodexPayloadOverflowKind,
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
  "insert" | "select" | "update"
>;

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
          startedAt: existing.startedAt ?? input.startedAt,
          status: input.status,
          threadId: input.threadId ?? existing.threadId,
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
        issueId: input.issueId,
        issueIdentifier: input.issueIdentifier,
        startedAt: input.startedAt,
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
      const now = isoNow();

      const ensureRunRecord = () => {
        let run = tx
          .select()
          .from(codexRunsTable)
          .where(eq(codexRunsTable.runId, input.runId))
          .get();

        if (run) {
          return run;
        }

        const symphonyRun = tx
          .select({
            issueId: symphonyRunsTable.issueId,
            issueIdentifier: symphonyRunsTable.issueIdentifier,
            startedAt: symphonyRunsTable.startedAt,
            status: symphonyRunsTable.status
          })
          .from(symphonyRunsTable)
          .where(eq(symphonyRunsTable.runId, input.runId))
          .get();

        if (!symphonyRun) {
          throw new TypeError(`Codex analytics run not found: ${input.runId}`);
        }

        tx.insert(codexRunsTable)
          .values({
            runId: input.runId,
            threadId: input.threadId ?? extractThreadId(input.payload),
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
            insertedAt: now,
            updatedAt: now
          })
          .run();

        run = tx
          .select()
          .from(codexRunsTable)
          .where(eq(codexRunsTable.runId, input.runId))
          .get();

        if (!run) {
          throw new TypeError(`Failed to initialize codex run ${input.runId}`);
        }

        return run;
      };

      const upsertTurnRecord = (patch: {
        turnId: string;
        threadId?: string | null;
        startedAt?: string | null;
        endedAt?: string | null;
        status?: string;
        failureKind?: string | null;
        failureMessagePreview?: string | null;
        usage?: { input_tokens: number; cached_input_tokens: number; output_tokens: number } | null;
      }) => {
        const existing = tx
          .select()
          .from(codexTurnsTable)
          .where(eq(codexTurnsTable.turnId, patch.turnId))
          .get();

        if (!existing) {
          tx.insert(codexTurnsTable)
            .values({
              turnId: patch.turnId,
              runId: input.runId,
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
              latestEventAt: input.recordedAt,
              latestEventType: input.payload.type,
              insertedAt: now,
              updatedAt: now
            })
            .run();
          return;
        }

        tx.update(codexTurnsTable)
          .set({
            threadId: patch.threadId ?? existing.threadId,
            startedAt: existing.startedAt ?? patch.startedAt ?? null,
            endedAt: patch.endedAt ?? existing.endedAt,
            status: patch.status ?? existing.status,
            failureKind:
              patch.failureKind === undefined ? existing.failureKind : patch.failureKind,
            failureMessagePreview:
              patch.failureMessagePreview === undefined
                ? existing.failureMessagePreview
                : patch.failureMessagePreview,
            inputTokens: patch.usage?.input_tokens ?? existing.inputTokens,
            cachedInputTokens:
              patch.usage?.cached_input_tokens ?? existing.cachedInputTokens,
            outputTokens: patch.usage?.output_tokens ?? existing.outputTokens,
            latestEventAt: input.recordedAt,
            latestEventType: input.payload.type,
            updatedAt: now
          })
          .where(eq(codexTurnsTable.turnId, patch.turnId))
          .run();
      };

      const storeOverflow = (inputOverflow: {
        kind: CodexPayloadOverflowKind;
        contentJson?: unknown;
        contentText?: string | null;
        turnId?: string | null;
        itemId?: string | null;
      }): string => {
        const overflowId = randomUUID();
        const byteCount = byteLength(
          inputOverflow.contentText ??
            (inputOverflow.contentJson === undefined
              ? null
              : JSON.stringify(inputOverflow.contentJson))
        );

        tx.insert(codexPayloadOverflowTable)
          .values({
            id: overflowId,
            kind: inputOverflow.kind,
            runId: input.runId,
            turnId: inputOverflow.turnId ?? input.turnId ?? null,
            itemId: inputOverflow.itemId ?? null,
            contentJson: inputOverflow.contentJson,
            contentText: inputOverflow.contentText ?? null,
            byteCount,
            insertedAt: now
          })
          .run();

        return overflowId;
      };

      const appendEventLogRow = (threadId: string | null) => {
        const latest = tx
          .select({
            sequence: codexEventLogTable.sequence
          })
          .from(codexEventLogTable)
          .where(eq(codexEventLogTable.runId, input.runId))
          .orderBy(desc(codexEventLogTable.sequence))
          .limit(1)
          .get();
        const sequence = (latest?.sequence ?? 0) + 1;
        const payloadBytes = byteLength(JSON.stringify(input.payload));
        const payloadOverflowId =
          payloadBytes > this.#payloadMaxBytes
            ? storeOverflow({
                kind: "event_payload",
                contentJson: input.payload,
                turnId: input.turnId,
                itemId: extractItemId(input.payload)
              })
            : null;

        tx.insert(codexEventLogTable)
          .values({
            id: randomUUID(),
            runId: input.runId,
            turnId: input.turnId,
            threadId,
            itemId: extractItemId(input.payload),
            eventType: input.payload.type,
            sequence,
            recordedAt: input.recordedAt,
            payloadJson: payloadOverflowId ? null : input.payload,
            payloadOverflowId,
            payloadTruncated: false,
            insertedAt: now
          })
          .run();
      };

      const upsertItem = (
        item: ThreadItem,
        overflowId: string | null,
        latestPreview: string | null
      ) => {
        if (!input.turnId) {
          return;
        }

        const existing = tx
          .select()
          .from(codexItemsTable)
          .where(
            and(
              eq(codexItemsTable.runId, input.runId),
              eq(codexItemsTable.turnId, input.turnId),
              eq(codexItemsTable.itemId, item.id)
            )
          )
          .get();
        const itemStatus = extractItemStatus(input.payload);
        const startedAt = existing?.startedAt ?? input.recordedAt;
        const completedAt =
          input.payload.type === "item.completed"
            ? input.recordedAt
            : existing?.completedAt ?? null;

        if (!existing) {
          tx.insert(codexItemsTable)
            .values({
              runId: input.runId,
              turnId: input.turnId,
              itemId: item.id,
              itemType: item.type,
              startedAt,
              lastUpdatedAt: input.recordedAt,
              completedAt,
              finalStatus: itemStatus,
              updateCount: 1,
              durationMs: computeDurationMs(startedAt, completedAt),
              latestPreview,
              latestOverflowId: overflowId,
              insertedAt: now,
              updatedAt: now
            })
            .run();
          return;
        }

        tx.update(codexItemsTable)
          .set({
            itemType: item.type,
            lastUpdatedAt: input.recordedAt,
            completedAt,
            finalStatus:
              input.payload.type === "item.completed"
                ? itemStatus
                : existing.finalStatus ?? itemStatus,
            updateCount: existing.updateCount + 1,
            durationMs: computeDurationMs(existing.startedAt ?? startedAt, completedAt),
            latestPreview,
            latestOverflowId: overflowId ?? existing.latestOverflowId,
            updatedAt: now
          })
          .where(
            and(
              eq(codexItemsTable.runId, input.runId),
              eq(codexItemsTable.turnId, input.turnId),
              eq(codexItemsTable.itemId, item.id)
            )
          )
          .run();
      };

      const projectThreadItem = (item: ThreadItem) => {
        if (!input.turnId) {
          return;
        }

        let latestOverflowId: string | null = null;
        const latestPreview = previewItem(item, this.#previewMaxChars);

        switch (item.type) {
          case "command_execution": {
            const output = commandOutput(item);
            latestOverflowId = maybeStoreTextOverflow(
              this.#payloadMaxBytes,
              storeOverflow,
              "command_output",
              output,
              input.turnId,
              item.id
            );

            const existing = tx
              .select()
              .from(codexCommandExecutionsTable)
              .where(
                and(
                  eq(codexCommandExecutionsTable.runId, input.runId),
                  eq(codexCommandExecutionsTable.turnId, input.turnId),
                  eq(codexCommandExecutionsTable.itemId, item.id)
                )
              )
              .get();

            if (!existing) {
              tx.insert(codexCommandExecutionsTable)
                .values({
                  runId: input.runId,
                  turnId: input.turnId,
                  itemId: item.id,
                  command: item.command,
                  status: item.status,
                  exitCode: item.exit_code ?? null,
                  startedAt: input.recordedAt,
                  completedAt: input.payload.type === "item.completed" ? input.recordedAt : null,
                  durationMs:
                    input.payload.type === "item.completed" ? 0 : null,
                  outputPreview: previewText(output, this.#previewMaxChars),
                  outputOverflowId: latestOverflowId,
                  insertedAt: now,
                  updatedAt: now
                })
                .run();
            } else {
              const completedAt =
                input.payload.type === "item.completed"
                  ? input.recordedAt
                  : existing.completedAt;
              tx.update(codexCommandExecutionsTable)
                .set({
                  command: item.command,
                  status: item.status,
                  exitCode: item.exit_code ?? existing.exitCode,
                  completedAt,
                  durationMs: computeDurationMs(existing.startedAt, completedAt),
                  outputPreview: previewText(output, this.#previewMaxChars),
                  outputOverflowId: latestOverflowId ?? existing.outputOverflowId,
                  updatedAt: now
                })
                .where(
                  and(
                    eq(codexCommandExecutionsTable.runId, input.runId),
                    eq(codexCommandExecutionsTable.turnId, input.turnId),
                    eq(codexCommandExecutionsTable.itemId, item.id)
                  )
                )
                .run();
            }
            break;
          }
          case "mcp_tool_call": {
            const resultText = toolResultContent(item);
            latestOverflowId =
              resultText && byteLength(resultText) > this.#payloadMaxBytes
                ? storeOverflow({
                    kind: "tool_result",
                    contentJson: item.result ?? item.error ?? null,
                    turnId: input.turnId,
                    itemId: item.id
                  })
                : null;

            const existing = tx
              .select()
              .from(codexToolCallsTable)
              .where(
                and(
                  eq(codexToolCallsTable.runId, input.runId),
                  eq(codexToolCallsTable.turnId, input.turnId),
                  eq(codexToolCallsTable.itemId, item.id)
                )
              )
              .get();

            if (!existing) {
              tx.insert(codexToolCallsTable)
                .values({
                  runId: input.runId,
                  turnId: input.turnId,
                  itemId: item.id,
                  server: item.server,
                  tool: item.tool,
                  status: item.status,
                  errorMessage: item.error?.message ?? null,
                  argumentsJson: item.arguments,
                  resultPreview: previewText(resultText, this.#previewMaxChars),
                  resultOverflowId: latestOverflowId,
                  startedAt: input.recordedAt,
                  completedAt: input.payload.type === "item.completed" ? input.recordedAt : null,
                  durationMs:
                    input.payload.type === "item.completed" ? 0 : null,
                  insertedAt: now,
                  updatedAt: now
                })
                .run();
            } else {
              const completedAt =
                input.payload.type === "item.completed"
                  ? input.recordedAt
                  : existing.completedAt;
              tx.update(codexToolCallsTable)
                .set({
                  server: item.server,
                  tool: item.tool,
                  status: item.status,
                  errorMessage: item.error?.message ?? existing.errorMessage,
                  argumentsJson: item.arguments,
                  resultPreview: previewText(resultText, this.#previewMaxChars),
                  resultOverflowId: latestOverflowId ?? existing.resultOverflowId,
                  completedAt,
                  durationMs: computeDurationMs(existing.startedAt, completedAt),
                  updatedAt: now
                })
                .where(
                  and(
                    eq(codexToolCallsTable.runId, input.runId),
                    eq(codexToolCallsTable.turnId, input.turnId),
                    eq(codexToolCallsTable.itemId, item.id)
                  )
                )
                .run();
            }
            break;
          }
          case "agent_message": {
            latestOverflowId = maybeStoreTextOverflow(
              this.#payloadMaxBytes,
              storeOverflow,
              "agent_message",
              messageText(item),
              input.turnId,
              item.id
            );

            upsertTextItemRow(
              tx,
              "agent_message",
              input.runId,
              input.turnId,
              item.id,
              messageText(item),
              latestOverflowId,
              now,
              this.#previewMaxChars
            );
            break;
          }
          case "reasoning": {
            latestOverflowId = maybeStoreTextOverflow(
              this.#payloadMaxBytes,
              storeOverflow,
              "reasoning",
              messageText(item),
              input.turnId,
              item.id
            );

            upsertTextItemRow(
              tx,
              "reasoning",
              input.runId,
              input.turnId,
              item.id,
              messageText(item),
              latestOverflowId,
              now,
              this.#previewMaxChars
            );
            break;
          }
          case "file_change": {
            tx.delete(codexFileChangesTable)
              .where(
                and(
                  eq(codexFileChangesTable.runId, input.runId),
                  eq(codexFileChangesTable.turnId, input.turnId),
                  eq(codexFileChangesTable.itemId, item.id)
                )
              )
              .run();

            if (item.changes.length > 0) {
              tx.insert(codexFileChangesTable)
                .values(
                  item.changes.map((change: FileChangeItem["changes"][number]) => ({
                    runId: input.runId,
                    turnId: input.turnId!,
                    itemId: item.id,
                    path: change.path,
                    changeKind: change.kind,
                    recordedAt: input.recordedAt,
                    insertedAt: now
                  }))
                )
                .run();
            }
            break;
          }
          case "web_search":
          case "todo_list":
          case "error":
            break;
        }

        upsertItem(item, latestOverflowId, latestPreview);
      };

      const refreshTurnRollups = (turnId: string) => {
        const latestEvent = tx
          .select({
            recordedAt: codexEventLogTable.recordedAt,
            eventType: codexEventLogTable.eventType
          })
          .from(codexEventLogTable)
          .where(
            and(
              eq(codexEventLogTable.runId, input.runId),
              eq(codexEventLogTable.turnId, turnId)
            )
          )
          .orderBy(desc(codexEventLogTable.sequence))
          .limit(1)
          .get();
        const latestAgentItem = tx
          .select({
            itemId: codexItemsTable.itemId,
            updatedAt: codexItemsTable.updatedAt
          })
          .from(codexItemsTable)
          .where(
            and(
              eq(codexItemsTable.runId, input.runId),
              eq(codexItemsTable.turnId, turnId),
              eq(codexItemsTable.itemType, "agent_message")
            )
          )
          .orderBy(desc(codexItemsTable.updatedAt))
          .limit(1)
          .get();
        const latestAgentMessage = latestAgentItem
          ? tx
              .select({
                textPreview: codexAgentMessagesTable.textPreview,
                textOverflowId: codexAgentMessagesTable.textOverflowId
              })
              .from(codexAgentMessagesTable)
              .where(
                and(
                  eq(codexAgentMessagesTable.runId, input.runId),
                  eq(codexAgentMessagesTable.turnId, turnId),
                  eq(codexAgentMessagesTable.itemId, latestAgentItem.itemId)
                )
              )
              .get()
          : null;

        tx.update(codexTurnsTable)
          .set({
            itemCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexItemsTable)
                .where(
                  and(
                    eq(codexItemsTable.runId, input.runId),
                    eq(codexItemsTable.turnId, turnId)
                  )
                )
                .get()
            ),
            commandCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexCommandExecutionsTable)
                .where(
                  and(
                    eq(codexCommandExecutionsTable.runId, input.runId),
                    eq(codexCommandExecutionsTable.turnId, turnId)
                  )
                )
                .get()
            ),
            toolCallCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexToolCallsTable)
                .where(
                  and(
                    eq(codexToolCallsTable.runId, input.runId),
                    eq(codexToolCallsTable.turnId, turnId)
                  )
                )
                .get()
            ),
            fileChangeCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexFileChangesTable)
                .where(
                  and(
                    eq(codexFileChangesTable.runId, input.runId),
                    eq(codexFileChangesTable.turnId, turnId)
                  )
                )
                .get()
            ),
            agentMessageCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexAgentMessagesTable)
                .where(
                  and(
                    eq(codexAgentMessagesTable.runId, input.runId),
                    eq(codexAgentMessagesTable.turnId, turnId)
                  )
                )
                .get()
            ),
            reasoningCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexReasoningTable)
                .where(
                  and(
                    eq(codexReasoningTable.runId, input.runId),
                    eq(codexReasoningTable.turnId, turnId)
                  )
                )
                .get()
            ),
            errorCount:
              countRows(
                tx
                  .select({ count: sql<number>`count(*)` })
                  .from(codexItemsTable)
                  .where(
                    and(
                      eq(codexItemsTable.runId, input.runId),
                      eq(codexItemsTable.turnId, turnId),
                      eq(codexItemsTable.itemType, "error")
                    )
                  )
                  .get()
              ) +
              countRows(
                tx
                  .select({ count: sql<number>`count(*)` })
                  .from(codexEventLogTable)
                  .where(
                    and(
                      eq(codexEventLogTable.runId, input.runId),
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
            updatedAt: now
          })
          .where(eq(codexTurnsTable.turnId, turnId))
          .run();
      };

      const refreshRunRollups = () => {
        const latestEvent = tx
          .select({
            recordedAt: codexEventLogTable.recordedAt,
            eventType: codexEventLogTable.eventType
          })
          .from(codexEventLogTable)
          .where(eq(codexEventLogTable.runId, input.runId))
          .orderBy(desc(codexEventLogTable.sequence))
          .limit(1)
          .get();
        const latestAgentItem = tx
          .select({
            turnId: codexItemsTable.turnId,
            itemId: codexItemsTable.itemId
          })
          .from(codexItemsTable)
          .where(
            and(
              eq(codexItemsTable.runId, input.runId),
              eq(codexItemsTable.itemType, "agent_message")
            )
          )
          .orderBy(desc(codexItemsTable.updatedAt))
          .limit(1)
          .get();
        const latestAgentMessage = latestAgentItem
          ? tx
              .select({
                textPreview: codexAgentMessagesTable.textPreview,
                textOverflowId: codexAgentMessagesTable.textOverflowId
              })
              .from(codexAgentMessagesTable)
              .where(
                and(
                  eq(codexAgentMessagesTable.runId, input.runId),
                  eq(codexAgentMessagesTable.turnId, latestAgentItem.turnId),
                  eq(codexAgentMessagesTable.itemId, latestAgentItem.itemId)
                )
              )
              .get()
          : null;
        const finalTurn = tx
          .select({
            turnId: codexTurnsTable.turnId
          })
          .from(codexTurnsTable)
          .where(
            and(
              eq(codexTurnsTable.runId, input.runId),
              sql`${codexTurnsTable.status} <> 'running'`
            )
          )
          .orderBy(desc(codexTurnsTable.updatedAt))
          .limit(1)
          .get();
        const usageTotals = tx
          .select({
            inputTokens: sql<number>`coalesce(sum(${codexTurnsTable.inputTokens}), 0)`,
            cachedInputTokens: sql<number>`coalesce(sum(${codexTurnsTable.cachedInputTokens}), 0)`,
            outputTokens: sql<number>`coalesce(sum(${codexTurnsTable.outputTokens}), 0)`
          })
          .from(codexTurnsTable)
          .where(eq(codexTurnsTable.runId, input.runId))
          .get();

        tx.update(codexRunsTable)
          .set({
            threadId:
              input.threadId ??
              extractThreadId(input.payload) ??
              tx
                .select({ threadId: codexRunsTable.threadId })
                .from(codexRunsTable)
                .where(eq(codexRunsTable.runId, input.runId))
                .get()?.threadId ??
              null,
            finalTurnId: finalTurn?.turnId ?? null,
            lastAgentMessageItemId: latestAgentItem?.itemId ?? null,
            lastAgentMessagePreview: latestAgentMessage?.textPreview ?? null,
            lastAgentMessageOverflowId: latestAgentMessage?.textOverflowId ?? null,
            inputTokens: usageTotals?.inputTokens ?? 0,
            cachedInputTokens: usageTotals?.cachedInputTokens ?? 0,
            outputTokens: usageTotals?.outputTokens ?? 0,
            turnCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexTurnsTable)
                .where(eq(codexTurnsTable.runId, input.runId))
                .get()
            ),
            itemCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexItemsTable)
                .where(eq(codexItemsTable.runId, input.runId))
                .get()
            ),
            commandCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexCommandExecutionsTable)
                .where(eq(codexCommandExecutionsTable.runId, input.runId))
                .get()
            ),
            toolCallCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexToolCallsTable)
                .where(eq(codexToolCallsTable.runId, input.runId))
                .get()
            ),
            fileChangeCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexFileChangesTable)
                .where(eq(codexFileChangesTable.runId, input.runId))
                .get()
            ),
            agentMessageCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexAgentMessagesTable)
                .where(eq(codexAgentMessagesTable.runId, input.runId))
                .get()
            ),
            reasoningCount: countRows(
              tx
                .select({ count: sql<number>`count(*)` })
                .from(codexReasoningTable)
                .where(eq(codexReasoningTable.runId, input.runId))
                .get()
            ),
            errorCount:
              countRows(
                tx
                  .select({ count: sql<number>`count(*)` })
                  .from(codexItemsTable)
                  .where(
                    and(
                      eq(codexItemsTable.runId, input.runId),
                      eq(codexItemsTable.itemType, "error")
                    )
                  )
                  .get()
              ) +
              countRows(
                tx
                  .select({ count: sql<number>`count(*)` })
                  .from(codexEventLogTable)
                  .where(
                    and(
                      eq(codexEventLogTable.runId, input.runId),
                      eq(codexEventLogTable.eventType, "error")
                    )
                  )
                  .get()
              ),
            latestEventAt: latestEvent?.recordedAt ?? null,
            latestEventType: latestEvent?.eventType ?? null,
            updatedAt: now
          })
          .where(eq(codexRunsTable.runId, input.runId))
          .run();
      };

      const run = ensureRunRecord();
      const resolvedThreadId =
        input.threadId ?? extractThreadId(input.payload) ?? run.threadId ?? null;

      if (resolvedThreadId && resolvedThreadId !== run.threadId) {
        tx.update(codexRunsTable)
          .set({
            threadId: resolvedThreadId,
            updatedAt: now
          })
          .where(eq(codexRunsTable.runId, input.runId))
          .run();
      }

      appendEventLogRow(resolvedThreadId);

      if (input.turnId) {
        if (input.payload.type === "turn.started") {
          upsertTurnRecord({
            turnId: input.turnId,
            threadId: resolvedThreadId,
            startedAt: input.recordedAt,
            status: "running"
          });
        } else if (input.payload.type === "turn.completed") {
          upsertTurnRecord({
            turnId: input.turnId,
            threadId: resolvedThreadId,
            endedAt: input.recordedAt,
            status: "completed",
            usage: input.payload.usage
          });
        } else if (input.payload.type === "turn.failed") {
          upsertTurnRecord({
            turnId: input.turnId,
            threadId: resolvedThreadId,
            endedAt: input.recordedAt,
            status: "failed",
            failureKind: "turn_failed",
            failureMessagePreview: previewText(
              input.payload.error.message,
              this.#previewMaxChars
            )
          });
        } else {
          upsertTurnRecord({
            turnId: input.turnId,
            threadId: resolvedThreadId
          });
        }
      }

      const itemEvent = extractItemEvent(input.payload);
      if (itemEvent) {
        projectThreadItem(itemEvent.item);
      }

      if (input.turnId) {
        refreshTurnRollups(input.turnId);
      }
      refreshRunRollups();
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
        threadId: input.threadId
      });
    }

    this.#db
      .update(codexRunsTable)
      .set({
        threadId: input.threadId ?? existing?.threadId ?? null,
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

function mapLegacyRunStatus(status: string): string {
  switch (status) {
    case "finished":
      return "completed";
    default:
      return status;
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
