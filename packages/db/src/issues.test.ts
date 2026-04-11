import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueStore } from "./issues.js";

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

describe("issue store", () => {
  it("records canonical issue identity and only advances latest run timestamps forward", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:00:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:05:00.000Z",
        recordedAt: "2026-04-10T04:06:00.000Z"
      });

      await issueStore.upsert({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:04:00.000Z",
        recordedAt: "2026-04-10T04:07:00.000Z"
      });

      const row = database.client.prepare(`
        select
          issue_identifier as issueIdentifier,
          tracker_issue_id as trackerIssueId,
          repository_key as repositoryKey,
          latest_run_started_at as latestRunStartedAt,
          inserted_at as insertedAt,
          updated_at as updatedAt
        from symphony_issues
        where issue_identifier = ?
      `).get("SYM-500") as {
        issueIdentifier: string;
        trackerIssueId: string;
        repositoryKey: string;
        latestRunStartedAt: string | null;
        insertedAt: string;
        updatedAt: string;
      };

      expect(row).toEqual({
        issueIdentifier: "SYM-500",
        trackerIssueId: "tracker-500",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: "2026-04-10T04:05:00.000Z",
        insertedAt: "2026-04-10T04:00:00.000Z",
        updatedAt: "2026-04-10T04:07:00.000Z"
      });
    } finally {
      database.close();
    }
  });

  it("rejects rebinding an issue to a different repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-repository-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-501",
        trackerIssueId: "tracker-501",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:10:00.000Z"
      });

      await expect(
        issueStore.upsert({
          issueIdentifier: "SYM-501",
          trackerIssueId: "tracker-501",
          repositoryKey: "openai/other-repo",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T04:11:00.000Z"
        })
      ).rejects.toThrow(
        "Issue SYM-501 is already bound to repository openai/symphony, not openai/other-repo."
      );
    } finally {
      database.close();
    }
  });

  it("rejects rebinding an issue to a different tracker issue id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-issue-store-tracker-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-502",
        trackerIssueId: "tracker-502",
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T04:20:00.000Z"
      });

      await expect(
        issueStore.upsert({
          issueIdentifier: "SYM-502",
          trackerIssueId: "tracker-502B",
          repositoryKey: "openai/symphony",
          latestRunStartedAt: null,
          recordedAt: "2026-04-10T04:21:00.000Z"
        })
      ).rejects.toThrow(
        "Issue SYM-502 is already bound to tracker issue tracker-502, not tracker-502B."
      );
    } finally {
      database.close();
    }
  });
});
