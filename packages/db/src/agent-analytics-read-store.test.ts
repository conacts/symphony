import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSymphonyRuntimeLogStore } from "./runtime-logs.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteAgentAnalyticsStore } from "./agent-analytics-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import { createSqliteSymphonyRunJournal } from "./sqlite-symphony-run-journal.js";

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

describe("sqlite agent analytics read store", () => {
  it("returns contract-native run detail and agent projection artifacts from analytics tables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 64
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });
    const runtimeLogs = createSymphonyRuntimeLogStore(database.db);

    try {
      const runId = await runJournal.recordRunStarted({
        runId: "run-agent",
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running",
        workerHost: "worker-1",
        workspacePath: "/tmp/workspaces/COL-157",
        metadata: {
          source: "runtime"
        }
      });
      await analytics.startRun({
        runId,
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running",
        threadId: "thread-1"
      });

      const turnId = await runJournal.recordTurnStarted(runId, {
        turnId: "turn-1",
        turnSequence: 1,
        promptText: "Inspect the workspace",
        status: "running",
        startedAt: "2026-04-03T20:37:39.000Z",
        threadId: "thread-1",
        agentTurnId: "turn-1"
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
        rawPayload: {
          source: "opencode",
          responseId: "assistant-1"
        },
        projectionLosses: [
          {
            kind: "reasoning_tokens_folded_into_output",
            messageId: "assistant-1",
            reasoningTokens: 2
          }
        ],
        payload: {
          type: "turn.completed",
          usage: {
            input_tokens: 11,
            cached_input_tokens: 2,
            output_tokens: 7
          }
        }
      });

      await analytics.finalizeTurn({
        runId,
        turnId,
        endedAt: "2026-04-03T20:37:40.000Z",
        status: "completed",
        threadId: "thread-1",
        failureKind: null,
        failureMessagePreview: null
      });
      await analytics.finalizeRun({
        runId,
        endedAt: "2026-04-03T20:37:41.000Z",
        status: "completed",
        threadId: "thread-1",
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null
      });
      await runtimeLogs.record({
        level: "info",
        source: "agent_runtime",
        eventType: "runtime_session_started",
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        runId,
        message: "Started the agent harness session.",
        payload: {
          processId: "pi-process-123",
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "high",
          profile: "mimo-v2-pro",
          providerId: "openrouter",
          providerName: "OpenRouter",
          authMode: "api_key_env",
          providerEnvKey: "OPENROUTER_API_KEY",
          launchTarget: {
            kind: "container",
            hostLaunchPath: "/tmp/workspaces/col-157",
            hostWorkspacePath: "/tmp/workspaces/col-157",
            runtimeWorkspacePath: "/workspace",
            containerId: "container-157",
            containerName: "symphony-col-157",
            shell: "sh"
          }
        }
      });
      await runJournal.finalizeTurn(turnId, {
        status: "completed",
        endedAt: "2026-04-03T20:37:40.000Z",
        threadId: "thread-1",
        agentTurnId: "turn-1"
      });
      await runJournal.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-04-03T20:37:41.000Z"
      });

      const runs = await readStore.listRuns({
        limit: 10
      });
      const issueRuns = await readStore.listRunsForIssue("COL-157", {
        limit: 10
      });
      const problemRuns = await readStore.listProblemRuns({
        limit: 10
      });
      const runDetail = await readStore.fetchRunDetail(runId);
      const artifacts = await readStore.fetchRunArtifacts(runId);
      const turns = await readStore.listTurns(runId);
      const items = await readStore.listItems({
        runId
      });
      const agentMessages = await readStore.listAgentMessages({
        runId,
        turnId
      });
      const commands = await readStore.listCommandExecutions({
        runId
      });
      const tools = await readStore.listToolCalls({
        runId
      });
      const reasoning = await readStore.listReasoning({
        runId
      });
      const fileChanges = await readStore.listFileChanges({
        runId
      });
      const agentMessageOverflow = await readStore.fetchOverflow(
        runId,
        agentMessages[0]?.textOverflowId ?? "missing"
      );
      const turnCompletedEvent = artifacts?.events.find(
        (event) => event.eventType === "turn.completed"
      );
      const projectionLossOverflow = await readStore.fetchOverflow(
        runId,
        turnCompletedEvent?.projectionLossOverflowId ?? "missing"
      );
      const rawPayloadOverflow = await readStore.fetchOverflow(
        runId,
        turnCompletedEvent?.rawPayloadOverflowId ?? "missing"
      );

      expect(runs[0]?.runId).toBe(runId);
      expect(runs[0]?.agentStatus).toBe("completed");
      expect(runs[0]?.model).toBe("xiaomi/mimo-v2-pro");
      expect(runs[0]?.turnCount).toBe(1);
      expect(runs[0]?.eventCount).toBe(3);
      expect(runs[0]?.inputTokens).toBe(11);
      expect(runs[0]?.outputTokens).toBe(7);
      expect(issueRuns).toHaveLength(1);
      expect(problemRuns).toHaveLength(0);
      expect(runDetail?.issue.issueIdentifier).toBe("COL-157");
      expect(runDetail?.run.runId).toBe(runId);
      expect(runDetail?.run.agentStatus).toBe("completed");
      expect(runDetail?.run.threadId).toBe("thread-1");
      expect(runDetail?.run.processId).toBe("pi-process-123");
      expect(runDetail?.run.providerId).toBe("openrouter");
      expect(runDetail?.run.providerName).toBe("OpenRouter");
      expect(runDetail?.run.reasoningEffort).toBe("high");
      expect(runDetail?.run.profile).toBe("mimo-v2-pro");
      expect(runDetail?.run.authMode).toBe("api_key_env");
      expect(runDetail?.run.providerEnvKey).toBe("OPENROUTER_API_KEY");
      expect(runDetail?.run.launchTarget).toEqual({
        kind: "container",
        hostLaunchPath: "/tmp/workspaces/col-157",
        hostWorkspacePath: "/tmp/workspaces/col-157",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-157",
        containerName: "symphony-col-157",
        shell: "sh"
      });
      expect(runDetail?.run.model).toBe("xiaomi/mimo-v2-pro");
      expect(runDetail?.turns).toHaveLength(1);
      expect(runDetail?.turns[0]?.usage).toEqual({
        input_tokens: 11,
        cached_input_tokens: 2,
        output_tokens: 7
      });
      expect(runDetail?.turns[0]?.events.map((event) => event.eventType)).toEqual([
        "thread.started",
        "item.completed",
        "turn.completed"
      ]);
      expect(runDetail?.turns[0]?.events[1]?.payload).toEqual({
        type: "item.completed",
        item: {
          id: "item-1",
          type: "agent_message",
          text: longMessage
        }
      });
      expect(runDetail?.turns[0]?.events[1]?.payloadBytes).toBeGreaterThan(64);
      expect(runDetail?.turns[0]?.events[1]?.summary).toBe(longMessage.slice(0, 279) + "…");
      expect(artifacts?.run.runId).toBe(runId);
      expect(artifacts?.turns).toHaveLength(1);
      expect(artifacts?.events.map((event) => event.eventType)).toEqual([
        "thread.started",
        "item.completed",
        "turn.completed"
      ]);
      expect(turnCompletedEvent).toMatchObject({
        payloadOverflowId: expect.any(String),
        projectionLossOverflowId: expect.any(String),
        rawPayloadOverflowId: expect.any(String)
      });
      expect(turns).toHaveLength(1);
      expect(turns[0]?.usage).toEqual({
        input_tokens: 11,
        cached_input_tokens: 2,
        output_tokens: 7
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.itemType).toBe("agent_message");
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0]?.textContent).toBeNull();
      expect(agentMessages[0]?.textPreview).toBe(longMessage.slice(0, 279) + "…");
      expect(agentMessageOverflow).toMatchObject({
        runId,
        turnId,
        itemId: "item-1",
        kind: "agent_message",
        contentText: longMessage
      });
      expect(projectionLossOverflow).toMatchObject({
        runId,
        turnId,
        kind: "projection_losses",
        contentJson: [
          {
            kind: "reasoning_tokens_folded_into_output",
            messageId: "assistant-1",
            reasoningTokens: 2
          }
        ]
      });
      expect(rawPayloadOverflow).toMatchObject({
        runId,
        turnId,
        kind: "raw_harness_payload",
        contentJson: {
          source: "opencode",
          responseId: "assistant-1"
        }
      });
      expect(commands).toHaveLength(0);
      expect(tools).toHaveLength(0);
      expect(reasoning).toHaveLength(0);
      expect(fileChanges).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("surfaces compact machine-load summaries on run summaries and run detail", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-machine-load-read-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const timelineStore = createSymphonyIssueTimelineStore(database.db);
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db,
      timelineStore
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-machine-load",
        issueId: "issue-2",
        issueIdentifier: "COL-200",
        startedAt: "2026-04-05T00:00:00.000Z",
        status: "running"
      });
      await analytics.startRun({
        runId,
        issueId: "issue-2",
        issueIdentifier: "COL-200",
        startedAt: "2026-04-05T00:00:00.000Z",
        status: "running",
        threadId: "thread-200"
      });
      await analytics.finalizeRun({
        runId,
        endedAt: "2026-04-05T00:03:00.000Z",
        status: "completed",
        threadId: "thread-200",
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null
      });
      await runStore.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-04-05T00:03:00.000Z",
        machineLoadSummary: {
          sampleCount: 6,
          maxCpuPercent: 88,
          avgCpuPercent: 64,
          maxMemoryPercent: 79,
          avgMemoryPercent: 70,
          maxDiskPercent: 47,
          avgDiskPercent: 47,
          hadHighCpu: true,
          hadHighMemory: false,
          hadHighDisk: false
        }
      });

      const runs = await readStore.listRuns({
        limit: 10
      });
      const runDetail = await readStore.fetchRunDetail(runId);

      expect(runs[0]?.machineLoad).toEqual({
        sampleCount: 6,
        maxCpuPercent: 88,
        avgCpuPercent: 64,
        maxMemoryPercent: 79,
        avgMemoryPercent: 70,
        maxDiskPercent: 47,
        avgDiskPercent: 47,
        hadHighCpu: true,
        hadHighMemory: false,
        hadHighDisk: false
      });
      expect(runDetail?.run.machineLoad).toEqual(runs[0]?.machineLoad);
    } finally {
      database.close();
    }
  });

  it("orders persisted messages and reasoning by recordedAt for deterministic turn activities", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-ordering-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 64
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runJournal.recordRunStarted({
        runId: "run-ordering",
        issueId: "issue-4",
        issueIdentifier: "COL-204",
        startedAt: "2026-04-03T20:39:00.000Z",
        status: "running"
      });
      const turnId = await runJournal.recordTurnStarted(runId, {
        turnId: "turn-ordering",
        turnSequence: 1,
        promptText: "Check ordering",
        status: "running",
        startedAt: "2026-04-03T20:39:01.000Z",
        threadId: "thread-ordering",
        agentTurnId: "turn-ordering"
      });

      await analytics.startRun({
        runId,
        issueId: "issue-4",
        issueIdentifier: "COL-204",
        startedAt: "2026-04-03T20:39:00.000Z",
        status: "running",
        threadId: "thread-ordering"
      });

      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-ordering",
        recordedAt: "2026-04-03T20:39:01.300Z",
        payload: {
          type: "item.completed",
          item: {
            id: "message-late",
            type: "agent_message",
            text: "Later"
          }
        }
      });
      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-ordering",
        recordedAt: "2026-04-03T20:39:01.100Z",
        payload: {
          type: "item.completed",
          item: {
            id: "message-early",
            type: "agent_message",
            text: "Earlier"
          }
        }
      });
      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-ordering",
        recordedAt: "2026-04-03T20:39:01.250Z",
        payload: {
          type: "item.completed",
          item: {
            id: "reasoning-late",
            type: "reasoning",
            text: "Late reasoning"
          }
        }
      });
      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-ordering",
        recordedAt: "2026-04-03T20:39:01.050Z",
        payload: {
          type: "item.completed",
          item: {
            id: "reasoning-early",
            type: "reasoning",
            text: "Early reasoning"
          }
        }
      });

      const messages = await readStore.listAgentMessages({
        runId,
        turnId
      });
      const reasoning = await readStore.listReasoning({
        runId,
        turnId
      });
      const artifacts = await readStore.fetchRunArtifacts(runId);
      const turnActivities = artifacts?.turnActivities ?? [];

      expect(messages.map((message) => message.itemId)).toEqual([
        "message-early",
        "message-late"
      ]);
      expect(reasoning.map((entry) => entry.itemId)).toEqual([
        "reasoning-early",
        "reasoning-late"
      ]);
      expect(turnActivities[0]?.messages.map((entry) => entry.itemId)).toEqual([
        "message-early",
        "message-late"
      ]);
      expect(turnActivities[0]?.reasoningBlocks.map((entry) => entry.itemId)).toEqual([
        "reasoning-early",
        "reasoning-late"
      ]);
    } finally {
      database.close();
    }
  });

  it("filters projected records by turn and preserves failed-run analytics details", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-failed-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 128
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runJournal.recordRunStarted({
        runId: "run-problem",
        issueId: "issue-2",
        issueIdentifier: "COL-158",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running",
        workerHost: "worker-2",
        workspacePath: "/tmp/workspaces/COL-158"
      });
      await analytics.startRun({
        runId,
        issueId: "issue-2",
        issueIdentifier: "COL-158",
        startedAt: "2026-04-03T20:37:38.949Z",
        status: "running",
        threadId: "thread-problem"
      });

      const firstTurnId = await runJournal.recordTurnStarted(runId, {
        turnId: "turn-problem-1",
        turnSequence: 1,
        promptText: "Draft a response",
        status: "running",
        startedAt: "2026-04-03T20:37:39.000Z",
        threadId: "thread-problem",
        agentTurnId: "turn-problem-1"
      });
      const secondTurnId = await runJournal.recordTurnStarted(runId, {
        turnId: "turn-problem-2",
        turnSequence: 2,
        promptText: "Run a command",
        status: "running",
        startedAt: "2026-04-03T20:37:40.000Z",
        threadId: "thread-problem",
        agentTurnId: "turn-problem-2"
      });

      await analytics.recordEvent({
        runId,
        turnId: firstTurnId,
        threadId: "thread-problem",
        recordedAt: "2026-04-03T20:37:39.100Z",
        payload: {
          type: "item.completed",
          item: {
            id: "msg-1",
            type: "agent_message",
            text: "First turn message"
          }
        }
      });
      await analytics.recordEvent({
        runId,
        turnId: secondTurnId,
        threadId: "thread-problem",
        recordedAt: "2026-04-03T20:37:40.100Z",
        payload: {
          type: "item.completed",
          item: {
            id: "cmd-problem-1",
            type: "command_execution",
            command: "pnpm lint",
            aggregated_output: "lint failed",
            exit_code: 1,
            status: "failed"
          }
        }
      });
      await analytics.recordEvent({
        runId,
        turnId: secondTurnId,
        threadId: "thread-problem",
        recordedAt: "2026-04-03T20:37:40.200Z",
        payload: {
          type: "turn.failed",
          error: {
            message: "Command failed"
          }
        }
      });

      await analytics.finalizeTurn({
        runId,
        turnId: firstTurnId,
        endedAt: "2026-04-03T20:37:39.500Z",
        status: "completed",
        threadId: "thread-problem",
        failureKind: null,
        failureMessagePreview: null
      });
      await analytics.finalizeTurn({
        runId,
        turnId: secondTurnId,
        endedAt: "2026-04-03T20:37:40.500Z",
        status: "failed",
        threadId: "thread-problem",
        failureKind: "turn_failed",
        failureMessagePreview: "Command failed"
      });
      await analytics.finalizeRun({
        runId,
        endedAt: "2026-04-03T20:37:41.000Z",
        status: "failed",
        threadId: "thread-problem",
        failureKind: "rate_limit",
        failureOrigin: "agent",
        failureMessagePreview: "Rate limited while retrying"
      });

      await runJournal.finalizeTurn(firstTurnId, {
        status: "completed",
        endedAt: "2026-04-03T20:37:39.500Z",
        threadId: "thread-problem",
        agentTurnId: "turn-problem-1"
      });
      await runJournal.finalizeTurn(secondTurnId, {
        status: "failed",
        endedAt: "2026-04-03T20:37:40.500Z",
        threadId: "thread-problem",
        agentTurnId: "turn-problem-2"
      });
      await runJournal.finalizeRun(runId, {
        status: "finished",
        outcome: "rate_limit",
        endedAt: "2026-04-03T20:37:41.000Z",
        errorClass: "rate_limit",
        errorMessage: "Rate limited while retrying"
      });

      const problemRuns = await readStore.listProblemRuns({
        limit: 10
      });
      const allAgentMessages = await readStore.listAgentMessages({
        runId
      });
      const firstTurnMessages = await readStore.listAgentMessages({
        runId,
        turnId: firstTurnId
      });
      const secondTurnMessages = await readStore.listAgentMessages({
        runId,
        turnId: secondTurnId
      });
      const secondTurnCommands = await readStore.listCommandExecutions({
        runId,
        turnId: secondTurnId
      });
      const runArtifacts = await readStore.fetchRunArtifacts(runId);

      expect(problemRuns).toHaveLength(1);
      expect(problemRuns[0]).toMatchObject({
        runId,
        issueIdentifier: "COL-158",
        outcome: "rate_limit",
        status: "finished"
      });
      expect(allAgentMessages).toHaveLength(1);
      expect(firstTurnMessages).toHaveLength(1);
      expect(secondTurnMessages).toHaveLength(0);
      expect(secondTurnCommands).toHaveLength(1);
      expect(secondTurnCommands[0]).toMatchObject({
        itemId: "cmd-problem-1",
        command: "pnpm lint",
        status: "failed",
        exitCode: 1
      });
      expect(runArtifacts?.run).toMatchObject({
        runId,
        status: "failed",
        failureKind: "rate_limit",
        failureOrigin: "agent",
        failureMessagePreview: "Rate limited while retrying"
      });
      expect(runArtifacts?.turns.find((turn) => turn.turnId === secondTurnId)).toMatchObject({
        turnId: secondTurnId,
        status: "failed",
        failureKind: "turn_failed",
        failureMessagePreview: "Command failed"
      });
    } finally {
      database.close();
    }
  });

  it("returns startup-failed runs even when no agent turns or events were recorded", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-startup-failed-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runJournal.recordRunStarted({
        runId: "run-startup-failed",
        issueId: "issue-3",
        issueIdentifier: "COL-500",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "dispatching"
      });

      await analytics.startRun({
        runId,
        issueId: "issue-3",
        issueIdentifier: "COL-500",
        startedAt: "2026-04-03T20:37:38.000Z",
        status: "dispatching",
        threadId: null
      });
      await analytics.finalizeRun({
        runId,
        endedAt: "2026-04-03T20:37:40.000Z",
        status: "startup_failed",
        threadId: null,
        failureKind: "startup_failure",
        failureOrigin: "runtime",
        failureMessagePreview: "Workspace failed to start."
      });
      await runJournal.finalizeRun(runId, {
        status: "startup_failed",
        outcome: "startup_failed",
        endedAt: "2026-04-03T20:37:40.000Z",
        errorClass: "startup_failure_runtime_prepare",
        errorMessage: "Workspace failed to start."
      });

      const runDetail = await readStore.fetchRunDetail(runId);
      const artifacts = await readStore.fetchRunArtifacts(runId);

      expect(runDetail?.run.runId).toBe(runId);
      expect(runDetail?.run.status).toBe("startup_failed");
      expect(runDetail?.run.outcome).toBe("startup_failed");
      expect(runDetail?.run.turnCount).toBe(0);
      expect(runDetail?.run.eventCount).toBe(0);
      expect(runDetail?.turns).toEqual([]);

      expect(artifacts?.run.runId).toBe(runId);
      expect(artifacts?.run.status).toBe("startup_failed");
      expect(artifacts?.turns).toEqual([]);
      expect(artifacts?.events).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("returns structured task snapshots for Pi queue updates in run artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-read-task-snapshots-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runJournal.recordRunStarted({
        runId: "run-task-snapshots",
        issueId: "issue-10",
        issueIdentifier: "COL-910",
        startedAt: "2026-04-05T09:00:00.000Z",
        status: "running"
      });
      await analytics.startRun({
        runId,
        issueId: "issue-10",
        issueIdentifier: "COL-910",
        startedAt: "2026-04-05T09:00:00.000Z",
        status: "running",
        threadId: "thread-task-snapshots"
      });

      const turnId = await runJournal.recordTurnStarted(runId, {
        turnId: "turn-task-snapshots",
        turnSequence: 1,
        promptText: "Track the queue",
        status: "running",
        startedAt: "2026-04-05T09:00:01.000Z",
        threadId: "thread-task-snapshots",
        agentTurnId: "turn-task-snapshots"
      });

      await analytics.recordEvent({
        runId,
        turnId,
        threadId: "thread-task-snapshots",
        recordedAt: "2026-04-05T09:00:01.200Z",
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

      const artifacts = await readStore.fetchRunArtifacts(runId);
      const taskSnapshots = await readStore.listTaskSnapshots({
        runId,
        turnId
      });

      expect(artifacts?.taskSnapshots).toEqual([
        {
          snapshotId: expect.any(String),
          runId,
          turnId,
          itemId: "pi-todo-queue",
          sourceKind: "pi_queue_update",
          recordedAt: "2026-04-05T09:00:01.200Z",
          insertedAt: expect.any(String),
          items: [
            {
              snapshotId: expect.any(String),
              position: 0,
              label: "Keep the patch scoped",
              state: "pending",
              section: "steering",
              insertedAt: expect.any(String)
            },
            {
              snapshotId: expect.any(String),
              position: 1,
              label: "Summarize the changes",
              state: "pending",
              section: "follow_up",
              insertedAt: expect.any(String)
            }
          ]
        }
      ]);
      expect(taskSnapshots).toEqual(artifacts?.taskSnapshots ?? []);
    } finally {
      database.close();
    }
  });
});
