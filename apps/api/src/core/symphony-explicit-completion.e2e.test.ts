import { afterEach, describe, expect, it } from "vitest";
import type {
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowPolicy
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
  it("closes intelligent-flow delivery directly into Done", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo",
      presetId: "intelligent-flow"
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    const routed = await harness.service.routeDeliveryReport({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1",
      recordedAt: "2026-04-13T10:12:00.000Z",
      status: "completed"
    });

    expect(routed).toBe(true);
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).not.toBeNull();
    expect(workflowLifecycle?.trackerState).toBe("Done");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("done");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toContain("runtime.delivery_reported");
    expect(signalTypes).not.toContain("capability.completed");
  });
});
