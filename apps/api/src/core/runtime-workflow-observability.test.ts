import { describe, expect, it, vi } from "vitest";
import type {
  RouteDecisionRecord,
  RouteHistoryEventRecord,
  RouteProjectionSnapshotRecord,
  RouteWorkflowRecord,
  RouteWorkflowStore
} from "@symphony/db";
import { createRuntimeWorkflowObservabilityService } from "./runtime-workflow-observability.js";
import type {
  SymphonyRuntimeCapabilityOperatorPort,
  SymphonyRuntimeWorkflowReadPort
} from "./runtime-app-types.js";

describe("runtime workflow observability", () => {
  it("builds an issue-scoped observability view with settled commands", async () => {
    const workflow = buildWorkflowRecord();
    const history = buildHistory();
    const decisions = buildDecisions();
    const snapshot = buildSnapshot();
    const routeWorkflowStore = createRouteWorkflowStoreStub({
      getWorkflowForIssue: vi.fn().mockResolvedValue(workflow),
      getWorkflowForScopedIssue: vi.fn().mockResolvedValue(null),
      getWorkflow: vi.fn().mockResolvedValue(null),
      listHistory: vi.fn().mockResolvedValue(history),
      listDecisions: vi.fn().mockResolvedValue(decisions),
      getLatestSnapshot: vi.fn().mockResolvedValue(snapshot)
    });
    const workflowRead: SymphonyRuntimeWorkflowReadPort = {
      loadWorkflowLifecycleView: vi.fn().mockResolvedValue({
        workflowId: workflow.workflowId,
        trackerState: "In Progress",
        latestReworkHandoff: null,
        latestMergeResult: null
      })
    };
    const capabilityOperator: SymphonyRuntimeCapabilityOperatorPort = {
      inspectByIssueIdentifier: vi.fn().mockResolvedValue({
        workflowId: workflow.workflowId,
        contractId: "contract-1",
        policyId: "default",
        planKind: "execute",
        summary: "Next capability execution is implement.spec.",
        decidedAt: "2026-04-13T19:00:03.000Z",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 2,
        pendingClarification: null,
        completion: null
      }),
      answerPendingClarificationByWorkflowId: vi.fn()
    };
    const service = createRuntimeWorkflowObservabilityService({
      routeWorkflowStore,
      workflowRead,
      capabilityOperator
    });

    const result = await service.loadByIssueIdentifier({
      issueIdentifier: workflow.issueIdentifier,
      recordedAt: "2026-04-13T19:00:04.000Z",
      historyLimit: 10,
      decisionLimit: 5
    });

    expect(result?.workflow.workflowId).toBe(workflow.workflowId);
    expect(result?.trackerState).toBe("In Progress");
    expect(result?.capability?.planKind).toBe("execute");
    expect(result?.snapshot?.pendingCommandCount).toBe(1);
    expect(result?.replay.recordedDecisionCount).toBe(1);
    expect(result?.history).toHaveLength(4);
    expect(result?.decisions[0]?.commands[0]?.settled).toEqual({
      eventId: "event_4",
      eventSequence: 4,
      recordedAt: "2026-04-13T19:00:03.000Z",
      status: "succeeded",
      payload: {
        accepted: true
      }
    });
    expect(workflowRead.loadWorkflowLifecycleView).toHaveBeenCalledWith({
      issueIdentifier: workflow.issueIdentifier
    });
    expect(capabilityOperator.inspectByIssueIdentifier).toHaveBeenCalledWith({
      issueIdentifier: workflow.issueIdentifier,
      recordedAt: "2026-04-13T19:00:04.000Z"
    });
  });

  it("does not read live-only state for a non-current workflow id", async () => {
    const archivedWorkflow = buildWorkflowRecord({
      workflowId: "workflow-archived",
      archivedAt: "2026-04-13T19:30:00.000Z"
    });
    const currentWorkflow = buildWorkflowRecord();
    const routeWorkflowStore = createRouteWorkflowStoreStub({
      getWorkflow: vi.fn().mockResolvedValue(archivedWorkflow),
      getWorkflowForIssue: vi.fn().mockResolvedValue(currentWorkflow),
      getWorkflowForScopedIssue: vi.fn().mockResolvedValue(null),
      listHistory: vi.fn().mockResolvedValue([]),
      listDecisions: vi.fn().mockResolvedValue([]),
      getLatestSnapshot: vi.fn().mockResolvedValue(null)
    });
    const workflowRead: SymphonyRuntimeWorkflowReadPort = {
      loadWorkflowLifecycleView: vi.fn().mockResolvedValue(null)
    };
    const capabilityOperator: SymphonyRuntimeCapabilityOperatorPort = {
      inspectByIssueIdentifier: vi.fn().mockResolvedValue(null),
      answerPendingClarificationByWorkflowId: vi.fn()
    };
    const service = createRuntimeWorkflowObservabilityService({
      routeWorkflowStore,
      workflowRead,
      capabilityOperator
    });

    const result = await service.loadByWorkflowId({
      workflowId: archivedWorkflow.workflowId,
      recordedAt: "2026-04-13T19:30:01.000Z"
    });

    expect(result?.workflow.workflowId).toBe("workflow-archived");
    expect(result?.trackerState).toBeNull();
    expect(result?.capability).toBeNull();
    expect(workflowRead.loadWorkflowLifecycleView).not.toHaveBeenCalled();
    expect(capabilityOperator.inspectByIssueIdentifier).not.toHaveBeenCalled();
  });
});

