import { describe, expect, it, vi } from "vitest";
import { createSymphonyCapabilityOperatorService } from "./symphony-capability-operator.js";

describe("Symphony capability operator service", () => {
  it("inspects planner state for intelligent-flow implementation shells", async () => {
    const routeWorkflowStore = {
      listHistory: vi.fn(),
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

    const inspection = await operator.inspectByIssueIdentifier({
      issueIdentifier: "SYM-18",
      recordedAt: "2026-04-14T05:42:00.000Z"
    });

    expect(inspection).toEqual({
      capability: expect.objectContaining({
        workflowId: "workflow-implementation",
        contractId: "contract-implementation",
        planKind: "execute",
        capabilityId: "implement.spec",
        workEpoch: 1
      }),
      pendingClarification: null
    });
    expect(routeWorkflowStore.listHistory).not.toHaveBeenCalled();
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
      listHistory: vi.fn(),
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

    const inspection = await operator.inspectByIssueIdentifier({
      issueIdentifier: "SYM-18",
      recordedAt: "2026-04-14T05:40:00.000Z"
    });

    expect(inspection).toBeNull();
    expect(routeWorkflowStore.listHistory).not.toHaveBeenCalled();
    expect(routeWorkflowStore.getExecutionContract).not.toHaveBeenCalled();
    expect(capabilityPlanning.planByWorkflowId).not.toHaveBeenCalled();
  });

  it("surfaces pre-execution clarification without requiring a contract or planner pass", async () => {
    const routeWorkflowStore = {
      listHistory: vi.fn().mockResolvedValue([
        {
          event: {
            kind: "signal_recorded",
            signal: {
              id: "signal_router_clarification_requested",
              type: "workflow.clarification_requested",
              source: "router",
              occurredAt: "2026-04-15T12:00:00.000Z",
              causationId: null,
              correlationId: "SYM-19",
              payload: {
                workflowId: "workflow-pre-execution",
                requestId: "clarify_workflow_pre_execution",
                raisedByCapabilityId: null,
                workEpoch: 0,
                summary:
                  "Ticket needs more detail before Symphony can derive a valid execution contract.",
                questions: [
                  {
                    id: "done_definition",
                    prompt: "What concrete outcome should count as done for this ticket?",
                    context: null
                  }
                ]
              }
            }
          }
        }
      ]),
      getExecutionContract: vi.fn().mockResolvedValue(null)
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
              workflowId: "workflow-pre-execution"
            },
            snapshot: {
              projection: {
                currentNode: "awaiting_input"
              }
            }
          }
        })
      } as never,
      capabilityPlanning: capabilityPlanning as never
    });

    const inspection = await operator.inspectByIssueIdentifier({
      issueIdentifier: "SYM-19",
      recordedAt: "2026-04-15T12:00:01.000Z"
    });

    expect(inspection).toEqual({
      capability: null,
      pendingClarification: {
        kind: "contract_intake",
        requestId: "clarify_workflow_pre_execution",
        raisedByCapabilityId: null,
        workEpoch: null,
        summary:
          "Ticket needs more detail before Symphony can derive a valid execution contract.",
        nextAction:
          'Update the ticket body to answer the missing question so intake.review can derive the execution contract: "What concrete outcome should count as done for this ticket?" Then move the issue back to Todo to requeue.',
        questions: [
          {
            id: "done_definition",
            prompt: "What concrete outcome should count as done for this ticket?",
            context: null
          }
        ],
        answerPath: null
      }
    });
    expect(routeWorkflowStore.getExecutionContract).toHaveBeenCalledWith(
      "workflow-pre-execution"
    );
    expect(capabilityPlanning.planByWorkflowId).not.toHaveBeenCalled();
  });

  it("prefers planner state over stale pre-execution clarification once intake has persisted a contract", async () => {
    const routeWorkflowStore = {
      listHistory: vi.fn(),
      getExecutionContract: vi.fn().mockResolvedValue({
        issueIdentifier: "SYM-19"
      })
    };
    const capabilityPlanning = {
      planByWorkflowId: vi.fn().mockResolvedValue({
        contract: {
          workflowId: "workflow-requeued",
          contractId: "contract-requeued"
        },
        decision: {
          recordedAt: "2026-04-15T12:05:01.000Z"
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
              workflowId: "workflow-requeued"
            },
            snapshot: {
              projection: {
                currentNode: "claimed"
              }
            }
          }
        })
      } as never,
      capabilityPlanning: capabilityPlanning as never
    });

    const inspection = await operator.inspectByIssueIdentifier({
      issueIdentifier: "SYM-19",
      recordedAt: "2026-04-15T12:05:02.000Z"
    });

    expect(inspection).toEqual({
      capability: expect.objectContaining({
        workflowId: "workflow-requeued",
        contractId: "contract-requeued",
        planKind: "execute",
        capabilityId: "implement.spec",
        workEpoch: 1,
        pendingClarification: null
      }),
      pendingClarification: null
    });
    expect(routeWorkflowStore.listHistory).not.toHaveBeenCalled();
    expect(routeWorkflowStore.getExecutionContract).toHaveBeenCalledWith(
      "workflow-requeued"
    );
    expect(capabilityPlanning.planByWorkflowId).toHaveBeenCalledWith({
      workflowId: "workflow-requeued",
      recordedAt: "2026-04-15T12:05:02.000Z",
      policyId: "default"
    });
  });
});
