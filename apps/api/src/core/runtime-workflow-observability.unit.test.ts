import { describe, expect, it, vi } from "vitest";
import type {
  RouteDecisionRecord,
  RouteHistoryEventRecord,
  RouteProjectionSnapshotRecord,
  RouteWorkflowRecord,
  RouteWorkflowStore
} from "@symphony/db";
import {
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityStartedSignal,
  type WorkflowSignal
} from "@symphony/router";
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
        trackerState: "In Progress"
      })
    };
    const capabilityOperator: SymphonyRuntimeCapabilityOperatorPort = {
      inspectByIssueIdentifier: vi.fn().mockResolvedValue({
        capability: {
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
        },
        pendingClarification: null
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
    expect(result?.pendingClarification).toBeNull();
    expect(result?.snapshot?.pendingCommandCount).toBe(1);
    expect(result?.replay.recordedDecisionCount).toBe(1);
    expect(result?.routerDecision).toBeNull();
    expect(result?.currentModule?.module.moduleId).toBe("implement.spec");
    expect(result?.currentModule?.state).toBe("selected");
    expect(result?.recentModuleRuns).toEqual([]);
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

  it("projects router decisions and capability attempts into module observability", async () => {
    const workflow = buildWorkflowRecord({
      routerPresetId: "intelligent-flow",
      routerName: "symphony-intelligent-flow"
    });
    const history = buildCapabilityAttemptHistory();
    const decisions = buildIntelligentFlowDecisions();
    const routeWorkflowStore = createRouteWorkflowStoreStub({
      getWorkflowForIssue: vi.fn().mockResolvedValue(workflow),
      getWorkflowForScopedIssue: vi.fn().mockResolvedValue(null),
      getWorkflow: vi.fn().mockResolvedValue(null),
      listHistory: vi.fn().mockResolvedValue(history),
      listDecisions: vi.fn().mockResolvedValue(decisions),
      getLatestSnapshot: vi.fn().mockResolvedValue(buildSnapshot())
    });
    const workflowRead: SymphonyRuntimeWorkflowReadPort = {
      loadWorkflowLifecycleView: vi.fn().mockResolvedValue({
        workflowId: workflow.workflowId,
        trackerState: "In Progress"
      })
    };
    const capabilityOperator: SymphonyRuntimeCapabilityOperatorPort = {
      inspectByIssueIdentifier: vi.fn().mockResolvedValue({
        capability: {
          workflowId: workflow.workflowId,
          contractId: "contract-1",
          policyId: "default",
          planKind: "execute",
          summary: "Next capability execution is critic.code_review.",
          decidedAt: "2026-04-13T19:00:05.000Z",
          capabilityId: "critic.code_review",
          modelProfileId: "critic_strict",
          workEpoch: 1,
          pendingClarification: null,
          completion: null
        },
        pendingClarification: null
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
      recordedAt: "2026-04-13T19:00:06.000Z"
    });

    expect(result?.routerDecision).toEqual({
      decisionId: "decision_2",
      recordedAt: "2026-04-13T19:00:05.000Z",
      policyId: "default",
      reasonCode: "active_selected_code_review",
      selectionMode: "deterministic",
      selectionSummary: "Code review is the next admissible verification module.",
      selectionRationale:
        "Implementation produced the required change_set evidence, so critic.code_review is next.",
      confidence: null,
      fallbackReason: null,
      selectedModule: expect.objectContaining({
        moduleId: "critic.code_review",
        phase: "verifying"
      }),
      admissibleCandidates: expect.arrayContaining([
        expect.objectContaining({
          module: expect.objectContaining({
            moduleId: "critic.code_review"
          }),
          rank: 0,
          selected: true
        })
      ]),
      rejectedCandidates: expect.arrayContaining([
        expect.objectContaining({
          module: expect.objectContaining({
            moduleId: "critic.browser_test"
          }),
          selected: false
        })
      ])
    });
    expect(result?.currentModule).toEqual({
      executionId: null,
      module: expect.objectContaining({
        moduleId: "critic.code_review",
        phase: "verifying"
      }),
      workEpoch: 1,
      attempt: null,
      state: "selected",
      summary: "Next capability execution is critic.code_review.",
      modelProfileId: "critic_strict",
      selectedAt: "2026-04-13T19:00:05.000Z",
      startedAt: null,
      completedAt: null,
      retryable: null,
      reasonCode: null,
      failureKind: null,
      evidenceProduced: [],
      decision: {
        decisionId: "decision_2",
        recordedAt: "2026-04-13T19:00:05.000Z",
        reasonCode: "active_selected_code_review",
        selectionMode: "deterministic",
        selectionSummary: "Code review is the next admissible verification module.",
        selectionRationale:
          "Implementation produced the required change_set evidence, so critic.code_review is next."
      }
    });
    expect(result?.recentModuleRuns).toEqual([
      {
        executionId: "execution_1",
        module: expect.objectContaining({
          moduleId: "implement.spec",
          phase: "implementing"
        }),
        workEpoch: 1,
        attempt: 1,
        state: "completed",
        summary: "Implemented the requested workflow observability slice.",
        modelProfileId: "builder_fast",
        selectedAt: "2026-04-13T19:00:01.000Z",
        startedAt: "2026-04-13T19:00:02.000Z",
        completedAt: "2026-04-13T19:00:04.000Z",
        retryable: null,
        reasonCode: null,
        failureKind: null,
        evidenceProduced: [
          {
            evidenceId: "change_set",
            summary: "Code changes were produced.",
            artifacts: []
          }
        ],
        decision: {
          decisionId: "decision_1",
          recordedAt: "2026-04-13T19:00:01.000Z",
          reasonCode: "active_selected_implementation",
          selectionMode: "deterministic",
          selectionSummary:
            "Implementation is the first admissible module for this work epoch.",
          selectionRationale:
            "The workflow has no change_set evidence yet, so implement.spec must run first."
        }
      }
    ]);
  });

  it("surfaces pre-execution clarification as first-class observability state", async () => {
    const workflow = buildWorkflowRecord({
      routerPresetId: "intelligent-flow",
      routerName: "symphony-intelligent-flow"
    });
    const routeWorkflowStore = createRouteWorkflowStoreStub({
      getWorkflowForIssue: vi.fn().mockResolvedValue(workflow),
      getWorkflowForScopedIssue: vi.fn().mockResolvedValue(null),
      getWorkflow: vi.fn().mockResolvedValue(null),
      listHistory: vi.fn().mockResolvedValue(buildHistory()),
      listDecisions: vi.fn().mockResolvedValue([]),
      getLatestSnapshot: vi.fn().mockResolvedValue(buildSnapshot({
        currentNode: "awaiting_input"
      }))
    });
    const workflowRead: SymphonyRuntimeWorkflowReadPort = {
      loadWorkflowLifecycleView: vi.fn().mockResolvedValue({
        workflowId: workflow.workflowId,
        trackerState: "Paused"
      })
    };
    const capabilityOperator: SymphonyRuntimeCapabilityOperatorPort = {
      inspectByIssueIdentifier: vi.fn().mockResolvedValue({
        capability: null,
        pendingClarification: {
          kind: "contract_intake",
          requestId: "clarify_contract_1",
          raisedByCapabilityId: null,
          workEpoch: null,
          summary:
            "Ticket needs more detail before Symphony can derive a valid execution contract.",
          nextAction:
            'Update the ticket body to answer the missing question: "What concrete outcome should count as done for this ticket?" Then move the issue back to Todo to requeue.',
          questions: [
            {
              id: "done_definition",
              prompt: "What concrete outcome should count as done for this ticket?",
              context: null
            }
          ],
          answerPath: null
        }
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
      recordedAt: "2026-04-15T12:00:00.000Z"
    });

    expect(result?.capability).toBeNull();
    expect(result?.pendingClarification).toEqual(
      expect.objectContaining({
        kind: "contract_intake",
        requestId: "clarify_contract_1",
        answerPath: null
      })
    );
    expect(result?.currentModule).toBeNull();
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
    archiveWorkflow: vi.fn().mockResolvedValue(false),
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
    routerPresetId: "intelligent-flow",
    routerName: "symphony-intelligent-flow",
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
        presetId: "intelligent-flow"
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

function buildIntelligentFlowDecisions(): RouteDecisionRecord[] {
  return [
    {
      decisionId: "decision_1",
      workflowId: "workflow-1",
      eventSequence: 2,
      signalId: "signal_router_selected_implementation",
      fromNode: "claimed",
      toNode: "active",
      edgeId: "claimed_run_started_to_active",
      reasonCode: "active_selected_implementation",
      policy: {
        presetId: "intelligent-flow"
      },
      projectionBefore: buildTestProjection("claimed", 1),
      projectionAfter: buildTestProjection("active", 2),
      commands: [
        {
          id: "execution_1",
          kind: "capability.execute",
          payload: {
            workflowId: "workflow-1",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast"
          },
          dedupeKey: null
        }
      ],
      trace: [],
      selectionMetadata: {
        decisionId: "decision_1",
        workflowId: "workflow-1",
        policyId: "default",
        recordedAt: "2026-04-13T19:00:01.000Z",
        candidateSet: {
          admissible: [
            {
              moduleId: "implement.spec",
              rank: 0,
              reasonCode: "required_by_contract",
              summary:
                "Implementation is the first admissible module for this work epoch."
            }
          ],
          rejected: [
            {
              moduleId: "critic.code_review",
              reasonCode: "missing_required_evidence",
              summary: "critic.code_review requires the change_set evidence."
            }
          ]
        },
        selectedModuleId: "implement.spec",
        selectionMode: "deterministic",
        selectionSummary:
          "Implementation is the first admissible module for this work epoch.",
        selectionRationale:
          "The workflow has no change_set evidence yet, so implement.spec must run first.",
        confidence: null,
        inputProjectionFingerprint: "projection-1",
        fallbackReason: null
      },
      recordedAt: "2026-04-13T19:00:01.000Z",
      insertedAt: "2026-04-13T19:00:01.000Z"
    },
    {
      decisionId: "decision_2",
      workflowId: "workflow-1",
      eventSequence: 5,
      signalId: "signal_router_selected_code_review",
      fromNode: "active",
      toNode: "active",
      edgeId: "active_selected_code_review",
      reasonCode: "active_selected_code_review",
      policy: {
        presetId: "intelligent-flow"
      },
      projectionBefore: buildTestProjection("active", 4),
      projectionAfter: buildTestProjection("active", 5),
      commands: [
        {
          id: "execution_2",
          kind: "capability.execute",
          payload: {
            workflowId: "workflow-1",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict"
          },
          dedupeKey: null
        }
      ],
      trace: [],
      selectionMetadata: {
        decisionId: "decision_2",
        workflowId: "workflow-1",
        policyId: "default",
        recordedAt: "2026-04-13T19:00:05.000Z",
        candidateSet: {
          admissible: [
            {
              moduleId: "critic.code_review",
              rank: 0,
              reasonCode: "required_by_contract",
              summary:
                "Code review is the next admissible verification module."
            }
          ],
          rejected: [
            {
              moduleId: "critic.browser_test",
              reasonCode: "disabled_by_default",
              summary: "critic.browser_test is disabled in the current runtime."
            }
          ]
        },
        selectedModuleId: "critic.code_review",
        selectionMode: "deterministic",
        selectionSummary:
          "Code review is the next admissible verification module.",
        selectionRationale:
          "Implementation produced the required change_set evidence, so critic.code_review is next.",
        confidence: null,
        inputProjectionFingerprint: "projection-2",
        fallbackReason: null
      },
      recordedAt: "2026-04-13T19:00:05.000Z",
      insertedAt: "2026-04-13T19:00:05.000Z"
    }
  ];
}

function buildCapabilityAttemptHistory(): RouteHistoryEventRecord[] {
  const startedSignal = createSymphonyCapabilityStartedSignal({
    id: "signal_capability_started",
    occurredAt: "2026-04-13T19:00:02.000Z",
    source: "runtime",
    workflowId: "workflow-1",
    executionId: "execution_1",
    capabilityId: "implement.spec",
    modelProfileId: "builder_fast",
    workEpoch: 1,
    attempt: 1,
    summary: "Started implementation for workflow observability.",
    causationId: "execution_1",
    correlationId: "SYM-420"
  });
  const completedSignal = createSymphonyCapabilityCompletedSignal({
    id: "signal_capability_completed",
    occurredAt: "2026-04-13T19:00:04.000Z",
    source: "runtime",
    workflowId: "workflow-1",
    executionId: "execution_1",
    capabilityId: "implement.spec",
    modelProfileId: "builder_fast",
    workEpoch: 1,
    attempt: 1,
    summary: "Implemented the requested workflow observability slice.",
    evidenceProduced: [
      {
        evidenceId: "change_set",
        summary: "Code changes were produced.",
        artifacts: []
      }
    ],
    causationId: "execution_1",
    correlationId: "SYM-420"
  });

  return [
    buildSignalRecordedHistoryEvent({
      eventId: "event_started",
      eventSequence: 3,
      signal: startedSignal
    }),
    buildSignalRecordedHistoryEvent({
      eventId: "event_completed",
      eventSequence: 4,
      signal: completedSignal
    })
  ];
}

function buildSnapshot(
  overrides: Partial<RouteProjectionSnapshotRecord> = {}
): RouteProjectionSnapshotRecord {
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
    updatedAt: "2026-04-13T19:00:03.000Z",
    ...overrides
  };
}

function buildSignalRecordedHistoryEvent(input: {
  eventId: string;
  eventSequence: number;
  signal: WorkflowSignal;
}): RouteHistoryEventRecord {
  return {
    eventId: input.eventId,
    workflowId: "workflow-1",
    eventSequence: input.eventSequence,
    kind: "signal_recorded",
    recordedAt: input.signal.occurredAt,
    signalId: input.signal.id,
    signalType: input.signal.type,
    signalSource: input.signal.source,
    decisionId: null,
    commandId: null,
    fromNode: null,
    toNode: null,
    edgeId: null,
    reasonCode: null,
    event: {
      kind: "signal_recorded",
      recordedAt: input.signal.occurredAt,
      signal: input.signal
    },
    insertedAt: input.signal.occurredAt
  };
}

function buildTestProjection(currentNode: string, sequence: number) {
  return {
    workflowId: "workflow-1",
    sequence,
    currentNode,
    terminal: false,
    pendingCommands: [],
    recordedSignalIds: [],
    emittedCommandIds: [],
    data: {},
    lastSignal: null,
    lastDecision: null
  };
}
