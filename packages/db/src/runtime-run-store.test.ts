import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { SymphonyActiveRunExistsError } from "./errors.js";
import { createSymphonyIssueDeliveryReportStore } from "./issue-delivery-reports.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import { symphonySchema, symphonyRunsTable } from "./schema.js";
import type { SymphonyRuntimeRunStartAttrs } from "./runtime-run-types.js";
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

async function recordSeededRunStarted(
  db: ReturnType<typeof initializeSymphonyDb>["db"],
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>,
  attrs: SymphonyRuntimeRunStartAttrs
): Promise<string> {
  const issueStore = createSymphonyIssueStore(db);
  await issueStore.upsert({
    issueIdentifier: attrs.issueIdentifier,
    trackerIssueId: attrs.trackerIssueId,
    repositoryKey: attrs.repositoryKey,
    bindingScope: attrs.bindingScope ?? null,
    latestRunStartedAt: null,
    recordedAt: new Date(attrs.startedAt).toISOString()
  });

  return await runStore.recordRunStarted(attrs);
}

describe("runtime run delivery projections", () => {
  it("persists the internal run mode in a dedicated run column", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-mode-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await recordSeededRunStarted(database.db, runStore, {
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

      expect(storedRun?.runMode).toBe("rework");
      expect(storedRun?.metadata).toEqual({
        source: "test"
      });
    } finally {
      database.close();
    }
  });

  it("fails fast when a run starts without a canonical issue binding", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-binding-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await expect(
        runStore.recordRunStarted({
          runId: "run-missing-binding-1",
          repositoryKey: testRepositoryKey,
          trackerIssueId: "issue-missing-binding-1",
          issueIdentifier: "COL-199",
          runMode: "implementation",
          startedAt: "2026-04-05T18:00:00.000Z",
          status: "running"
        })
      ).rejects.toThrow(
        "Issue binding not found for run start: COL-199 in openai/symphony."
      );
    } finally {
      database.close();
    }
  });

  it("fails fast when a run start uses a stale issue identifier for the canonical tracker issue", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-stale-identifier-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "COL-199-RENAMED",
        trackerIssueId: "issue-stale-1",
        repositoryKey: testRepositoryKey,
        latestRunStartedAt: null,
        recordedAt: "2026-04-05T18:00:00.000Z"
      });

      await expect(
        runStore.recordRunStarted({
          runId: "run-stale-identifier-1",
          repositoryKey: testRepositoryKey,
          trackerIssueId: "issue-stale-1",
          issueIdentifier: "COL-199",
          runMode: "implementation",
          startedAt: "2026-04-05T18:01:00.000Z",
          status: "running"
        })
      ).rejects.toThrow(
        "Tracker issue issue-stale-1 is already bound to issue identifier COL-199-RENAMED, not COL-199."
      );
    } finally {
      database.close();
    }
  });

  it("persists hosted workspace scope on scoped run starts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-scoped-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await recordSeededRunStarted(database.db, runStore, {
        runId: "run-scoped-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-scoped-1",
        issueIdentifier: "COL-201",
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        },
        runMode: "implementation",
        startedAt: "2026-04-05T19:05:00.000Z",
        status: "running"
      });

      const storedRun = database.db
        .select()
        .from(symphonyRunsTable)
        .where(eq(symphonyRunsTable.runId, runId))
        .get();

      expect(storedRun?.organizationId).toBe("org-1");
      expect(storedRun?.linearWorkspaceIdentityId).toBe("workspace-1");
    } finally {
      database.close();
    }
  });

  it("cascades issue identifier updates into existing run rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-rename-cascade-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await recordSeededRunStarted(database.db, runStore, {
        runId: "run-rename-cascade-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-rename-cascade-1",
        issueIdentifier: "COL-201A",
        runMode: "implementation",
        startedAt: "2026-04-05T19:06:00.000Z",
        status: "running"
      });

      await issueStore.upsert({
        issueIdentifier: "COL-201B",
        trackerIssueId: "issue-rename-cascade-1",
        repositoryKey: testRepositoryKey,
        latestRunStartedAt: "2026-04-05T19:06:00.000Z",
        recordedAt: "2026-04-05T19:07:00.000Z"
      });

      const storedRun = database.db
        .select()
        .from(symphonyRunsTable)
        .where(eq(symphonyRunsTable.runId, runId))
        .get();

      expect(storedRun?.issueIdentifier).toBe("COL-201B");
    } finally {
      database.close();
    }
  });

  it("fails fast when a scoped run start does not match the canonical issue scope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-run-scope-mismatch-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "COL-202",
        trackerIssueId: "issue-scoped-mismatch-1",
        repositoryKey: testRepositoryKey,
        bindingScope: {
          organizationId: "org-1",
          linearWorkspaceIdentityId: "workspace-1"
        },
        latestRunStartedAt: null,
        recordedAt: "2026-04-05T19:10:00.000Z"
      });

      await expect(
        runStore.recordRunStarted({
          runId: "run-scoped-mismatch-1",
          repositoryKey: testRepositoryKey,
          trackerIssueId: "issue-scoped-mismatch-1",
          issueIdentifier: "COL-202",
          bindingScope: {
            organizationId: "org-2",
            linearWorkspaceIdentityId: "workspace-2"
          },
          runMode: "implementation",
          startedAt: "2026-04-05T19:11:00.000Z",
          status: "running"
        })
      ).rejects.toThrow(
        "Issue COL-202 is scoped to hosted workspace org-1/workspace-1, not org-2/workspace-2."
      );
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
      const runId = await recordSeededRunStarted(database.db, runStore, {
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
        reportId: "report-run-1",
        runId,
        status: "completed",
        summary: "Opened the PR.",
        prUrl: "https://github.com/example/repo/pull/157",
        source: "runtime",
        reportedAt: "2026-04-05T19:11:00.000Z"
      });
      await runStore.upsertRunContext(runId, {
        harnessKind: "pi",
        threadId: "thread-run-1",
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
      const runId = await recordSeededRunStarted(database.db, runStore, {
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
        turnSequence: 1,
        promptText: "Investigate the event stream.",
        status: "running",
        threadId: "thread-events-1",
        startedAt: "2026-04-08T21:00:01.000Z"
      });
      const timelineBefore = await issueTimelineStore.listIssueTimeline("COL-310");

      await runStore.recordEvent(runId, turnId, {
        eventId: "event-runtime-session-started-1",
        eventSequence: 1,
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
      const runId = await recordSeededRunStarted(database.db, runStore, {
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
          shell: "sh",
          user: "1000:1000"
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
          shell: "sh",
          user: "1000:1000"
        }
      });
    } finally {
      database.close();
    }
  });

  it("rejects a second active run for the same issue until the first run is finalized", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-active-run-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const firstRunId = await recordSeededRunStarted(database.db, runStore, {
        runId: "run-active-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-active-1",
        issueIdentifier: "COL-401",
        runMode: "implementation",
        startedAt: "2026-04-09T11:00:00.000Z",
        status: "dispatching"
      });

      await expect(
        recordSeededRunStarted(database.db, runStore, {
          runId: "run-active-2",
          repositoryKey: testRepositoryKey,
          trackerIssueId: "issue-active-1",
          issueIdentifier: "COL-401",
          runMode: "implementation",
          startedAt: "2026-04-09T11:01:00.000Z",
          status: "running"
        })
      ).rejects.toBeInstanceOf(SymphonyActiveRunExistsError);

      await runStore.finalizeRun(firstRunId, {
        status: "failed",
        endedAt: "2026-04-09T11:02:00.000Z"
      });

      await expect(
        recordSeededRunStarted(database.db, runStore, {
          runId: "run-active-3",
          repositoryKey: testRepositoryKey,
          trackerIssueId: "issue-active-1",
          issueIdentifier: "COL-401",
          runMode: "implementation",
          startedAt: "2026-04-09T11:03:00.000Z",
          status: "dispatching"
        })
      ).resolves.toBe("run-active-3");
    } finally {
      database.close();
    }
  });

  it("rejects attempts to rebind an issue identifier to a different repository or tracker id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-issue-binding-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await recordSeededRunStarted(database.db, runStore, {
        runId: "run-binding-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-binding-1",
        issueIdentifier: "COL-400",
        runMode: "implementation",
        startedAt: "2026-04-09T10:00:00.000Z",
        status: "running"
      });

      await expect(
        recordSeededRunStarted(database.db, runStore, {
          runId: "run-binding-2",
          repositoryKey: "other/repo",
          trackerIssueId: "issue-binding-1",
          issueIdentifier: "COL-400",
          runMode: "implementation",
          startedAt: "2026-04-09T10:05:00.000Z",
          status: "running"
        })
      ).rejects.toThrow(
        "Issue COL-400 is already bound to repository openai/symphony, not other/repo."
      );

      await expect(
        recordSeededRunStarted(database.db, runStore, {
          runId: "run-binding-3",
          repositoryKey: testRepositoryKey,
          trackerIssueId: "issue-binding-2",
          issueIdentifier: "COL-400",
          runMode: "implementation",
          startedAt: "2026-04-09T10:10:00.000Z",
          status: "running"
        })
      ).rejects.toThrow(
        "Issue COL-400 is already bound to tracker issue issue-binding-1, not issue-binding-2."
      );
    } finally {
      database.close();
    }
  });
});
