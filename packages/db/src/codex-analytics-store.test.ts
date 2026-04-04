import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
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
      expect(overflowRows.map((row) => row.kind).sort()).toEqual([
        "event_payload",
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
    } finally {
      database.close();
    }
  });
});
