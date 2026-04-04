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
  it("reconstructs a run export from Codex tables and resolves overflowed event payloads", async () => {
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
        threadId: "thread-1"
      });
      await analytics.finalizeRun({
        runId,
        endedAt: "2026-04-03T20:37:41.000Z",
        status: "completed",
        threadId: "thread-1"
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

      const exportPayload = await readStore.fetchRunExport(runId);

      expect(exportPayload?.run.runId).toBe(runId);
      expect(exportPayload?.turns).toHaveLength(1);
      expect(exportPayload?.turns[0]?.usage).toEqual({
        input_tokens: 11,
        cached_input_tokens: 2,
        output_tokens: 7
      });
      expect(exportPayload?.turns[0]?.events.map((event) => event.eventType)).toEqual([
        "thread.started",
        "item.completed",
        "turn.completed"
      ]);
      expect(exportPayload?.turns[0]?.events[1]?.payload).toEqual({
        type: "item.completed",
        item: {
          id: "item-1",
          type: "agent_message",
          text: longMessage
        }
      });
      expect(exportPayload?.turns[0]?.events[1]?.payloadBytes).toBeGreaterThan(64);
      expect(exportPayload?.turns[0]?.events[1]?.summary).toBe(longMessage.slice(0, 279) + "…");
    } finally {
      database.close();
    }
  });
});
