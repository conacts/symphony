import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSqliteCodexAnalyticsReadStore } from "./codex-analytics-read-store.js";
import { createSqliteCodexAnalyticsStore } from "./codex-analytics-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import {
  codexCommandExecutionsTable,
  codexEventLogTable,
  codexItemsTable,
  codexPayloadOverflowTable,
  codexRunsTable,
  codexToolCallsTable,
  codexTurnsTable
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

describe("sqlite codex analytics store", () => {
  it("projects command execution lifecycle updates into item, command, turn, and run records", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-store-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteCodexAnalyticsStore({
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
        .from(codexCommandExecutionsTable)
        .get();
      const item = database.db
        .select()
        .from(codexItemsTable)
        .get();
      const turn = database.db
        .select()
        .from(codexTurnsTable)
        .get();
      const run = database.db
        .select()
        .from(codexRunsTable)
        .get();

      expect(command).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-1",
        command: "pnpm test",
        status: "completed",
        exitCode: 0,
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

  it("keeps in-progress command items non-terminal until completion arrives", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-in-progress-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteCodexAnalyticsStore({
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
        .from(codexCommandExecutionsTable)
        .where(eq(codexCommandExecutionsTable.itemId, "cmd-2"))
        .get();
      const item = database.db
        .select()
        .from(codexItemsTable)
        .where(eq(codexItemsTable.itemId, "cmd-2"))
        .get();
      const turn = database.db
        .select()
        .from(codexTurnsTable)
        .where(eq(codexTurnsTable.turnId, turnId))
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

  it("projects failed MCP tool calls with explicit failure metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-tool-failure-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteCodexAnalyticsStore({
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
        .from(codexToolCallsTable)
        .where(eq(codexToolCallsTable.itemId, "tool-2"))
        .get();
      const item = database.db
        .select()
        .from(codexItemsTable)
        .where(eq(codexItemsTable.itemId, "tool-2"))
        .get();
      const turn = database.db
        .select()
        .from(codexTurnsTable)
        .where(eq(codexTurnsTable.turnId, turnId))
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
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-overflow-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analyticsStore = createSqliteCodexAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 96
    });
    const readStore = createSqliteCodexAnalyticsReadStore({
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
        .from(codexToolCallsTable)
        .get();
      const eventLogRow = database.db
        .select()
        .from(codexEventLogTable)
        .get();
      const overflowRows = database.db
        .select()
        .from(codexPayloadOverflowTable)
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
