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
import { createRuntimeCurrentFlowRouting } from "./runtime-current-flow-routing.js";
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
  it("creates a route workflow on first tracker-state observation", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.tracker.updateIssueState(harness.issue.id, "In Review");

      const observed = await harness.service.observeTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T13:59:59.000Z"
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

  it("observes non-running rework state changes through route history and requests dispatch", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Rework");
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:15.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "rework"
        }
      ]);

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("bootstrapping");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("Bootstrapping");
      expect(hydration?.snapshot?.projection.data.lastDispatchMode).toBe("rework");
    } finally {
      harness.close();
    }
  });

  it("observes non-running tracker states in batch before dispatch", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observedCount = await harness.service.observeNonRunningTrackerStates({
        claimedIssueIds: [],
        recordedAt: "2026-04-10T14:00:12.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observedCount).toBe(1);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("bootstrapping");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("Bootstrapping");
      expect(hydration?.snapshot?.projection.data.lastDispatchMode).toBe(
        "implementation"
      );
    } finally {
      harness.close();
    }
  });

  it("skips unchanged non-running tracker states that are already reflected in route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);

      const before = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      const observedCount = await harness.service.observeNonRunningTrackerStates({
        claimedIssueIds: [],
        recordedAt: "2026-04-10T14:00:11.000Z",
        onDispatchRequested: async () => {}
      });
      const after = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);

      expect(observedCount).toBe(0);
      expect(after?.snapshot?.eventSequence).toBe(before?.snapshot?.eventSequence ?? null);
      expect(after?.snapshot?.projection.currentNode).toBe("review");
      expect(after?.snapshot?.projection.data.trackerState).toBe("In Review");
    } finally {
      harness.close();
    }
  });

  it("skips claimed issues during non-running tracker observation", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const observedCount = await harness.service.observeNonRunningTrackerStates({
        claimedIssueIds: [harness.issue.id],
        recordedAt: "2026-04-10T14:00:12.000Z",
        onDispatchRequested: async () => {}
      });

      expect(observedCount).toBe(0);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Todo");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration).toBeNull();
    } finally {
      harness.close();
    }
  });

  it("fails fast when non-running observation emits run.dispatch without a callback", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Rework");

      await expect(
        harness.service.observeTrackerStateByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-10T14:00:20.000Z"
        })
      ).rejects.toThrow(/run\.dispatch without a dispatch callback/i);

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
    } finally {
      harness.close();
    }
  });

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

  it("returns false when the tracked issue can no longer be loaded", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.dispatchBootstrapRouter.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:06:00.000Z"
      });

      const missingTracker = createMemorySymphonyTracker();
      const missingIssueService = await createRuntimeRouteLifecycleService({
        routeWorkflows: harness.routeWorkflows,
        tracker: missingTracker,
        trackerConfig: buildSymphonyRuntimePolicy().tracker,
        repositoryKey: "openai/symphony",
        now: () => new Date("2026-04-10T14:06:00.000Z")
      });

      const observed = await missingIssueService.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:06:05.000Z"
      });

      expect(observed).toBe(false);
    } finally {
      harness.close();
    }
  });

  it("routes delivery reports through route history for active implementation runs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);

      const routed = await harness.service.routeDeliveryReport({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:00.000Z",
        status: "completed"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Review");

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

  it("routes blocked delivery reports through route history for active implementation runs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);

      const routed = await harness.service.routeDeliveryReport({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:10.000Z",
        status: "blocked"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("blocked");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("Blocked");
    } finally {
      harness.close();
    }
  });

  it("fails fast when a persisted workflow has no active run mode", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const routing = await createRuntimeCurrentFlowRouting({
        trackerConfig: buildSymphonyRuntimePolicy().tracker,
        now: () => new Date("2026-04-10T14:10:00.000Z")
      });

      await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        router: routing.router,
        createdAt: "2026-04-10T14:10:00.000Z"
      });

      await expect(
        harness.service.observeActiveIssueStateByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-10T14:10:05.000Z"
        })
      ).rejects.toThrow(/missing an active run mode/i);
    } finally {
      harness.close();
    }
  });

  it("routes shutdown pauses through route history for active runs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.dispatchBootstrapRouter.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:20:00.000Z"
      });
      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      await harness.service.runStartActivationRouter.activate({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:20:05.000Z"
      });

      const routed = await harness.service.routeShutdownPause({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        runMode: "implementation",
        recordedAt: "2026-04-10T14:20:10.000Z",
        reason: "runtime_shutdown"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("paused");
      expect(hydration?.snapshot?.projection.data.trackerState).toBe("Paused");
    } finally {
      harness.close();
    }
  });

  it("fails fast when current-flow tracker state contracts do not match the router", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const trackerConfig = {
        ...buildSymphonyRuntimePolicy().tracker,
        startupFailureTransitionToState: "Startup Failed"
      };

      await expect(
        createRuntimeRouteLifecycleService({
          routeWorkflows: harness.routeWorkflows,
          tracker: harness.tracker,
          trackerConfig,
          repositoryKey: "openai/symphony",
          now: () => new Date("2026-04-10T14:25:00.000Z")
        })
      ).rejects.toThrow(/startupFailureTransitionToState/i);
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

async function advanceWorkflowToReview(harness: Awaited<ReturnType<typeof createHarness>>) {
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
  await harness.service.observeActiveIssueStateByIdentifier({
    issueIdentifier: harness.issue.identifier,
    recordedAt: "2026-04-10T14:00:10.000Z"
  });
}

async function advanceWorkflowToRunningImplementation(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await harness.service.dispatchBootstrapRouter.route({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt: "2026-04-10T14:11:00.000Z"
  });
  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  await harness.service.runStartActivationRouter.activate({
    issue: bootstrappingIssue!,
    runId: "run-1",
    runMode: "implementation",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T14:11:05.000Z"
  });
}
