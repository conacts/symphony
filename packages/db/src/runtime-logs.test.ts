import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSymphonyRuntimeLogStore } from "./runtime-logs.js";

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

describe("runtime log store", () => {
  it("fails fast when recording against a missing canonical issue parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-logs-record-missing-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
      repositoryKey
    });

    try {
      await expect(
        runtimeLogStore.record({
          level: "info",
          source: "runtime",
          eventType: "runtime_session_started",
          message: "Started session.",
          issueIdentifier: "SYM-700",
          recordedAt: "2026-04-11T04:09:00.000Z"
        })
      ).rejects.toThrow("Runtime log issue not found: SYM-700");
    } finally {
      database.close();
    }
  });

  it("fails fast when recording against an issue bound to another repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-logs-record-repo-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
      repositoryKey
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-700R",
        trackerIssueId: "tracker-700R",
        repositoryKey: "other/repo",
        latestRunStartedAt: null,
        recordedAt: "2026-04-11T04:09:30.000Z"
      });

      await expect(
        runtimeLogStore.record({
          level: "info",
          source: "runtime",
          eventType: "runtime_session_started",
          message: "Started session.",
          issueIdentifier: "SYM-700R",
          recordedAt: "2026-04-11T04:09:31.000Z"
        })
      ).rejects.toThrow(
        "Runtime log repository mismatch for SYM-700R: other/repo is not openai/symphony."
      );
    } finally {
      database.close();
    }
  });

  it("loads tracker issue ids from the canonical issue parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-logs-parent-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
      repositoryKey
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-701",
        trackerIssueId: "tracker-701",
        repositoryKey,
        latestRunStartedAt: null,
        recordedAt: "2026-04-11T04:10:00.000Z"
      });
      await runtimeLogStore.record({
        level: "info",
        source: "runtime",
        eventType: "runtime_session_started",
        message: "Started session.",
        issueIdentifier: "SYM-701",
        recordedAt: "2026-04-11T04:11:00.000Z"
      });

      await expect(
        runtimeLogStore.list({
          issueIdentifier: "SYM-701"
        })
      ).resolves.toEqual([
        expect.objectContaining({
          issueIdentifier: "SYM-701",
          trackerIssueId: "tracker-701",
          repositoryKey,
          eventType: "runtime_session_started"
        })
      ]);
    } finally {
      database.close();
    }
  });

  it("fails fast when runtime logs lose their canonical issue parent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-logs-missing-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
      repositoryKey
    });

    try {
      await issueStore.upsert({
        issueIdentifier: "SYM-702",
        trackerIssueId: "tracker-702",
        repositoryKey,
        latestRunStartedAt: null,
        recordedAt: "2026-04-11T04:15:00.000Z"
      });
      const entryId = await runtimeLogStore.record({
        level: "warn",
        source: "runtime",
        eventType: "runtime_session_failed",
        message: "Failed session.",
        issueIdentifier: "SYM-702",
        recordedAt: "2026-04-11T04:16:00.000Z"
      });

      database.client.pragma("foreign_keys = OFF");
      database.client.prepare(`
        delete from symphony_issues
        where issue_identifier = ?
      `).run("SYM-702");
      database.client.pragma("foreign_keys = ON");

      await expect(
        runtimeLogStore.list({
          issueIdentifier: "SYM-702"
        })
      ).rejects.toThrow(
        `Runtime log issue not found for ${entryId}: SYM-702`
      );
    } finally {
      database.close();
    }
  });
});
