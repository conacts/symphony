import { afterEach, describe, expect, it } from "vitest";
import type {
  SymphonyIntelligentFlowData,
  SymphonyIntelligentFlowNode,
  SymphonyIntelligentFlowPolicy
} from "@symphony/router";
import { createSymphonyCapabilityContractIntake } from "./symphony-capability-contract-intake.js";
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

describe("capability progression golden paths", () => {
  it("continues capability-managed implementation into code review without requiring finish", async () => {
    harness = await createRouteLifecycleGoldenPathHarness({
      state: "Todo"
    });
    await advanceWorkflowToRunningImplementation(harness);

    const workflowId = await loadRequiredWorkflowId(harness);
    const intake = createSymphonyCapabilityContractIntake({
      routeWorkflows: harness.routeWorkflows
    });
    await intake.createAndPersistForWorkflow({
      workflowId,
      issue: harness.issue,
      repositoryKey: "openai/symphony",
      recordedAt: "2026-04-13T10:00:29.000Z"
    });

    const inProgressIssue = harness.tracker.getIssue(harness.issue.id);
    if (!inProgressIssue) {
      throw new TypeError(
        `Expected in-progress issue state for ${harness.issue.identifier}.`
      );
    }

    const routed = await harness.service.workflowRoutingAdapter.routeRunCompletion({
      issue: inProgressIssue,
      runId: "run-1",
      runMode: "implementation",
      completion: {
        kind: "delivered"
      },
      recordedAt: "2026-04-13T10:00:30.000Z"
    });

    expect(routed).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "In Progress"
      }),
      continueWithRunMode: "implementation"
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");

    const nextPlanning = await harness.capabilityPlanning.planByWorkflowId({
      workflowId,
      recordedAt: "2026-04-13T10:00:32.000Z"
    });
    expect(nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          workEpoch: 1
        })
      })
    );

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: "run-1"
    });
    expect(workflowLifecycle).not.toBeNull();
    expect(workflowLifecycle?.trackerState).toBe("In Progress");

    const hydration =
      await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyIntelligentFlowNode,
        SymphonyIntelligentFlowData,
        SymphonyIntelligentFlowPolicy
      >(harness.issue.identifier);
    expect(hydration?.snapshot?.projection.currentNode).toBe("active");

    const signalTypes = await listRecordedWorkflowSignalTypes(harness, workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining(["capability.started", "capability.completed"])
    );
    expect(signalTypes).not.toContain("runtime.completed");
  });
});
