import { describe, expect, it, vi } from "vitest";
import { createSymphonyCapabilityOperatorService } from "./symphony-capability-operator.js";

describe("Symphony capability operator service", () => {
  it("returns null without invoking planning when the workflow shell is paused", async () => {
    const routeWorkflowStore = {
      getExecutionContract: vi.fn()
    };
    const capabilityPlanning = {
      planByWorkflowId: vi.fn()
    };
    const operator = createSymphonyCapabilityOperatorService({
      routeWorkflowStore: routeWorkflowStore as never,
      routeWorkflows: {} as never,
      sessionLoader: {
        loadHydrationByIssueIdentifier: vi.fn().mockResolvedValue({
          hydrationState: {
            workflow: {
              workflowId: "workflow-paused"
            },
            snapshot: {
              projection: {
                currentNode: "paused"
              }
            }
          }
        })
      } as never,
      capabilityPlanning: capabilityPlanning as never
    });

    const capability = await operator.inspectByIssueIdentifier({
      issueIdentifier: "SYM-18",
      recordedAt: "2026-04-14T05:40:00.000Z"
    });

    expect(capability).toBeNull();
    expect(routeWorkflowStore.getExecutionContract).not.toHaveBeenCalled();
    expect(capabilityPlanning.planByWorkflowId).not.toHaveBeenCalled();
  });
});
