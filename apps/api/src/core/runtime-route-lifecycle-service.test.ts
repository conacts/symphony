import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import { buildSymphonyRuntimePolicy, buildSymphonyTrackerIssue } from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { createRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";

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

describe("runtime route lifecycle service", () => {
  it("observes active issue state changes by identifier through route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.dispatchBootstrapRouter.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:00:00.000Z"
      });
      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      await harness.service.runStartActivationRouter.activate({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:00:05.000Z"
      });

      await harness.tracker.updateIssueState(harness.issue.id, "In Review");
      const observed = await harness.service.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:10.000Z"
      });

      expect(observed).toBe(true);

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("review");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("In Review");
    } finally {
      harness.close();
    }
  });

  it("returns false when no route workflow exists for the issue", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const observed = await harness.service.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:05:00.000Z"
      });

      expect(observed).toBe(false);
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo";
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-route-lifecycle-service-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const issue = buildSymphonyTrackerIssue({
    state: input.state
  });
  const tracker = createMemorySymphonyTracker([issue]);

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony"
  });

  const service = await createRuntimeRouteLifecycleService({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey: "openai/symphony",
    now: () => new Date("2026-04-10T14:00:00.000Z")
  });

  return {
    issue,
    tracker,
    routeWorkflows,
    service,
    close() {
      database.close();
    }
  };
}
