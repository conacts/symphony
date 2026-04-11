import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";

const tempDirectories: string[] = [];
const repositoryKey = "openai/symphony";

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

describe("issue timeline store", () => {
  it("returns an empty list for an existing issue with no timeline entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-timeline-empty-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const timelineStore = createSymphonyIssueTimelineStore(database.db, {
      repositoryKey
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-601",
        trackerIssueId: "tracker-601",
        repositoryKey,
        latestRunStartedAt: null,
        recordedAt: "2026-04-11T04:00:00.000Z"
      });

      await expect(
        timelineStore.listIssueTimeline("SYM-601")
      ).resolves.toEqual([]);
    } finally {
      database.close();
    }
  });

  it("fails fast when timeline rows lose their canonical issue parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-timeline-missing-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const timelineStore = createSymphonyIssueTimelineStore(database.db, {
      repositoryKey
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-602",
        trackerIssueId: "tracker-602",
        repositoryKey,
        latestRunStartedAt: null,
        recordedAt: "2026-04-11T04:05:00.000Z"
      });
      await timelineStore.record({
        issueIdentifier: "SYM-602",
        source: "runtime",
        eventType: "runtime_session_started",
        message: "Started session.",
        recordedAt: "2026-04-11T04:06:00.000Z"
      });

      database.client.pragma("foreign_keys = OFF");
      database.client.prepare(`
        delete from symphony_issues
        where issue_identifier = ?
      `).run("SYM-602");
      database.client.pragma("foreign_keys = ON");

      await expect(
        timelineStore.listIssueTimeline("SYM-602")
      ).rejects.toThrow("Issue timeline issue not found: SYM-602");
    } finally {
      database.close();
    }
  });
});
