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
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import { createRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import { createRuntimeDispatchBootstrapRouter } from "./runtime-dispatch-bootstrap-routing.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { createRuntimeRunLifecycleRouter } from "./runtime-run-lifecycle-routing.js";
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

describe("runtime run lifecycle routing", () => {
  it("records implementation delivery state changes through route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const inProgressIssue = await startImplementationRun(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "In Review");
      const reviewIssue = harness.tracker.getIssue(harness.issue.id);

      const result = await harness.runLifecycleRouter.observeIssueState({
        issue: reviewIssue!,
        runId: "run-1",
        runMode: "implementation",
        recordedAt: "2026-04-10T12:00:10.000Z"
      });

      expect(inProgressIssue.state).toBe("In Progress");
      expect(result.issue.state).toBe("In Review");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "review",
        reasonCode: "delivery_recorded",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes implementation takeover into approved_merge history without dispatching immediately", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await startImplementationRun(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Approved");
      const approvedIssue = harness.tracker.getIssue(harness.issue.id);

      const result = await harness.runLifecycleRouter.observeIssueState({
        issue: approvedIssue!,
        runId: "run-2",
        runMode: "implementation",
        recordedAt: "2026-04-10T12:05:10.000Z"
      });

      expect(result.issue.state).toBe("Approved");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "approved_merge",
        reasonCode: "approved_merge_takeover",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("records approved-merge redispatch when an active merge run observes Approved again", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await startApprovedMergeRun(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Approved");
      const approvedIssue = harness.tracker.getIssue(harness.issue.id);

      const result = await harness.runLifecycleRouter.observeIssueState({
        issue: approvedIssue!,
        runId: "run-approved-merge",
        runMode: "approved_merge",
        recordedAt: "2026-04-10T12:15:10.000Z"
      });

      expect(result.issue.state).toBe("Approved");
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Approved");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "approved_merge",
        reasonCode: "approved_merge_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("fails fast when active observation emits redispatch for a different run mode", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await startApprovedMergeRun(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Approved");
      const approvedIssue = harness.tracker.getIssue(harness.issue.id);

      await expect(
        harness.runLifecycleRouter.observeIssueState({
          issue: approvedIssue!,
          runId: "run-approved-merge",
          runMode: "implementation",
          recordedAt: "2026-04-10T12:15:10.000Z"
        })
      ).rejects.toThrow(
        /only supports run\.dispatch for active run mode implementation/i
      );
    } finally {
      harness.close();
    }
  });

  it("routes blocked implementation completions into Blocked through persisted route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const inProgressIssue = await startImplementationRun(harness);

      const result = await harness.runLifecycleRouter.routeCompletion({
        issue: inProgressIssue,
        runId: "run-3",
        runMode: "implementation",
        completion: {
          kind: "blocked",
          reason: "repository blocker"
        },
        recordedAt: "2026-04-10T12:10:10.000Z"
      });

      expect(result.issue.state).toBe("Blocked");
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "blocked",
        reasonCode: "implementation_blocked",
        assertData(data) {
          expect(data.trackerState).toBe("Blocked");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes approved merge success into Done through persisted route history", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      const inProgressIssue = await startApprovedMergeRun(harness);

      const result = await harness.runLifecycleRouter.routeCompletion({
        issue: inProgressIssue,
        runId: "run-4",
        runMode: "approved_merge",
        completion: {
          kind: "merged"
        },
        recordedAt: "2026-04-10T12:15:10.000Z"
      });

      expect(result.issue.state).toBe("Done");
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "done",
        reasonCode: "merge_completed",
        assertData(data) {
          expect(data.trackerState).toBe("Done");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes startup failures into Failed through persisted route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.dispatchBootstrapRouter.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T12:20:00.000Z"
      });

      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      const result = await harness.runLifecycleRouter.routeCompletion({
        issue: bootstrappingIssue!,
        runId: "run-5",
        runMode: "implementation",
        completion: {
          kind: "startup_failure",
          reason: "activation failed",
          failureStage: "runtime_session_start",
          failureOrigin: "workspace_lifecycle"
        },
        recordedAt: "2026-04-10T12:20:05.000Z"
      });

      expect(result.issue.state).toBe("Failed");
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Failed");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "failed",
        reasonCode: "startup_failure",
        assertData(data) {
          expect(data.lastRuntimeOutcome).toBe("startup_failure");
        }
      });
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo" | "Approved";
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-run-lifecycle-routing-"));
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
    trackerIssueKey: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-10T00:08:59.000Z"
  });

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T12:00:00.000Z")
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T12:00:00.000Z")
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
  const runLifecycleRouter = await createRuntimeRunLifecycleRouter({
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
    runLifecycleRouter,
    close() {
      database.close();
    }
  };
}

async function startImplementationRun(harness: Awaited<ReturnType<typeof createHarness>>) {
  await harness.dispatchBootstrapRouter.route({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt: "2026-04-10T12:00:00.000Z"
  });

  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  const activated = await harness.runStartActivationRouter.activate({
    issue: bootstrappingIssue!,
    runId: "run-implementation",
    runMode: "implementation",
    threadId: "thread-implementation",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T12:00:05.000Z"
  });

  return activated.issue;
}

async function startApprovedMergeRun(harness: Awaited<ReturnType<typeof createHarness>>) {
  await harness.dispatchBootstrapRouter.route({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt: "2026-04-10T12:15:00.000Z"
  });

  const approvedIssue = harness.tracker.getIssue(harness.issue.id);
  const activated = await harness.runStartActivationRouter.activate({
    issue: approvedIssue!,
    runId: "run-approved-merge",
    runMode: "approved_merge",
    threadId: "thread-approved-merge",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T12:15:05.000Z"
  });

  return activated.issue;
}
