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
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import { createRuntimeCurrentFlowSessionLoader } from "./runtime-current-flow-session-loader.js";
import { createRuntimeDispatchBootstrapRouter } from "./runtime-dispatch-bootstrap-routing.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { createRuntimeRunStartActivationRouter } from "./runtime-run-start-activation-routing.js";

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

describe("runtime run-start activation routing", () => {
  it("routes bootstrapping run starts into In Progress through persisted route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.dispatchBootstrapRouter.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T11:00:00.000Z"
      });

      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      expect(bootstrappingIssue?.state).toBe("Bootstrapping");

      const result = await harness.runStartActivationRouter.activate({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T11:00:03.000Z"
      });

      expect(result.issue.state).toBe("In Progress");
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("implementation");
      expect(hydration?.snapshot?.projection.pendingCommands).toEqual([]);
      expect(hydration?.snapshot?.projection.data.lastRunMode).toBe("implementation");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("In Progress");
      expect(hydration?.latestDecision?.reasonCode).toBe("implementation_run_started");
    } finally {
      harness.close();
    }
  });

  it("routes approved merge starts into In Progress through persisted route history", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await harness.dispatchBootstrapRouter.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T11:05:00.000Z"
      });

      const approvedIssue = harness.tracker.getIssue(harness.issue.id);
      expect(approvedIssue?.state).toBe("Approved");

      const result = await harness.runStartActivationRouter.activate({
        issue: approvedIssue!,
        runId: "run-2",
        runMode: "approved_merge",
        threadId: "thread-2",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T11:05:05.000Z"
      });

      expect(result.issue.state).toBe("In Progress");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("approved_merge");
      expect(hydration?.snapshot?.projection.data.lastRunMode).toBe("approved_merge");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("In Progress");
      expect(hydration?.latestDecision?.reasonCode).toBe("approved_merge_started");
    } finally {
      harness.close();
    }
  });

  it("fails when no persisted route workflow exists for the issue", async () => {
    const harness = await createHarness({
      state: "Bootstrapping"
    });

    try {
      await expect(
        harness.runStartActivationRouter.activate({
          issue: harness.issue,
          runId: "run-3",
          runMode: "implementation",
          threadId: "thread-3",
          workerHost: null,
          launchTarget: null,
          recordedAt: "2026-04-10T11:10:00.000Z"
        })
      ).rejects.toThrow("could not be resumed");
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo" | "Approved" | "Bootstrapping";
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-run-start-activation-"));
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

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T11:00:00.000Z")
  });
  const sessionLoader = await createRuntimeCurrentFlowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T11:00:00.000Z")
  });
  const dispatchBootstrapRouter = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey: "openai/symphony",
    routing,
    sessionLoader
  });
  const runStartActivationRouter = await createRuntimeRunStartActivationRouter({
    routeWorkflows,
    tracker,
    sessionLoader
  });

  return {
    issue,
    tracker,
    routeWorkflows,
    dispatchBootstrapRouter,
    runStartActivationRouter,
    close() {
      database.close();
    }
  };
}