function createRouteWorkflowStoreStub(
  overrides: Partial<RouteWorkflowStore>
): RouteWorkflowStore {
  const routeWorkflowStore = {
    createWorkflow: vi.fn(),
    getWorkflow: vi.fn().mockResolvedValue(null),
    getExecutionContract: vi.fn().mockResolvedValue(null),
    getCapabilityPlannerDecisionForState: vi.fn().mockResolvedValue(null),
    getCapabilityPlannerCommandByDecisionId: vi.fn().mockResolvedValue(null),
    listCapabilityPlannerCommands: vi.fn().mockResolvedValue([]),
    getWorkflowForTrackerIssueId: vi.fn().mockResolvedValue(null),
    getWorkflowForIssue: vi.fn().mockResolvedValue(null),
    getWorkflowForScopedIssue: vi.fn().mockResolvedValue(null),
    listHistory: vi.fn().mockResolvedValue([]),
    listHistoryAfter: vi.fn().mockResolvedValue([]),
    listDecisions: vi.fn().mockResolvedValue([]),
    getLatestDecision: vi.fn().mockResolvedValue(null),
    getLatestSnapshot: vi.fn().mockResolvedValue(null),
    loadWorkflowHydrationState: vi.fn().mockResolvedValue(null),
    loadWorkflowHydrationStateByIssue: vi.fn().mockResolvedValue(null),
    loadWorkflowHydrationStateByScopedIssue: vi.fn().mockResolvedValue(null),
    appendHistoryEvent: vi.fn(),
    appendHistoryEventWithSnapshot: vi.fn(),
    saveExecutionContract: vi.fn(),
    saveCapabilityPlannerDecision: vi.fn(),
    recordRouteResult: vi.fn(),
    ...overrides
  } satisfies RouteWorkflowStore;

  return routeWorkflowStore;
}

function buildWorkflowRecord(
  overrides: Partial<RouteWorkflowRecord> = {}
): RouteWorkflowRecord {
  return {
    workflowId: "workflow-1",
    trackerIssueId: "tracker-1",
    repositoryKey: "openai/symphony",
    issueIdentifier: "SYM-420",
    bindingScope: null,
    routerPresetId: "current-flow",
    routerName: "current-flow",
    routerVersion: "1",
    archivedAt: null,
    insertedAt: "2026-04-13T19:00:00.000Z",
    updatedAt: "2026-04-13T19:00:03.000Z",
    ...overrides
  };
}

