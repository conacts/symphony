import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSqliteCodexAnalyticsReadStore } from "./codex-analytics-read-store.js";
import { createSqliteCodexAnalyticsStore } from "./codex-analytics-store.js";
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

describe("sqlite codex analytics read store", () => {
  it("returns contract-native run detail and Codex projection artifacts from analytics tables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-read-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteCodexAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 64
    });
    const readStore = createSqliteCodexAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runJournal.recordRunStarted({
        runId: "run-codex",
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
        codexThreadId: "thread-1",
        codexTurnId: "turn-1"
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
      await runJournal.finalizeTurn(turnId, {
        status: "completed",
        endedAt: "2026-04-03T20:37:40.000Z",
        codexThreadId: "thread-1",
        codexTurnId: "turn-1"
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

      expect(runs[0]?.runId).toBe(runId);
      expect(runs[0]?.turnCount).toBe(1);
      expect(runs[0]?.eventCount).toBe(3);
      expect(runs[0]?.inputTokens).toBe(11);
      expect(runs[0]?.outputTokens).toBe(7);
      expect(issueRuns).toHaveLength(1);
      expect(problemRuns).toHaveLength(0);
      expect(runDetail?.issue.issueIdentifier).toBe("COL-157");
      expect(runDetail?.run.runId).toBe(runId);
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
      expect(commands).toHaveLength(0);
      expect(tools).toHaveLength(0);
      expect(reasoning).toHaveLength(0);
      expect(fileChanges).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("filters projected records by turn and preserves failed-run analytics details", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-read-failed-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteCodexAnalyticsStore({
      db: database.db,
      payloadMaxBytes: 128
    });
    const readStore = createSqliteCodexAnalyticsReadStore({
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
        codexThreadId: "thread-problem",
        codexTurnId: "turn-problem-1"
      });
      const secondTurnId = await runJournal.recordTurnStarted(runId, {
        turnId: "turn-problem-2",
        turnSequence: 2,
        promptText: "Run a command",
        status: "running",
        startedAt: "2026-04-03T20:37:40.000Z",
        codexThreadId: "thread-problem",
        codexTurnId: "turn-problem-2"
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
        failureOrigin: "codex",
        failureMessagePreview: "Rate limited while retrying"
      });

      await runJournal.finalizeTurn(firstTurnId, {
        status: "completed",
        endedAt: "2026-04-03T20:37:39.500Z",
        codexThreadId: "thread-problem",
        codexTurnId: "turn-problem-1"
      });
      await runJournal.finalizeTurn(secondTurnId, {
        status: "failed",
        endedAt: "2026-04-03T20:37:40.500Z",
        codexThreadId: "thread-problem",
        codexTurnId: "turn-problem-2"
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
        failureOrigin: "codex",
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

  it("returns startup-failed runs even when no Codex turns or events were recorded", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-codex-read-startup-failed-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runJournal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });
    const analytics = createSqliteCodexAnalyticsStore({
      db: database.db
    });
    const readStore = createSqliteCodexAnalyticsReadStore({
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
});
