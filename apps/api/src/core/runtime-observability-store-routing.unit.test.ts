import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  createRepositoryAwareIssueTimelineStore,
  createRepositoryAwareRuntimeLogStore
} from "./runtime-observability-store-routing.js";

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

describe("runtime observability store routing", () => {
  it("routes issue timeline writes through the canonical issue repository", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-runtime-observability-timeline-")
    );
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        trackerIssueKey: "COL-801",
        trackerIssueId: "tracker-col-801",
        repositoryKey: "conacts/coldets-v2",
        latestRunStartedAt: null,
        recordedAt: "2026-04-12T22:20:00.000Z"
      });

      const timelineStore = createRepositoryAwareIssueTimelineStore({
        db: database.db,
        issueStore,
        defaultRepositoryKey: "conacts/symphony"
      });

      await timelineStore.record({
        trackerIssueId: "tracker-col-801",
        trackerIssueKey: "COL-801",
        source: "runtime",
        eventType: "runtime_session_started",
        message: "Started session.",
        recordedAt: "2026-04-12T22:20:01.000Z"
      });

      await expect(
        timelineStore.listIssueTimeline("COL-801")
      ).resolves.toEqual([
        expect.objectContaining({
          trackerIssueKey: "COL-801",
          trackerIssueId: "tracker-col-801",
          repositoryKey: "conacts/coldets-v2",
          eventType: "runtime_session_started"
        })
      ]);
    } finally {
      database.close();
    }
  });

  it("routes issue-scoped runtime logs by repository and aggregates unscoped reads", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-runtime-observability-logs-")
    );
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        trackerIssueKey: "COL-802",
        trackerIssueId: "tracker-col-802",
        repositoryKey: "conacts/coldets-v2",
        latestRunStartedAt: null,
        recordedAt: "2026-04-12T22:21:00.000Z"
      });

      const runtimeLogStore = createRepositoryAwareRuntimeLogStore({
        db: database.db,
        issueStore,
        defaultRepositoryKey: "conacts/symphony",
        repositoryKeys: ["conacts/symphony", "conacts/coldets-v2"]
      });

      await runtimeLogStore.record({
        level: "info",
        source: "runtime",
        eventType: "runtime_bootstrap_completed",
        message: "Bootstrap completed.",
        recordedAt: "2026-04-12T22:21:01.000Z"
      });
      await runtimeLogStore.record({
        level: "info",
        source: "tracker_state_ingress",
        eventType: "tracker_state_ingress_observed",
        message: "Observed tracker state.",
        trackerIssueId: "tracker-col-802",
        trackerIssueKey: "COL-802",
        recordedAt: "2026-04-12T22:21:02.000Z"
      });

      await expect(
        runtimeLogStore.list({
          trackerIssueKey: "COL-802"
        })
      ).resolves.toEqual([
        expect.objectContaining({
          trackerIssueKey: "COL-802",
          trackerIssueId: "tracker-col-802",
          repositoryKey: "conacts/coldets-v2",
          eventType: "tracker_state_ingress_observed"
        })
      ]);

      await expect(runtimeLogStore.list()).resolves.toEqual([
        expect.objectContaining({
          repositoryKey: "conacts/coldets-v2",
          trackerIssueKey: "COL-802",
          eventType: "tracker_state_ingress_observed"
        }),
        expect.objectContaining({
          repositoryKey: "conacts/symphony",
          trackerIssueKey: null,
          eventType: "runtime_bootstrap_completed"
        })
      ]);

      await expect(
        runtimeLogStore.list({
          repo: "conacts/coldets-v2"
        })
      ).resolves.toEqual([
        expect.objectContaining({
          repositoryKey: "conacts/coldets-v2",
          trackerIssueKey: "COL-802",
          eventType: "tracker_state_ingress_observed"
        })
      ]);
    } finally {
      database.close();
    }
  });

  it("routes tracker-issue-scoped runtime log writes through the canonical issue repository", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "symphony-runtime-observability-tracker-issue-")
    );
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);

    try {
      await issueStore.upsert({
        trackerIssueKey: "COL-803",
        trackerIssueId: "tracker-col-803",
        repositoryKey: "conacts/coldets-v2",
        latestRunStartedAt: null,
        recordedAt: "2026-04-12T22:22:00.000Z"
      });

      const runtimeLogStore = createRepositoryAwareRuntimeLogStore({
        db: database.db,
        issueStore,
        defaultRepositoryKey: "conacts/symphony",
        repositoryKeys: ["conacts/symphony", "conacts/coldets-v2"]
      });

      await runtimeLogStore.record({
        level: "info",
        source: "runtime",
        eventType: "runtime_issue_reconciled",
        message: "Reconciled runtime issue.",
        trackerIssueId: "tracker-col-803",
        recordedAt: "2026-04-12T22:22:01.000Z"
      });

      await expect(runtimeLogStore.list()).resolves.toEqual([
        expect.objectContaining({
          repositoryKey: "conacts/coldets-v2",
          trackerIssueKey: "COL-803",
          trackerIssueId: "tracker-col-803",
          eventType: "runtime_issue_reconciled"
        })
      ]);
    } finally {
      database.close();
    }
  });
});
