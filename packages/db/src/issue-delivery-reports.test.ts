import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSymphonyIssueDeliveryReportStore } from "./issue-delivery-reports.js";

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

describe("issue delivery report store", () => {
  it("records delivery reports and returns latest projections for the issue and run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-delivery-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const timelineStore = createSymphonyIssueTimelineStore(database.db);
    const store = createSymphonyIssueDeliveryReportStore({
      db: database.db,
      timelineStore
    });

    try {
      await store.record({
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        runId: "run-1",
        status: "blocked",
        summary: "Blocked on auth.",
        blockingReason: "Missing OpenRouter credentials.",
        reportedAt: "2026-04-05T18:00:00.000Z"
      });
      const completedId = await store.record({
        issueId: "issue-1",
        issueIdentifier: "COL-157",
        runId: "run-1",
        turnId: "turn-2",
        status: "completed",
        summary: "Opened the PR.",
        prUrl: "https://github.com/example/repo/pull/157",
        prNumber: "157",
        branchName: "codex/col-157",
        testsSummary: "pnpm verify:precommit",
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
    } finally {
      database.close();
    }
  });
});
