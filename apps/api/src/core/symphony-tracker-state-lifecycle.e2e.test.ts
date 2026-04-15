import { afterEach, describe, expect, it } from "vitest";
import type {
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowPolicy
} from "@symphony/router";
import {
  expectRouteWorkflowAuthorityProof
} from "../test-support/route-workflow-authority-test-support.js";
import {
  createRouteLifecycleGoldenPathHarness,
  loadRequiredWorkflowId,
  type RouteLifecycleGoldenPathHarness
} from "../test-support/runtime-route-lifecycle-golden-path-harness.js";

let harness: RouteLifecycleGoldenPathHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("tracker state lifecycle golden paths", () => {
  it("transitions Todo work through Bootstrapping, In Progress, and Done", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      presetId: "intelligent-flow"
    });

    const claimed = await claimTodoWork(harness, "2026-04-15T09:00:00.000Z");
    const workflowId = await loadRequiredWorkflowId(harness);

    expect(claimed.dispatchRequests).toEqual([
      {
        workflowId,
        issueState: "Bootstrapping",
        runMode: "implementation"
      }
    ]);
    expect(claimed.observation).toEqual({
      issueIdentifier: harness.issue.identifier,
      observedTrackerState: "Todo",
      workflowTrackerState: "Bootstrapping",
      observed: true,
      disposition: "observed"
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
    expect(
      await harness.service.loadWorkflowLifecycleView({
        issueIdentifier: harness.issue.identifier
      })
    ).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "Bootstrapping"
      })
    );

    await expectRouteWorkflowAuthorityProof<
      SymphonyIntelligentFlowNode,
      SymphonyIntelligentFlowData,
      SymphonyIntelligentFlowPolicy
    >({
      routeWorkflows: harness.routeWorkflows,
      issueIdentifier: harness.issue.identifier,
      currentNode: "claimed",
      reasonCode: "queued_claimed_from_todo",
      signalType: "tracker.state_observed",
      assertData(data) {
        expect(data.trackerState).toBe("Bootstrapping");
      }
    });

    const inProgressIssue = await activateImplementationRun(
      harness,
      "2026-04-15T09:00:05.000Z"
    );

    expect(inProgressIssue.state).toBe("In Progress");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");
    expect(
      await harness.service.loadWorkflowLifecycleView({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1"
      })
    ).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "In Progress"
      })
    );

    await expectRouteWorkflowAuthorityProof<
      SymphonyIntelligentFlowNode,
      SymphonyIntelligentFlowData,
      SymphonyIntelligentFlowPolicy
    >({
      routeWorkflows: harness.routeWorkflows,
      issueIdentifier: harness.issue.identifier,
      currentNode: "active",
      reasonCode: "active_run_started",
      signalType: "runtime.run_started",
      assertData(data) {
        expect(data.trackerState).toBe("In Progress");
      }
    });

    const completed = await harness.service.routeDeliveryReport({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1",
      recordedAt: "2026-04-15T09:00:10.000Z",
      status: "completed"
    });

    expect(completed).toBe(true);
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");
    expect(
      await harness.service.loadWorkflowLifecycleView({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1"
      })
    ).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "Done"
      })
    );

    await expectRouteWorkflowAuthorityProof<
      SymphonyIntelligentFlowNode,
      SymphonyIntelligentFlowData,
      SymphonyIntelligentFlowPolicy
    >({
      routeWorkflows: harness.routeWorkflows,
      issueIdentifier: harness.issue.identifier,
      currentNode: "done",
      reasonCode: "active_runtime_delivered",
      signalType: "runtime.completed",
      assertData(data) {
        expect(data.trackerState).toBe("Done");
      }
    });
  });

  it("transitions active work into Paused when shutdown is requested", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      presetId: "intelligent-flow"
    });

    await claimTodoWork(harness, "2026-04-15T09:10:00.000Z");
    await activateImplementationRun(harness, "2026-04-15T09:10:05.000Z");

    const routed = await harness.service.routeShutdownPause({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1",
      runMode: "implementation",
      recordedAt: "2026-04-15T09:10:10.000Z",
      reason: "Symphony runtime shut down while implementation was active."
    });
    const workflowId = await loadRequiredWorkflowId(harness);

    expect(routed).toBe(true);
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");
    expect(
      await harness.service.loadWorkflowLifecycleView({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1"
      })
    ).toEqual(
      expect.objectContaining({
        workflowId,
        trackerState: "Paused"
      })
    );

    await expectRouteWorkflowAuthorityProof<
      SymphonyIntelligentFlowNode,
      SymphonyIntelligentFlowData,
      SymphonyIntelligentFlowPolicy
    >({
      routeWorkflows: harness.routeWorkflows,
      issueIdentifier: harness.issue.identifier,
      currentNode: "paused",
      reasonCode: "active_shutdown_paused",
      signalType: "runtime.shutdown_requested",
      assertData(data) {
        expect(data.trackerState).toBe("Paused");
      }
    });
  });
});

async function claimTodoWork(
  harness: RouteLifecycleGoldenPathHarness,
  recordedAt: string
) {
  const dispatchRequests: Array<{
    workflowId: string;
    issueState: string;
    runMode: string;
  }> = [];
  const observation =
    await harness.service.observeNonRunningTrackerStateByIdentifier({
      issueIdentifier: harness.issue.identifier,
      recordedAt,
      onDispatchRequested(input) {
        dispatchRequests.push({
          workflowId: input.workflowId,
          issueState: input.trackerIssue.state,
          runMode: input.runMode
        });
      }
    });

  if (!observation) {
    throw new TypeError(
      `Expected tracker ingress observation for ${harness.issue.identifier}.`
    );
  }

  return {
    observation,
    dispatchRequests
  };
}

async function activateImplementationRun(
  harness: RouteLifecycleGoldenPathHarness,
  recordedAt: string
) {
  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  if (!bootstrappingIssue) {
    throw new TypeError(
      `Expected bootstrapping issue state for ${harness.issue.identifier}.`
    );
  }

  const activated = await harness.service.workflowRoutingAdapter.activateRunStart({
    issue: bootstrappingIssue,
    runId: "run-1",
    runMode: "implementation",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt
  });

  return activated.issue;
}