function buildHistory(): RouteHistoryEventRecord[] {
  return [
    {
      eventId: "event_1",
      workflowId: "workflow-1",
      eventSequence: 1,
      kind: "signal_recorded",
      recordedAt: "2026-04-13T19:00:00.000Z",
      signalId: "signal_1",
      signalType: "tracker.state_observed",
      signalSource: "tracker",
      decisionId: null,
      commandId: null,
      fromNode: null,
      toNode: null,
      edgeId: null,
      reasonCode: null,
      event: {
        kind: "signal_recorded",
        recordedAt: "2026-04-13T19:00:00.000Z",
        signal: {
          id: "signal_1",
          type: "tracker.state_observed",
          source: "tracker",
          occurredAt: "2026-04-13T19:00:00.000Z",
          causationId: null,
          correlationId: null,
          payload: {
            trackerState: "Todo"
          }
        }
      },
      insertedAt: "2026-04-13T19:00:00.000Z"
    },
    {
      eventId: "event_2",
      workflowId: "workflow-1",
      eventSequence: 2,
      kind: "decision_recorded",
      recordedAt: "2026-04-13T19:00:01.000Z",
      signalId: "signal_1",
      signalType: "tracker.state_observed",
      signalSource: "tracker",
      decisionId: "decision_1",
      commandId: null,
      fromNode: "bootstrapping",
      toNode: "implementation",
      edgeId: "bootstrapping_to_implementation",
      reasonCode: "dispatch_implementation",
      event: {
        kind: "decision_recorded",
        recordedAt: "2026-04-13T19:00:01.000Z",
        decision: {
          id: "decision_1",
          fromNode: "bootstrapping",
          toNode: "implementation",
          edgeId: "bootstrapping_to_implementation",
          reasonCode: "dispatch_implementation",
          commands: [
            {
              id: "command_1",
              kind: "dispatch.implementation",
              payload: {
                runId: "run-1"
              },
              dedupeKey: null
            }
          ],
          trace: [],
          selectionMetadata: null
        }
      },
      insertedAt: "2026-04-13T19:00:01.000Z"
    },
    {
      eventId: "event_3",
      workflowId: "workflow-1",
      eventSequence: 3,
      kind: "command_emitted",
      recordedAt: "2026-04-13T19:00:02.000Z",
      signalId: null,
      signalType: null,
      signalSource: null,
      decisionId: "decision_1",
      commandId: "command_1",
      fromNode: "bootstrapping",
      toNode: "implementation",
      edgeId: "bootstrapping_to_implementation",
      reasonCode: "dispatch_implementation",
      event: {
        kind: "command_emitted",
        decisionId: "decision_1",
        recordedAt: "2026-04-13T19:00:02.000Z",
        command: {
          id: "command_1",
          kind: "dispatch.implementation",
          payload: {
            runId: "run-1"
          },
          dedupeKey: null
        }
      },
      insertedAt: "2026-04-13T19:00:02.000Z"
    },
    {
      eventId: "event_4",
      workflowId: "workflow-1",
      eventSequence: 4,
      kind: "command_settled",
      recordedAt: "2026-04-13T19:00:03.000Z",
      signalId: null,
      signalType: null,
      signalSource: null,
      decisionId: null,
      commandId: "command_1",
      fromNode: "implementation",
      toNode: "implementation",
      edgeId: null,
      reasonCode: null,
      event: {
        kind: "command_settled",
        commandId: "command_1",
        status: "succeeded",
        payload: {
          accepted: true
        },
        recordedAt: "2026-04-13T19:00:03.000Z"
      },
      insertedAt: "2026-04-13T19:00:03.000Z"
    }
  ];
}

