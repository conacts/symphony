import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueDeliveryReportStore } from "./issue-delivery-reports.js";
import { createSqliteRuntimeForensicsReadStore } from "./runtime-forensics-read-store.js";
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

describe("runtime forensics read store", () => {
  it("builds run detail from runtime-owned tables without analytics projections", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-forensics-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });
    const deliveryStore = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const readStore = createSqliteRuntimeForensicsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-runtime-1",
        repositoryKey: testRepositoryKey,
        issueId: "issue-runtime-1",
        issueIdentifier: "COL-410",
        runMode: "implementation",
        status: "running",
        workspacePath: "/tmp/COL-410",
        startedAt: "2026-04-09T03:00:00.000Z"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-runtime-1",
        promptText: "Implement the requested change.",
        status: "running",
        threadId: "thread-runtime-1",
        startedAt: "2026-04-09T03:00:01.000Z"
      });
      await runStore.recordEvent(runId, turnId, {
        eventType: "session.started",
        recordedAt: "2026-04-09T03:00:02.000Z",
        threadId: "thread-runtime-1",
        payload: {
          type: "session.started",
          session_id: "thread-runtime-1",
          thread_id: "thread-runtime-1",
          turn_id: turnId,
          agent_app_server_pid: "4242",
          model: "gpt-5.4",
          reasoning_effort: "high"
        },
        summary: "Runtime session started."
      });
      await runStore.recordEvent(runId, turnId, {
        eventType: "item.completed",
        recordedAt: "2026-04-09T03:00:03.000Z",
        threadId: "thread-runtime-1",
        payload: {
          type: "item.completed",
          item: {
            id: "item-runtime-1",
            type: "agent_message",
            text: "Implemented the change."
          }
        },
        summary: "agent_message completed."
      });
      await runStore.finalizeTurn(turnId, {
        status: "completed",
        endedAt: "2026-04-09T03:00:04.000Z",
        threadId: "thread-runtime-1",
        usage: {
          input_tokens: 40,
          cached_input_tokens: 10,
          output_tokens: 20
        }
      });
      await runStore.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-04-09T03:00:05.000Z"
      });
      await deliveryStore.record({
        issueId: "issue-runtime-1",
        issueIdentifier: "COL-410",
        runId,
        status: "completed",
        summary: "Opened the PR.",
        prUrl: "https://github.com/example/repo/pull/410",
        reportedAt: "2026-04-09T03:00:06.000Z"
      });
      await runStore.upsertRunContext(runId, {
        harnessKind: "pi",
        threadId: "thread-runtime-1",
        processId: "4242",
        model: "gpt-5.4",
        reasoningEffort: "high",
        profile: null,
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        providerEnvKey: "OPENROUTER_API_KEY",
        launchTarget: null
      });

      const [summary] = await readStore.listRuns({
        issueIdentifier: "COL-410"
      });
      const detail = await readStore.fetchRunDetail(runId);

      expect(summary).toMatchObject({
        runId,
        issueIdentifier: "COL-410",
        eventCount: 2,
        turnCount: 1,
        agentHarness: "pi",
        agentStatus: "completed",
        model: "gpt-5.4",
        cachedInputTokens: 10,
        deliveryStatus: "completed"
      });
      expect(detail?.run).toMatchObject({
        runId,
        threadId: "thread-runtime-1",
        processId: "4242",
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        eventCount: 2
      });
      expect(detail?.turns).toHaveLength(1);
      expect(detail?.turns[0]?.events.map((event) => event.eventType)).toEqual([
        "session.started",
        "item.completed"
      ]);
      expect(detail?.issue.deliveredRunCount).toBe(1);
    } finally {
      database.close();
    }
  });
});
