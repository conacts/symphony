import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteAgentAnalyticsStore } from "./agent-analytics-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";

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

describe("sqlite agent analytics read store", () => {
  it("builds run summaries, detail, and artifacts from runtime authority plus artifact tables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 64
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-agent",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-1",
        issueIdentifier: "COL-157",
        runMode: "implementation",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running",
        workerHost: "worker-1",
        workspacePath: "/tmp/workspaces/COL-157"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-1",
        turnSequence: 1,
        promptText: "Inspect the workspace",
        status: "running",
        startedAt: "2026-04-03T20:37:39.000Z",
        threadId: "thread-1",
        agentTurnId: "provider-turn-1"
      });

      await runStore.upsertRunContext(runId, {
        harnessKind: "pi",
        threadId: "thread-1",
        processId: "pi-process-123",
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: "mimo-v2-pro",
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        providerEnvKey: "OPENROUTER_API_KEY",
        launchTarget: null
      });

      const longMessage = "A".repeat(400);

      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-1",
        recordedAt: "2026-04-03T20:37:39.100Z",
        payload: {
          type: "thread.started",
          thread_id: "thread-1"
        }
      });
      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-1",
        recordedAt: "2026-04-03T20:37:39.200Z",
        rawPayload: {
          type: "message_end",
          message: {
            responseId: "assistant-1",
            api: "responses",
            provider: "openrouter",
            model: "xiaomi/mimo-v2-pro",
            stopReason: "tool_use",
            timestamp: 1775424832845,
            usage: {
              input: 11,
              cacheRead: 2,
              cacheWrite: 1,
              output: 7,
              totalTokens: 21
            },
            role: "assistant",
            content: [
              {
                type: "text",
                text: longMessage
              }
            ]
          }
        },
        payload: {
          type: "item.completed",
          item: {
            id: "item-1",
            type: "agent_message",
            text: longMessage
          }
        }
      });
      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-1",
        recordedAt: "2026-04-03T20:37:39.300Z",
        payload: {
          type: "turn.completed",
          usage: {
            input_tokens: 11,
            cached_input_tokens: 2,
            output_tokens: 7
          }
        }
      });

      await runStore.finalizeTurn(turnId, {
        status: "completed",
        endedAt: "2026-04-03T20:37:40.000Z",
        threadId: "thread-1",
        agentTurnId: "provider-turn-1",
        usage: {
          input_tokens: 11,
          cached_input_tokens: 2,
          output_tokens: 7
        }
      });
      await runStore.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-04-03T20:37:41.000Z"
      });

      const [run] = await readStore.listRuns({
        limit: 10
      });
      const issueRuns = await readStore.listRunsForIssue("COL-157", {
        limit: 10
      });
      const problemRuns = await readStore.listProblemRuns({
        limit: 10
      });
      const detail = await readStore.fetchRunDetail(runId);
      const artifacts = await readStore.fetchRunArtifacts(runId);
      const turns = await readStore.listTurns(runId);

      expect(run).toMatchObject({
        runId,
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-1",
        issueIdentifier: "COL-157",
        status: "finished",
        outcome: "completed",
        agentHarness: "pi",
        agentStatus: "completed",
        model: "xiaomi/mimo-v2-pro"
      });
      expect(issueRuns).toHaveLength(1);
      expect(problemRuns).toHaveLength(0);
      expect(detail?.run).toMatchObject({
        runId,
        threadId: "thread-1",
        processId: "pi-process-123",
        providerId: "openrouter",
        providerName: "OpenRouter",
        eventCount: 3,
        turnCount: 1
      });
      expect(detail?.turns).toEqual([
        expect.objectContaining({
          turnId,
          threadId: "thread-1",
          agentTurnId: "provider-turn-1",
          status: "completed"
        })
      ]);
      expect(artifacts?.run).toMatchObject({
        runId,
        threadId: "thread-1",
        status: "completed"
      });
      expect(artifacts?.agentMessages).toEqual([
        expect.objectContaining({
          itemId: "item-1"
        })
      ]);
      expect(turns).toEqual([
        expect.objectContaining({
          turnId,
          threadId: "thread-1",
          status: "completed"
        })
      ]);
    } finally {
      database.close();
    }
  });

  it("returns empty artifact collections for an existing runtime run with no analytics projections", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-empty-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-empty",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-empty",
        issueIdentifier: "COL-201",
        runMode: "implementation",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-empty",
        turnSequence: 1,
        promptText: "Wait for work.",
        status: "running",
        startedAt: "2026-04-03T20:37:39.000Z",
        threadId: "thread-empty"
      });
      await runStore.upsertRunContext(runId, {
        harnessKind: "pi",
        threadId: "thread-empty",
        processId: "999",
        model: "gpt-test",
        reasoningEffort: null,
        profile: null,
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        providerEnvKey: "OPENROUTER_API_KEY",
        launchTarget: null
      });
      await runStore.finalizeTurn(turnId, {
        status: "stopped",
        endedAt: "2026-04-03T20:38:39.000Z",
        threadId: "thread-empty"
      });
      await runStore.finalizeRun(runId, {
        status: "paused",
        outcome: "runtime_shutdown",
        endedAt: "2026-04-03T20:39:39.000Z",
        errorClass: "runtime_shutdown",
        errorMessage: "runtime stopped"
      });

      const artifacts = await readStore.fetchRunArtifacts(runId);

      expect(artifacts?.run).toMatchObject({
        runId,
        threadId: "thread-empty",
        failureKind: "runtime_shutdown",
        failureMessagePreview: "runtime stopped"
      });
      expect(artifacts?.turns).toEqual([
        expect.objectContaining({
          turnId: "turn-empty",
          status: "stopped"
        })
      ]);
      expect(artifacts?.items).toEqual([]);
      expect(artifacts?.events).toEqual([]);
      expect(artifacts?.toolCalls).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("fails fast when a runtime run loses its canonical issue row", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-invalid-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      await runStore.recordRunStarted({
        runId: "run-invalid",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-invalid",
        issueIdentifier: "COL-999",
        runMode: "implementation",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running"
      });

      database.client.pragma("foreign_keys = OFF");
      database.client.prepare(`
        delete from symphony_issues
        where issue_identifier = ?
      `).run("COL-999");
      database.client.pragma("foreign_keys = ON");

      await expect(readStore.listRuns()).rejects.toThrow(
        "Run run-invalid is missing canonical issue COL-999."
      );
    } finally {
      database.close();
    }
  });
});
