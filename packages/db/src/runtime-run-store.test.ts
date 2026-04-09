import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueDeliveryReportStore } from "./issue-delivery-reports.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import { symphonySchema, symphonyRunsTable } from "./schema.js";
import { eq } from "drizzle-orm";

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

describe("runtime run delivery projections", () => {
  it("persists the internal run mode in run metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-mode-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-mode-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-1",
        issueIdentifier: "COL-200",
        runMode: "rework",
        metadata: {
          source: "test"
        },
        startedAt: "2026-04-05T19:00:00.000Z",
        status: "running"
      });

      const storedRun = database.db
        .select()
        .from(symphonyRunsTable)
        .where(eq(symphonyRunsTable.runId, runId))
        .get();

      expect(storedRun?.metadata).toMatchObject({
        source: "test",
        runMode: "rework"
      });
    } finally {
      database.close();
    }
  });

  it("surfaces latest delivery status on run and issue summaries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-delivery-"));
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
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-1",
        issueIdentifier: "COL-157",
        runMode: "implementation",
        startedAt: "2026-04-05T19:00:00.000Z",
        status: "running"
      });
      await runStore.updateRun(runId, {
        status: "running"
      });
      await runStore.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-04-05T19:10:00.000Z"
      });
      await deliveryStore.record({
        runId,
        status: "completed",
        summary: "Opened the PR.",
        prUrl: "https://github.com/example/repo/pull/157",
        reportedAt: "2026-04-05T19:11:00.000Z"
      });

      const [run] = await readStore.listRuns({
        issueIdentifier: "COL-157"
      });
      const detail = await readStore.fetchRunDetail(runId);

      expect(run?.deliveryStatus).toBe("completed");
      expect(run?.deliveryPrUrl).toBe("https://github.com/example/repo/pull/157");
      expect(detail?.issue.latestDeliveryStatus).toBe("completed");
      expect(detail?.issue.deliveredRunCount).toBe(1);
      expect(detail?.deliveryReport?.status).toBe("completed");
    } finally {
      database.close();
    }
  });

  it("records canonical events without writing extra timeline entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-events-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
        repositoryKey: testRepositoryKey
      });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db,
      timelineStore: issueTimelineStore
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-events-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-events-1",
        issueIdentifier: "COL-310",
        runMode: "implementation",
        startedAt: "2026-04-08T21:00:00.000Z",
        status: "running"
      });
      const turnId = await runStore.recordTurnStarted(runId, {
        turnId: "turn-events-1",
        promptText: "Investigate the event stream.",
        status: "running",
        threadId: "thread-events-1",
        startedAt: "2026-04-08T21:00:01.000Z"
      });
      const timelineBefore = await issueTimelineStore.listIssueTimeline("COL-310");

      await runStore.recordEvent(runId, turnId, {
        eventType: "session.started",
        recordedAt: "2026-04-08T21:00:02.000Z",
        summary: "runtime session started",
        threadId: "thread-events-1",
        payload: {
          type: "session.started",
          session_id: "thread-events-1",
          thread_id: "thread-events-1",
          turn_id: "agent-turn-events-1",
          agent_app_server_pid: "4242",
          model: "gpt-5.4",
          reasoning_effort: "high"
        }
      });

      const event = database.db
        .select()
        .from(symphonySchema.symphonyEventsTable)
        .where(eq(symphonySchema.symphonyEventsTable.turnId, turnId))
        .get();
      const timelineAfter = await issueTimelineStore.listIssueTimeline("COL-310");

      expect(event).toMatchObject({
        runId,
        turnId,
        eventSequence: 1,
        eventType: "session.started",
        itemType: null,
        itemStatus: null,
        summary: "runtime session started",
        threadId: "thread-events-1",
        payloadTruncated: false
      });
      expect(timelineAfter).toHaveLength(timelineBefore.length);
    } finally {
      database.close();
    }
  });

  it("stores runtime-owned run context in a dedicated sidecar row", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-context-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-context-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-context-1",
        issueIdentifier: "COL-311",
        runMode: "implementation",
        startedAt: "2026-04-09T02:00:00.000Z",
        status: "running"
      });

      await runStore.upsertRunContext(runId, {
        harnessKind: "pi",
        threadId: "thread-context-1",
        processId: "4242",
        model: "gpt-5.4",
        reasoningEffort: "high",
        profile: "default",
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        providerEnvKey: "OPENROUTER_API_KEY",
        launchTarget: {
          kind: "container",
          hostLaunchPath: "/tmp/workspaces/col-311",
          hostWorkspacePath: "/tmp/workspaces/col-311",
          runtimeWorkspacePath: "/workspace",
          containerId: "container-311",
          containerName: "symphony-col-311",
          shell: "sh"
        }
      });
      await runStore.upsertRunContext(runId, {
        threadId: "thread-context-1",
        model: "gpt-5.5"
      });

      const context = database.db
        .select()
        .from(symphonySchema.symphonyRunRuntimeContextTable)
        .where(eq(symphonySchema.symphonyRunRuntimeContextTable.runId, runId))
        .get();

      expect(context).toMatchObject({
        runId,
        harnessKind: "pi",
        threadId: "thread-context-1",
        processId: "4242",
        model: "gpt-5.5",
        reasoningEffort: "high",
        profile: "default",
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: "api_key_env",
        providerEnvKey: "OPENROUTER_API_KEY",
        launchTarget: {
          kind: "container",
          hostLaunchPath: "/tmp/workspaces/col-311",
          hostWorkspacePath: "/tmp/workspaces/col-311",
          runtimeWorkspacePath: "/workspace",
          containerId: "container-311",
          containerName: "symphony-col-311",
          shell: "sh"
        }
      });
    } finally {
      database.close();
    }
  });
});
