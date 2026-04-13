import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteAgentAnalyticsStore } from "./agent-analytics-store.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import type { SymphonyRuntimeRunStartAttrs } from "./runtime-run-types.js";
import {
  symphonyAgentCommandExecutionsTable,
  symphonyAgentEventLogTable,
  symphonyAgentItemsTable
} from "./schema.js";

const tempDirectories: string[] = [];
const testRepositoryKey = "openai/symphony";

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

async function recordSeededRunStarted(
  db: ReturnType<typeof initializeSymphonyDb>["db"],
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>,
  attrs: SymphonyRuntimeRunStartAttrs
): Promise<string> {
  const issueStore = createSymphonyIssueStore(db);
  await issueStore.upsert({
    trackerIssueKey: attrs.issueIdentifier,
    trackerIssueId: attrs.trackerIssueId,
    repositoryKey: attrs.repositoryKey,
    latestRunStartedAt: null,
    recordedAt: new Date(attrs.startedAt).toISOString()
  });

  return await runStore.recordRunStarted(attrs);
}

describe("sqlite agent analytics store", () => {
  it("fails fast when the runtime run does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-store-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });

    try {
      await expect(
        analyticsStore.recordEvent({
          runId: "missing-run",
          turnId: "turn-1",
          threadId: "thread-1",
          recordedAt: "2026-04-09T12:00:00.000Z",
          payload: {
            type: "thread.started",
            thread_id: "thread-1"
          }
        })
      ).rejects.toThrow("Agent analytics run not found: missing-run");
    } finally {
      database.close();
    }
  });

  it("projects artifact rows from runtime-owned parents without shadow lifecycle tables", async () => {
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
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await recordSeededRunStarted(database.db, runStore, {
        runId: "run-command",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-1",
        issueIdentifier: "COL-200",
        runMode: "implementation",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-command",
        turnSequence: 1,
        promptText: "Run the command",
        threadId: "thread-command",
        startedAt: "2026-04-03T20:37:39.000Z",
        status: "running"
      });

      await runStore.upsertRunContext(runId, {
        harnessKind: "pi",
        threadId: "thread-command",
        processId: "4242",
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: "mimo-v2-pro",
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        providerEnvKey: "OPENROUTER_API_KEY",
        launchTarget: null
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
      await analyticsStore.recordCommandResourceProfile({
        runId,
        turnId,
        itemId: "cmd-1",
        resourceProfile: {
          captureScope: "session_process_tree",
          samplingIntervalMs: 1000,
          firstSampledAt: "2026-04-03T20:37:39.200Z",
          lastSampledAt: "2026-04-03T20:37:40.200Z",
          sampleCount: 2,
          peakCpuPercent: 187.4,
          peakMemPercent: 2.8,
          peakRssKb: 412_000,
          peakProcessCount: 4,
          topProcesses: [
            {
              command: "pnpm test",
              executable: "node",
              peakCpuPercent: 187.4,
              peakMemPercent: 2.8,
              peakRssKb: 412_000,
              sampleCount: 2
            }
          ],
          samples: []
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

      await runStore.finalizeTurn(turnId, {
        status: "completed",
        endedAt: "2026-04-03T20:37:40.000Z",
        threadId: "thread-command",
        usage: {
          input_tokens: 15,
          cached_input_tokens: 3,
          output_tokens: 8
        }
      });
      await runStore.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-04-03T20:37:41.000Z"
      });

      const item = database.db.select().from(symphonyAgentItemsTable).get();
      const command = database.db.select().from(symphonyAgentCommandExecutionsTable).get();
      const eventRows = database.db.select().from(symphonyAgentEventLogTable).all();
      const artifacts = await readStore.fetchRunArtifacts(runId);

      expect(item).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-1",
        finalStatus: "completed"
      });
      expect(command).toMatchObject({
        runId,
        turnId,
        itemId: "cmd-1",
        status: "completed"
      });
      expect(command?.resourceProfileJson).toMatchObject({
        peakCpuPercent: 187.4,
        peakMemPercent: 2.8
      });
      expect(eventRows).toHaveLength(3);
      expect(artifacts?.run).toMatchObject({
        runId,
        threadId: "thread-command",
        status: "completed",
        turnCount: 1
      });
      expect(artifacts?.turns).toEqual([
        expect.objectContaining({
          turnId,
          threadId: "thread-command",
          status: "completed",
          inputTokens: 15,
          cachedInputTokens: 3,
          outputTokens: 8
        })
      ]);
      expect(artifacts?.commandExecutions).toEqual([
        expect.objectContaining({
          itemId: "cmd-1",
          status: "completed",
          resourceProfile: expect.objectContaining({
            peakCpuPercent: 187.4,
            peakMemPercent: 2.8
          })
        })
      ]);
    } finally {
      database.close();
    }
  });
});
