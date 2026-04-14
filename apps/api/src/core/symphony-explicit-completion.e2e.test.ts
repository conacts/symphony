import { afterEach, describe, expect, it } from "vitest";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import {
  advanceWorkflowToRunningImplementation,
  createRouteLifecycleGoldenPathHarness,
  listRecordedWorkflowSignalTypes,
  loadRequiredWorkflowId,
  type RouteLifecycleGoldenPathHarness
} from "../test-support/runtime-route-lifecycle-golden-path-harness.js";

let harness: RouteLifecycleGoldenPathHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("explicit completion golden paths", () => {
  it("moves non-capability-managed implementation into In Review after valid finish-style delivery reporting", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo"
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    const routed = await harness.service.routeDeliveryReport({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1",
      recordedAt: "2026-04-13T10:10:00.000Z",
      status: "completed"
    });

    expect(routed).toBe(true);
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Review");

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).not.toBeNull();
    expect(workflowLifecycle?.trackerState).toBe("In Review");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("review");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toContain("runtime.delivery_reported");
    expect(signalTypes).not.toContain("capability.completed");
  });
});
