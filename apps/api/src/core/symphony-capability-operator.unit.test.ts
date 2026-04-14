import { describe, expect, it, vi } from "vitest";
import { createSymphonyCapabilityOperatorService } from "./symphony-capability-operator.js";

describe("Symphony capability operator service", () => {
  it("inspects planner state for current-flow implementation shells", async () => {
    const routeWorkflowStore = {
      getExecutionContract: vi.fn().mockResolvedValue({
        issueIdentifier: "SYM-18"
      })
    };
    const capabilityPlanning = {
      planByWorkflowId: vi.fn().mockResolvedValue({
        contract: {
          workflowId: "workflow-implementation",
          contractId: "contract-implementation"
        },
        decision: {
          recordedAt: "2026-04-14T05:41:00.000Z"
        },
        plan: {
          kind: "execute",
          decision: {
            capabilityId: "implement.spec",
            modelProfileId: "default",
            workEpoch: 1
          }
        }
      })
    };
    const operator = createSymphonyCapabilityOperatorService({
      routeWorkflowStore: routeWorkflowStore as never,
      routeWorkflows: {} as never,
      sessionLoader: {
        loadHydrationByIssueIdentifier: vi.fn().mockResolvedValue({
          hydrationState: {
            workflow: {
              workflowId: "workflow-implementation"
            },
            snapshot: {
              projection: {
                currentNode: "implementation"
              }
            }
          }
        })
      } as never,
      capabilityPlanning: capabilityPlanning as never
    });

    const capability = await operator.inspectByIssueIdentifier({
      issueIdentifier: "SYM-18",
      recordedAt: "2026-04-14T05:42:00.000Z"
    });

    expect(capability).toEqual(
      expect.objectContaining({
        workflowId: "workflow-implementation",
        contractId: "contract-implementation",
        planKind: "execute",
        capabilityId: "implement.spec",
        workEpoch: 1
      })
    );
    expect(routeWorkflowStore.getExecutionContract).toHaveBeenCalledWith(
      "workflow-implementation"
    );
    expect(capabilityPlanning.planByWorkflowId).toHaveBeenCalledWith({
      workflowId: "workflow-implementation",
      recordedAt: "2026-04-14T05:42:00.000Z",
      policyId: "default"
    });
  });

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
