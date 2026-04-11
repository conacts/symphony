import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSymphonyIssueDeliveryReportStore } from "./issue-delivery-reports.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import type { SymphonyRuntimeRunStartAttrs } from "./runtime-run-types.js";

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
    latestRunStartedAt: null,
    recordedAt: new Date(attrs.startedAt).toISOString()
  });

  return await runStore.recordRunStarted(attrs);
}

describe("issue delivery report store", () => {
  it("records delivery reports and returns latest projections for the issue and run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-delivery-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const timelineStore = createSymphonyIssueTimelineStore(database.db, {
      repositoryKey: testRepositoryKey
    });
    const store = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      timelineStore,
      repositoryKey: testRepositoryKey
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db,
      timelineStore
    });

    try {
      await recordSeededRunStarted(database.db, runStore, {
        runId: "run-1",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-157",
        issueIdentifier: "COL-157",
        runMode: "implementation",
        status: "running",
        startedAt: "2026-04-05T17:59:00.000Z"
      });
      await runStore.recordTurnStarted("run-1", {
        turnId: "turn-1",
        turnSequence: 1,
        threadId: "thread-1",
        promptText: "Continue the issue.",
        status: "running",
        startedAt: "2026-04-05T17:59:30.000Z"
      });
      await store.record({
        reportId: "report-1",
        runId: "run-1",
        status: "blocked",
        summary: "Blocked on auth.",
        blockingReason: "Missing OpenRouter credentials.",
        source: "runtime",
        reportedAt: "2026-04-05T18:00:00.000Z"
      });
      const completedId = await store.record({
        reportId: "report-2",
        runId: "run-1",
        turnId: "turn-1",
        status: "completed",
        summary: "Opened the PR.",
        prUrl: "https://github.com/example/repo/pull/157",
        prNumber: "157",
        branchName: "symphony/col-157",
        testsSummary: "pnpm verify:precommit",
        source: "pi",
        reportedAt: "2026-04-05T18:05:00.000Z"
      });

      const latestForIssue = await store.fetchLatestForIssue("COL-157");
      const latestForRun = await store.fetchLatestForRun("run-1");
      const issueReports = await store.listForIssue("COL-157");
      const timeline = await timelineStore.listIssueTimeline("COL-157");

      expect(latestForIssue?.reportId).toBe(completedId);
      expect(latestForIssue?.status).toBe("completed");
      expect(latestForIssue?.prUrl).toBe("https://github.com/example/repo/pull/157");
      expect(latestForRun?.status).toBe("completed");
      expect(issueReports).toHaveLength(2);
      expect(timeline[0]?.eventType).toBe("delivery_reported");
      expect(timeline[0]?.message).toBe("Delivery reported as completed.");
      expect(timeline[0]?.payload).toEqual({
        reportId: completedId,
        status: "completed",
        branchName: "symphony/col-157",
        blockingReason: null
      });
    } finally {
      database.close();
    }
  });

  it("fails fast when a delivery report loses its canonical issue row", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-delivery-invalid-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const store = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await recordSeededRunStarted(database.db, runStore, {
        runId: "run-invalid",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-invalid",
        issueIdentifier: "COL-999",
        runMode: "implementation",
        status: "running",
        startedAt: "2026-04-05T17:59:00.000Z"
      });
      const reportId = await store.record({
        reportId: "report-invalid",
        runId: "run-invalid",
        status: "partial",
        summary: "Still working.",
        source: "runtime",
        reportedAt: "2026-04-05T18:05:00.000Z"
      });

      database.client.pragma("foreign_keys = OFF");
      database.client.prepare(`
        delete from symphony_issues
        where issue_identifier = ?
      `).run("COL-999");
      database.client.pragma("foreign_keys = ON");

      await expect(store.fetchLatestForRun("run-invalid")).rejects.toThrow(
        `Issue not found for delivery report ${reportId}: COL-999`
      );
    } finally {
      database.close();
    }
  });

  it("rejects completed delivery reports without a prUrl", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-delivery-prurl-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const store = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      repositoryKey: testRepositoryKey
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await recordSeededRunStarted(database.db, runStore, {
        runId: "run-prurl",
        repositoryKey: testRepositoryKey,
        trackerIssueId: "issue-prurl",
        issueIdentifier: "COL-1000",
        runMode: "implementation",
        status: "running",
        startedAt: "2026-04-05T17:59:00.000Z"
      });

      await expect(
        store.record({
          reportId: "report-prurl",
          runId: "run-prurl",
          status: "completed",
          summary: "Opened the PR.",
          source: "pi",
          reportedAt: "2026-04-05T18:05:00.000Z"
        })
      ).rejects.toThrow("Completed delivery reports require prUrl.");
    } finally {
      database.close();
    }
  });
});
