import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueDeliveryReportStore } from "./issue-delivery-reports.js";
import { createSqliteAgentAnalyticsStore } from "./agent-analytics-store.js";
import { createSqliteAgentAnalyticsReadStore } from "./agent-analytics-read-store.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import { symphonyRunsTable } from "./schema.js";
import { eq } from "drizzle-orm";

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
        issueId: "issue-1",
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
    const analyticsStore = createSqliteAgentAnalyticsStore({
      db: database.db
    });
    const deliveryStore = createSymphonyIssueDeliveryReportStore({
      db: database.db
    });
    const readStore = createSqliteAgentAnalyticsReadStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-1",
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        runMode: "implementation",
        startedAt: "2026-04-05T19:00:00.000Z",
        status: "running"
      });
      await analyticsStore.startRun({
        runId,
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        status: "running",
        threadId: "thread-1"
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
        issueId: "issue-1",
        issueIdentifier: "COL-157",
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
});