function buildDecisions(): RouteDecisionRecord[] {
  return [
    {
      decisionId: "decision_1",
      workflowId: "workflow-1",
      eventSequence: 2,
      signalId: "signal_1",
      fromNode: "bootstrapping",
      toNode: "implementation",
      edgeId: "bootstrapping_to_implementation",
      reasonCode: "dispatch_implementation",
      policy: {
        presetId: "current-flow"
      },
      projectionBefore: {
        workflowId: "workflow-1",
        sequence: 1,
        currentNode: "bootstrapping",
        terminal: false,
        pendingCommands: [],
        recordedSignalIds: ["signal_1"],
        emittedCommandIds: [],
        data: {},
        lastSignal: {
          id: "signal_1",
          type: "tracker.state_observed",
          source: "tracker",
          occurredAt: "2026-04-13T19:00:00.000Z",
          causationId: null,
          correlationId: null,
          payload: {
            trackerState: "Todo"
          }
        },
        lastDecision: null
      },
      projectionAfter: {
        workflowId: "workflow-1",
        sequence: 2,
        currentNode: "implementation",
        terminal: false,
        pendingCommands: [
          {
            id: "command_1",
            kind: "dispatch.implementation",
            payload: {
              runId: "run-1"
            },
            dedupeKey: null
          }
        ],
        recordedSignalIds: ["signal_1"],
        emittedCommandIds: ["command_1"],
        data: {},
        lastSignal: {
          id: "signal_1",
          type: "tracker.state_observed",
          source: "tracker",
          occurredAt: "2026-04-13T19:00:00.000Z",
          causationId: null,
          correlationId: null,
          payload: {
            trackerState: "Todo"
          }
        },
        lastDecision: {
          id: "decision_1",
          fromNode: "bootstrapping",
          toNode: "implementation",
          edgeId: "bootstrapping_to_implementation",
          reasonCode: "dispatch_implementation",
          commands: [
            {
              id: "command_1",
              kind: "dispatch.implementation",
              payload: {
                runId: "run-1"
              },
              dedupeKey: null
            }
          ],
          trace: [],
          selectionMetadata: null
        }
      },
      commands: [
        {
          id: "command_1",
          kind: "dispatch.implementation",
          payload: {
            runId: "run-1"
          },
          dedupeKey: null
        }
      ],
      trace: [
        {
          kind: "strategy_selected",
          ref: "bootstrapping_to_implementation",
          detail: {
            reason: "Bootstrapping advanced into implementation."
          }
        }
      ],
      selectionMetadata: {
        score: 1
      },
      recordedAt: "2026-04-13T19:00:01.000Z",
      insertedAt: "2026-04-13T19:00:01.000Z"
    }
  ];
}

function buildSnapshot(): RouteProjectionSnapshotRecord {
  return {
    workflowId: "workflow-1",
    eventSequence: 4,
    currentNode: "implementation",
    terminal: false,
    lastSignalId: "signal_1",
    lastDecisionId: "decision_1",
    projection: {
      workflowId: "workflow-1",
      sequence: 4,
      currentNode: "implementation",
      terminal: false,
      pendingCommands: [
        {
          id: "command_1",
          kind: "dispatch.implementation",
          payload: {
            runId: "run-1"
          },
          dedupeKey: null
        }
      ],
      recordedSignalIds: ["signal_1"],
      emittedCommandIds: ["command_1"],
      data: {},
      lastSignal: {
        id: "signal_1",
        type: "tracker.state_observed",
        source: "tracker",
        occurredAt: "2026-04-13T19:00:00.000Z",
        causationId: null,
        correlationId: null,
        payload: {
          trackerState: "Todo"
        }
      },
      lastDecision: {
        id: "decision_1",
        fromNode: "bootstrapping",
        toNode: "implementation",
        edgeId: "bootstrapping_to_implementation",
        reasonCode: "dispatch_implementation",
        commands: [
          {
            id: "command_1",
            kind: "dispatch.implementation",
            payload: {
              runId: "run-1"
            },
            dedupeKey: null
          }
        ],
        trace: [],
        selectionMetadata: null
      }
    },
    updatedAt: "2026-04-13T19:00:03.000Z"
  };
}
