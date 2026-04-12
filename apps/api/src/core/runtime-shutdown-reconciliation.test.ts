import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueStore,
  createSymphonyIssueTimelineStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  buildSymphonyRunStartAttrs,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import { createRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { reconcilePersistedActiveRunsOnShutdown } from "./runtime-shutdown-reconciliation.js";
import { createDefaultRuntimeWorkflowPresetSelection } from "./runtime-workflow-preset-selection.js";

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

describe("runtime shutdown reconciliation", () => {
  it("routes persisted active runs into paused workflow history during shutdown", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-shutdown-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const issueStore = createSymphonyIssueStore(database.db);
    const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
      repositoryKey: "openai/symphony"
    });
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db,
      timelineStore: issueTimelineStore
    });
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const issue = buildSymphonyTrackerIssue({
      state: "Todo"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    try {
      await issueStore.upsert({
        issueIdentifier: issue.identifier,
        trackerIssueId: issue.id,
        repositoryKey: "openai/symphony",
        latestRunStartedAt: null,
        recordedAt: "2026-04-10T00:06:59.000Z"
      });

      const routeLifecycle = await createRuntimeRouteLifecycleService({
        routeWorkflows,
        tracker,
        trackerConfig: runtimePolicy.tracker,
        repositoryKey: "openai/symphony",
        presetSelection: createDefaultRuntimeWorkflowPresetSelection(),
        now: () => new Date("2026-04-10T14:30:00.000Z")
      });

      await routeLifecycle.workflowRoutingAdapter.routeDispatchBootstrap({
        issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:30:00.000Z"
      });
      const bootstrappingIssue = tracker.getIssue(issue.id);
      await routeLifecycle.workflowRoutingAdapter.activateRunStart({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:30:05.000Z"
      });

      await runStore.recordRunStarted(
        buildSymphonyRunStartAttrs({
          repositoryKey: "openai/symphony",
          trackerIssueId: issue.id,
          issueIdentifier: issue.identifier,
          runId: "run-1",
          runMode: "implementation",
          status: "running",
          startedAt: "2026-04-10T14:30:05.000Z"
        })
      );

      const reconciled = await reconcilePersistedActiveRunsOnShutdown({
        database,
        tracker,
        runtimePolicy,
        runStore,
        routeLifecycle,
        shutdownReason: "runtime_shutdown"
      });

      expect(reconciled).toBe(1);
      expect(tracker.getIssue(issue.id)?.state).toBe("Paused");

      await expectRouteWorkflowAuthorityProof({
        routeWorkflows,
        issueIdentifier: issue.identifier,
        currentNode: "paused",
        reasonCode: "implementation_shutdown_paused",
        signalType: "runtime.shutdown_requested"
      });

      const issueTimeline = await issueTimelineStore.listIssueTimeline(
        issue.identifier,
        {
          limit: 20
        }
      );
      expect(issueTimeline.map((entry) => entry.eventType)).toEqual(
        expect.arrayContaining(["runtime_shutdown_reconciled"])
      );
    } finally {
      database.close();
    }
  });
});
