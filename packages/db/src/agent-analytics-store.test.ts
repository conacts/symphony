import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { eq, or } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteAgentAnalyticsStore } from "./agent-analytics-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
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
  piEditsTable,
  piMessageEndsTable,
  piReadsTable,
  piWritesTable
} from "./schema.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("sqlite agent analytics store", () => {
  it("projects command execution lifecycle updates into item, command, turn, and run records", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-store-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 128
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-command",
        issueId: "issue-1",
        issueIdentifier: "COL-200",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-command",
        promptText: "Run the command",
        startedAt: "2026-04-03T20:37:39.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-1",
        issueIdentifier: "COL-200",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running",
        threadId: "thread-command"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-command",
        recordedAt: "2026-04-03T20:37:39.100Z",
        rawPayload: {
          type: "tool_execution_start",
          toolCallId: "cmd-1",
          toolName: "bash",
          args: {
            command: "pnpm test",
            timeout: 60
          }
        },
        payload: {
          type: "item.started",
          item: {
            id: "cmd-1",
            type: "command_execution",
            command: "pnpm test",
            aggregated_output: "",
            status: "in_progress"
          }
        }
      });
      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-command",
        recordedAt: "2026-04-03T20:37:39.200Z",
        payload: {
          type: "item.updated",
          item: {
            id: "cmd-1",
            type: "command_execution",
            command: "pnpm test",
            aggregated_output: "running tests",
            status: "in_progress"
          }
        }
      });
      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-command",
        recordedAt: "2026-04-03T20:37:39.500Z",
        payload: {
          type: "item.completed",
          item: {
            id: "cmd-1",
            type: "command_execution",
            command: "pnpm test",
            aggregated_output: "all tests passed",
            exit_code: 0,
            status: "completed"
          }
        }
      });
      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-command",
        recordedAt: "2026-04-03T20:37:39.700Z",
        payload: {
          type: "turn.completed",
          usage: {
            input_tokens: 15,
            cached_input_tokens: 3,
            output_tokens: 8
          }
        }
      });

      await analyticsStore.finalizeTurn({
        runId,
        turnId,
        endedAt: "2026-04-03T20:37:40.000Z",
        status: "completed",
        threadId: "thread-command",
        failureKind: null,
        failureMessagePreview: null
      });
      await analyticsStore.finalizeRun({
        runId,
        endedAt: "2026-04-03T20:37:41.000Z",
        status: "completed",
        threadId: "thread-command",
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null
      });

      const command = database.db
        .select()
        .from(symphonyAgentCommandExecutionsTable)
        .get();
      const item = database.db
        .select()
        .from(symphonyAgentItemsTable)
        .get();
      const turn = database.db
        .select()
        .from(symphonyAgentTurnsTable)
        .get();
      const run = database.db
        .select()
        .from(symphonyAgentRunsTable)
        .get();

      expect(command).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-1",
        command: "pnpm test",
        status: "completed",
        exitCode: 0,
        timeoutSeconds: 60,
        outputPreview: "all tests passed"
      });
      expect(command?.durationMs).toBe(400);
      expect(item).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-1",
        itemType: "command_execution",
        finalStatus: "completed",
        updateCount: 3,
        latestPreview: "all tests passed"
      });
      expect(item?.durationMs).toBe(400);
      expect(turn).toMatchObject({
        turnId,
        runId,
        status: "completed",
        inputTokens: 15,
        cachedInputTokens: 3,
        outputTokens: 8,
        itemCount: 1,
        commandCount: 1
      });
      expect(run).toMatchObject({
        runId,
        threadId: "thread-command",
        status: "completed",
        inputTokens: 15,
        cachedInputTokens: 3,
        outputTokens: 8,
        turnCount: 1,
        itemCount: 1,
        commandCount: 1
      });
    } finally {
      database.close();
    }
  });

  it("persists agent message and reasoning text with recordedAt and overflow boundaries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-message-reasoning-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 128
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-message-reasoning",
        issueId: "issue-4",
        issueIdentifier: "COL-204",
        startedAt: "2026-04-03T20:38:00.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-message-reasoning",
        promptText: "Write a response with reasoning",
        startedAt: "2026-04-03T20:38:01.000Z",
        status: "running"
      });

      const reasoningText = "B".repeat(420);
      const agentMessageText = "A".repeat(420);

      await analyticsStore.startRun({
        runId,
        issueId: "issue-4",
        issueIdentifier: "COL-204",
        startedAt: "2026-04-03T20:38:00.000Z",
        status: "running",
        threadId: "thread-message-reasoning"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-message-reasoning",
        recordedAt: "2026-04-03T20:38:01.200Z",
        rawPayload: {
          type: "message_end",
          message: {
            responseId: "assistant-42",
            api: "responses",
            provider: "openrouter",
            model: "xiaomi/mimo-v2-pro",
            stopReason: "tool_use",
            timestamp: 1775424832845,
            usage: {
              input: 12,
              cacheRead: 3,
              cacheWrite: 1,
              output: 8,
              totalTokens: 24
            }
          }
        },
        payload: {
          type: "item.completed",
          item: {
            id: "reasoning-1",
            type: "reasoning",
            text: reasoningText
          }
        }
      });
      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-message-reasoning",
        recordedAt: "2026-04-03T20:38:01.300Z",
        rawPayload: {
          type: "message_end",
          message: {
            responseId: "assistant-42",
            api: "responses",
            provider: "openrouter",
            model: "xiaomi/mimo-v2-pro",
            stopReason: "tool_use",
            timestamp: 1775424838851,
            usage: {
              input: 12,
              cacheRead: 3,
              cacheWrite: 1,
              output: 8,
              totalTokens: 24
            }
          }
        },
        payload: {
          type: "item.completed",
          item: {
            id: "message-1",
            type: "agent_message",
            text: agentMessageText
          }
        }
      });

      const reason = database.db
        .select()
        .from(symphonyAgentReasoningTable)
        .where(eq(symphonyAgentReasoningTable.itemId, "reasoning-1"))
        .get();
      const message = database.db
        .select()
        .from(symphonyAgentMessagesTable)
        .where(eq(symphonyAgentMessagesTable.itemId, "message-1"))
        .get();
      const overflowEntries = database.db
        .select()
        .from(symphonyAgentPayloadOverflowTable)
        .where(
          or(
            eq(symphonyAgentPayloadOverflowTable.id, reason?.textOverflowId ?? ""),
            eq(symphonyAgentPayloadOverflowTable.id, message?.textOverflowId ?? "")
          )
        )
        .all();
      const messageEndRows = database.db
        .select()
        .from(piMessageEndsTable)
        .where(eq(piMessageEndsTable.runId, runId))
        .all();

      expect(reason?.recordedAt).toBe("2026-04-03T20:38:01.200Z");
      expect(message?.recordedAt).toBe("2026-04-03T20:38:01.300Z");
      expect(reason?.textContent).toBeNull();
      expect(message?.textContent).toBeNull();
      expect(reason?.textOverflowId).toBeTypeOf("string");
      expect(message?.textOverflowId).toBeTypeOf("string");
      expect(reason?.textPreview).toBeDefined();
      expect(message?.textPreview).toBeDefined();
      expect(overflowEntries.length).toBe(2);
      expect(reason?.textOverflowId).not.toBe(message?.textOverflowId);
      expect(messageEndRows).toEqual([
        expect.objectContaining({
          runId,
          turnId,
          itemId: "reasoning-1",
          responseId: "assistant-42",
          api: "responses",
          provider: "openrouter",
          model: "xiaomi/mimo-v2-pro",
          stopReason: "tool_use",
          responseTimestamp: "2026-04-05T21:33:52.845Z",
          inputTokens: 12,
          cachedInputTokens: 3,
          cacheWriteTokens: 1,
          outputTokens: 8,
          totalTokens: 24
        }),
        expect.objectContaining({
          runId,
          turnId,
          itemId: "message-1",
          responseId: "assistant-42",
          api: "responses",
          provider: "openrouter",
          model: "xiaomi/mimo-v2-pro",
          stopReason: "tool_use",
          responseTimestamp: "2026-04-05T21:33:58.851Z",
          inputTokens: 12,
          cachedInputTokens: 3,
          cacheWriteTokens: 1,
          outputTokens: 8,
          totalTokens: 24
        })
      ]);
    } finally {
      database.close();
    }
  });

  it("keeps in-progress command items non-terminal until completion arrives", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-in-progress-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-in-progress",
        issueId: "issue-3",
        issueIdentifier: "COL-202",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-in-progress",
        promptText: "Run a long command",
        startedAt: "2026-04-03T20:37:39.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-3",
        issueIdentifier: "COL-202",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running",
        threadId: "thread-in-progress"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-in-progress",
        recordedAt: "2026-04-03T20:37:39.100Z",
        payload: {
          type: "item.started",
          item: {
            id: "cmd-2",
            type: "command_execution",
            command: "pnpm lint",
            aggregated_output: "",
            status: "in_progress"
          }
        }
      });
      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-in-progress",
        recordedAt: "2026-04-03T20:37:39.300Z",
        payload: {
          type: "item.updated",
          item: {
            id: "cmd-2",
            type: "command_execution",
            command: "pnpm lint",
            aggregated_output: "checking files",
            status: "in_progress"
          }
        }
      });

      const command = database.db
        .select()
        .from(symphonyAgentCommandExecutionsTable)
        .where(eq(symphonyAgentCommandExecutionsTable.itemId, "cmd-2"))
        .get();
      const item = database.db
        .select()
        .from(symphonyAgentItemsTable)
        .where(eq(symphonyAgentItemsTable.itemId, "cmd-2"))
        .get();
      const turn = database.db
        .select()
        .from(symphonyAgentTurnsTable)
        .where(eq(symphonyAgentTurnsTable.turnId, turnId))
        .get();

      expect(command).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-2",
        command: "pnpm lint",
        status: "in_progress",
        completedAt: null,
        durationMs: null,
        outputPreview: "checking files"
      });
      expect(item).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-2",
        itemType: "command_execution",
        finalStatus: "in_progress",
        completedAt: null,
        durationMs: null,
        updateCount: 2,
        latestPreview: "checking files"
      });
      expect(turn).toMatchObject({
        turnId,
        runId,
        status: "running",
        itemCount: 1,
        commandCount: 1
      });
    } finally {
      database.close();
    }
  });

  it("persists todo snapshots and native file change items into lifecycle and rollup records", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-pi-native-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-pi-native",
        issueId: "issue-9",
        issueIdentifier: "COL-909",
        startedAt: "2026-04-05T08:00:00.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-pi-native",
        promptText: "Apply the patch",
        startedAt: "2026-04-05T08:00:01.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-9",
        issueIdentifier: "COL-909",
        startedAt: "2026-04-05T08:00:00.000Z",
        status: "running",
        threadId: "thread-pi-native"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-pi-native",
        recordedAt: "2026-04-05T08:00:01.100Z",
        rawPayload: {
          type: "queue_update",
          steering: ["Keep the patch scoped"],
          followUp: ["Summarize the changes"]
        },
        payload: {
          type: "item.updated",
          item: {
            id: "pi-todo-queue",
            type: "todo_list",
            items: [
              {
                text: "[Steering] Keep the patch scoped",
                completed: false
              },
              {
                text: "[Follow-up] Summarize the changes",
                completed: false
              }
            ]
          }
        }
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-pi-native",
        recordedAt: "2026-04-05T08:00:01.200Z",
        payload: {
          type: "item.completed",
          item: {
            id: "pi-file-change:call-2",
            type: "file_change",
            changes: [
              {
                path: "apps/api/src/main.ts",
                kind: "update"
              }
            ],
            status: "completed"
          }
        }
      });

      const todoItem = database.db
        .select()
        .from(symphonyAgentItemsTable)
        .where(eq(symphonyAgentItemsTable.itemId, "pi-todo-queue"))
        .get();
      const taskSnapshot = database.db
        .select()
        .from(symphonyAgentTaskSnapshotsTable)
        .where(eq(symphonyAgentTaskSnapshotsTable.itemId, "pi-todo-queue"))
        .get();
      const fileChangeItem = database.db
        .select()
        .from(symphonyAgentItemsTable)
        .where(eq(symphonyAgentItemsTable.itemId, "pi-file-change:call-2"))
        .get();
      const taskSnapshotItems = taskSnapshot
        ? database.db
            .select()
            .from(symphonyAgentTaskSnapshotItemsTable)
            .where(eq(symphonyAgentTaskSnapshotItemsTable.snapshotId, taskSnapshot.snapshotId))
            .all()
        : [];
      const fileChange = database.db
        .select()
        .from(symphonyAgentFileChangesTable)
        .get();
      const turn = database.db
        .select()
        .from(symphonyAgentTurnsTable)
        .where(eq(symphonyAgentTurnsTable.turnId, turnId))
        .get();
      const run = database.db
        .select()
        .from(symphonyAgentRunsTable)
        .where(eq(symphonyAgentRunsTable.runId, runId))
        .get();

      expect(todoItem).toMatchObject({
        runId,
        turnId,
        itemId: "pi-todo-queue",
        itemType: "todo_list",
        finalStatus: "in_progress",
        latestPreview:
          "[ ] [Steering] Keep the patch scoped; [ ] [Follow-up] Summarize the changes"
      });
      expect(taskSnapshot).toMatchObject({
        runId,
        turnId,
        itemId: "pi-todo-queue",
        sourceKind: "pi_queue_update",
        recordedAt: "2026-04-05T08:00:01.100Z"
      });
      expect(taskSnapshotItems).toEqual([
        expect.objectContaining({
          position: 0,
          label: "Keep the patch scoped",
          section: "steering",
          state: "pending"
        }),
        expect.objectContaining({
          position: 1,
          label: "Summarize the changes",
          section: "follow_up",
          state: "pending"
        })
      ]);
      expect(fileChangeItem).toMatchObject({
        runId,
        turnId,
        itemId: "pi-file-change:call-2",
        itemType: "file_change",
        finalStatus: "completed",
        latestPreview: "apps/api/src/main.ts"
      });
      expect(fileChange).toMatchObject({
        runId,
        turnId,
        itemId: "pi-file-change:call-2",
        path: "apps/api/src/main.ts",
        changeKind: "update"
      });
      expect(turn).toMatchObject({
        turnId,
        itemCount: 2,
        fileChangeCount: 1
      });
      expect(run).toMatchObject({
        runId,
        itemCount: 2,
        fileChangeCount: 1
      });
    } finally {
      database.close();
    }
  });

  it("surfaces structured pi tool rows through persisted analytics artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-pi-structured-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-pi-structured",
        issueId: "issue-10",
        issueIdentifier: "COL-910",
        startedAt: "2026-04-05T08:00:00.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-pi-structured",
        promptText: "Inspect and patch the file",
        startedAt: "2026-04-05T08:00:01.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-10",
        issueIdentifier: "COL-910",
        startedAt: "2026-04-05T08:00:00.000Z",
        status: "running",
        threadId: "thread-pi-structured"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-pi-structured",
        recordedAt: "2026-04-05T08:00:02.000Z",
        rawPayload: null,
        payload: {
          type: "item.completed",
          item: {
            id: "tool-read-1",
            type: "mcp_tool_call",
            server: "pi",
            tool: "read",
            arguments: {
              path: "src/index.ts",
              offset: 10,
              limit: 25
            },
            result: {
              content: [
                {
                  type: "text",
                  text: "const x = 1;"
                }
              ],
              structured_content: null
            },
            status: "completed"
          }
        }
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-pi-structured",
        recordedAt: "2026-04-05T08:00:03.000Z",
        rawPayload: {
          type: "tool_execution_end",
          toolCallId: "tool-edit-1",
          toolName: "edit",
          result: {
            content: [
              {
                type: "text",
                text: "Successfully replaced 1 block in src/index.ts."
              }
            ],
            details: {
              diff: "@@ -1 +1 @@\n-const x = 1;\n+const x = 2;",
              firstChangedLine: 1
            }
          },
          isError: false
        },
        payload: {
          type: "item.completed",
          item: {
            id: "tool-edit-1",
            type: "mcp_tool_call",
            server: "pi",
            tool: "edit",
            arguments: {
              path: "src/index.ts",
              edits: [
                {
                  oldText: "const x = 1;",
                  newText: "const x = 2;"
                }
              ]
            },
            result: {
              content: [
                {
                  type: "text",
                  text: "Successfully replaced 1 block in src/index.ts."
                }
              ],
              structured_content: null
            },
            status: "completed"
          }
        }
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-pi-structured",
        recordedAt: "2026-04-05T08:00:04.000Z",
        rawPayload: {
          type: "tool_execution_end",
          toolCallId: "tool-write-1",
          toolName: "write",
          result: {
            content: [
              {
                type: "text",
                text: "Successfully wrote 24 bytes to src/out.ts"
              }
            ]
          },
          isError: false
        },
        payload: {
          type: "item.completed",
          item: {
            id: "tool-write-1",
            type: "mcp_tool_call",
            server: "pi",
            tool: "write",
            arguments: {
              path: "src/out.ts",
              content: "export const x = 2;\n"
            },
            result: {
              content: [
                {
                  type: "text",
                  text: "Successfully wrote 24 bytes to src/out.ts"
                }
              ],
              structured_content: null
            },
            status: "completed"
          }
        }
      });

      const piReadRow = database.db.select().from(piReadsTable).get();
      const piEditRow = database.db.select().from(piEditsTable).get();
      const piWriteRow = database.db.select().from(piWritesTable).get();
      const artifacts = await readStore.fetchRunArtifacts(runId);
      const readTool = artifacts?.toolCalls.find((entry) => entry.itemId === "tool-read-1");
      const editTool = artifacts?.toolCalls.find((entry) => entry.itemId === "tool-edit-1");
      const writeTool = artifacts?.toolCalls.find((entry) => entry.itemId === "tool-write-1");

      expect(piReadRow).toMatchObject({
        runId,
        turnId,
        itemId: "tool-read-1",
        path: "src/index.ts",
        readOffset: 10,
        readLimit: 25
      });
      expect(piEditRow).toMatchObject({
        runId,
        turnId,
        itemId: "tool-edit-1",
        path: "src/index.ts",
        editCount: 1,
        lineCount: 1,
        firstChangedLine: 1,
        diffPreview: "@@ -1 +1 @@ -const x = 1; +const x = 2;"
      });
      expect(piWriteRow).toMatchObject({
        runId,
        turnId,
        itemId: "tool-write-1",
        path: "src/out.ts",
        lineCount: 2,
        contentBytes: 20,
        bytesWritten: 24
      });
      expect(readTool).toMatchObject({
        piRead: {
          path: "src/index.ts",
          offset: 10,
          limit: 25
        }
      });
      expect(editTool).toMatchObject({
        piEdit: {
          path: "src/index.ts",
          editCount: 1,
          lineCount: 1,
          firstChangedLine: 1,
          diffPreview: "@@ -1 +1 @@ -const x = 1; +const x = 2;",
          diffOverflowId: null,
          edits: [
            {
              oldText: "const x = 1;",
              newText: "const x = 2;"
            }
          ]
        }
      });
      expect(writeTool).toMatchObject({
        piWrite: {
          path: "src/out.ts",
          lineCount: 2,
          contentBytes: 20,
          bytesWritten: 24
        }
      });
    } finally {
      database.close();
    }
  });

  it("preserves the original shell command when completion falls back to bash", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-bash-merge-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-bash-merge",
        issueId: "issue-merge",
        issueIdentifier: "COL-299",
        startedAt: "2026-04-05T00:00:00.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-bash-merge",
        promptText: "List files",
        startedAt: "2026-04-05T00:00:01.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-merge",
        issueIdentifier: "COL-299",
        startedAt: "2026-04-05T00:00:00.000Z",
        status: "running",
        threadId: "thread-bash-merge"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-bash-merge",
        recordedAt: "2026-04-05T00:00:01.100Z",
        payload: {
          type: "item.started",
          item: {
            id: "cmd-bash-merge",
            type: "command_execution",
            command: "ls /workspace",
            aggregated_output: "",
            status: "in_progress"
          }
        }
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-bash-merge",
        recordedAt: "2026-04-05T00:00:01.200Z",
        payload: {
          type: "item.completed",
          item: {
            id: "cmd-bash-merge",
            type: "command_execution",
            command: "bash",
            aggregated_output: "apps\npackages\n",
            status: "completed"
          }
        }
      });

      const command = database.db
        .select()
        .from(symphonyAgentCommandExecutionsTable)
        .where(eq(symphonyAgentCommandExecutionsTable.itemId, "cmd-bash-merge"))
        .get();

      expect(command).toMatchObject({
        itemId: "cmd-bash-merge",
        command: "ls /workspace",
        status: "completed",
        outputPreview: "apps packages"
      });
    } finally {
      database.close();
    }
  });

  it("projects failed MCP tool calls with explicit failure metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-tool-failure-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-tool-failure",
        issueId: "issue-4",
        issueIdentifier: "COL-203",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-tool-failure",
        promptText: "Call a failing tool",
        startedAt: "2026-04-03T20:37:39.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-4",
        issueIdentifier: "COL-203",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running",
        threadId: "thread-tool-failure"
      });

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-tool-failure",
        recordedAt: "2026-04-03T20:37:39.500Z",
        payload: {
          type: "item.completed",
          item: {
            id: "tool-2",
            type: "mcp_tool_call",
            server: "linear",
            tool: "get_issue",
            arguments: {
              issueId: "COL-203"
            },
            error: {
              message: "Permission denied"
            },
            status: "failed"
          }
        }
      });

      const toolCall = database.db
        .select()
        .from(symphonyAgentToolCallsTable)
        .where(eq(symphonyAgentToolCallsTable.itemId, "tool-2"))
        .get();
      const item = database.db
        .select()
        .from(symphonyAgentItemsTable)
        .where(eq(symphonyAgentItemsTable.itemId, "tool-2"))
        .get();
      const turn = database.db
        .select()
        .from(symphonyAgentTurnsTable)
        .where(eq(symphonyAgentTurnsTable.turnId, turnId))
        .get();

      expect(toolCall).toMatchObject({
        runId,
        turnId,
        itemId: "tool-2",
        server: "linear",
        tool: "get_issue",
        status: "failed",
        errorMessage: "Permission denied",
        resultPreview: null,
        completedAt: "2026-04-03T20:37:39.500Z"
      });
      expect(toolCall?.durationMs).toBe(0);
      expect(item).toMatchObject({
        runId,
        turnId,
        itemId: "tool-2",
        itemType: "mcp_tool_call",
        finalStatus: "failed",
        durationMs: 0
      });
      expect(turn).toMatchObject({
        turnId,
        runId,
        status: "running",
        itemCount: 1,
        toolCallCount: 1
      });
    } finally {
      database.close();
    }
  });

  it("stores oversized tool results in overflow while keeping the canonical event payload readable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-overflow-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 96
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-tool",
        issueId: "issue-2",
        issueIdentifier: "COL-201",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-tool",
        promptText: "Call the MCP tool",
        startedAt: "2026-04-03T20:37:39.000Z",
        status: "running"
      });

      await analyticsStore.startRun({
        runId,
        issueId: "issue-2",
        issueIdentifier: "COL-201",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running",
        threadId: "thread-tool"
      });

      const largeText = "B".repeat(300);

      await analyticsStore.recordEvent({
        runId,
        turnId,
        threadId: "thread-tool",
        recordedAt: "2026-04-03T20:37:39.100Z",
        rawPayload: {
          source: "opencode",
          item: "tool-1"
        },
        projectionLosses: [
          {
            kind: "command_output_unavailable",
            command: "linear research"
          }
        ],
        payload: {
          type: "item.completed",
          item: {
            id: "tool-1",
            type: "mcp_tool_call",
            server: "linear",
            tool: "research",
            arguments: {
              query: "Find issues"
            },
            result: {
              content: [
                {
                  type: "text",
                  text: largeText
                }
              ],
              structured_content: null
            },
            status: "completed"
          }
        }
      });

      const toolCall = database.db
        .select()
        .from(symphonyAgentToolCallsTable)
        .get();
      const eventLogRow = database.db
        .select()
        .from(symphonyAgentEventLogTable)
        .get();
      const overflowRows = database.db
        .select()
        .from(symphonyAgentPayloadOverflowTable)
        .all();
      const artifacts = await readStore.fetchRunArtifacts(runId);

      expect(toolCall?.resultOverflowId).not.toBeNull();
      expect(eventLogRow?.payloadJson).toBeNull();
      expect(eventLogRow?.payloadOverflowId).not.toBeNull();
      expect(eventLogRow?.rawPayloadOverflowId).not.toBeNull();
      expect(eventLogRow?.projectionLossOverflowId).not.toBeNull();
      expect(overflowRows.map((row) => row.kind).sort()).toEqual([
        "event_payload",
        "projection_losses",
        "raw_harness_payload",
        "tool_result"
      ]);
      expect(artifacts?.events[0]?.payload).toEqual({
        type: "item.completed",
        item: {
          id: "tool-1",
          type: "mcp_tool_call",
          server: "linear",
          tool: "research",
          arguments: {
            query: "Find issues"
          },
          result: {
            content: [
              {
                type: "text",
                text: largeText
              }
            ],
            structured_content: null
          },
          status: "completed"
        }
      });
      expect(artifacts?.events[0]?.projectionLossOverflowId).toBe(
        eventLogRow?.projectionLossOverflowId ?? null
      );
      expect(artifacts?.events[0]?.rawPayloadOverflowId).toBe(
        eventLogRow?.rawPayloadOverflowId ?? null
      );
    } finally {
      database.close();
    }
  });
});
