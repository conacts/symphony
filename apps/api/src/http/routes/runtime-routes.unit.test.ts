import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { RouteHistoryEventRecord } from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import type {
  WorkflowCommand,
  WorkflowDecision,
  WorkflowNodeId,
  WorkflowProjection,
  WorkflowRouteResult,
  WorkflowSignal,
  WorkflowSimulationResult
} from "@symphony/router";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import type { SymphonyRuntimeWorkflowComparison } from "../../core/runtime-workflow-comparison.js";
import { jsonError } from "../../core/envelope.js";
import { normalizeRuntimeError } from "../../core/errors.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";
import { createRuntimeRoutes } from "./runtime-routes.js";

describe("runtime routes", () => {
  it("serves workflow comparison results through the issue route", async () => {
    const compareByIssueIdentifier = vi.fn<
      SymphonyRuntimeAppServices["workflowComparison"]["compareByIssueIdentifier"]
    >().mockResolvedValue(buildWorkflowComparisonFixture());
    const app = createRuntimeRoutesTestApp({
      workflowComparison: {
        compareByWorkflowId: vi.fn().mockResolvedValue(null),
        compareByIssueIdentifier
      }
    });

    const response = await app.request(
      "/api/v1/SYM-420/workflow-comparison?presetId=current-flow&presetId=auto-merge"
    );
    const payload = (await response.json()) as {
      data: {
        workflow: {
          issueIdentifier: string;
          routerPresetId: string;
        };
        replay: {
          recordedEventCount: number;
          recordedSignalCount: number;
        };
        comparedPresetIds: string[];
        summary: {
          diverged: boolean;
          finalNodeByCandidate: Record<string, string | null>;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(compareByIssueIdentifier).toHaveBeenCalledWith({
      issueIdentifier: "SYM-420",
      presetIds: ["current-flow", "auto-merge"]
    });
    expect(payload.data.workflow.issueIdentifier).toBe("SYM-420");
    expect(payload.data.workflow.routerPresetId).toBe("current-flow");
    expect(payload.data.replay.recordedEventCount).toBe(3);
    expect(payload.data.replay.recordedSignalCount).toBe(3);
    expect(payload.data.comparedPresetIds).toEqual([
      "current-flow",
      "auto-merge"
    ]);
    expect(payload.data.summary.diverged).toBe(true);
    expect(payload.data.summary.finalNodeByCandidate).toEqual({
      "current-flow": "review",
      "auto-merge": "approved_merge"
    });
  });

  it("returns 404 when no persisted workflow exists for the issue", async () => {
    const compareByIssueIdentifier = vi.fn<
      SymphonyRuntimeAppServices["workflowComparison"]["compareByIssueIdentifier"]
    >().mockResolvedValue(null);
    const app = createRuntimeRoutesTestApp({
      workflowComparison: {
        compareByWorkflowId: vi.fn().mockResolvedValue(null),
        compareByIssueIdentifier
      }
    });

    const response = await app.request("/api/v1/SYM-404/workflow-comparison");
    const payload = (await response.json()) as {
      error: {
        code: string;
      };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
    expect(compareByIssueIdentifier).toHaveBeenCalledWith({
      issueIdentifier: "SYM-404",
      presetIds: undefined
    });
  });

  it("fails fast on unknown workflow comparison preset ids", async () => {
    const compareByIssueIdentifier = vi.fn<
      SymphonyRuntimeAppServices["workflowComparison"]["compareByIssueIdentifier"]
    >().mockResolvedValue(null);
    const app = createRuntimeRoutesTestApp({
      workflowComparison: {
        compareByWorkflowId: vi.fn().mockResolvedValue(null),
        compareByIssueIdentifier
      }
    });

    const response = await app.request(
      "/api/v1/SYM-420/workflow-comparison?presetId=unknown-preset"
    );
    const payload = (await response.json()) as {
      error: {
        code: string;
        message: string;
      };
    };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.message).toMatch(/unknown workflow router preset/i);
    expect(compareByIssueIdentifier).not.toHaveBeenCalled();
  });

  it("fails fast on duplicate workflow comparison preset ids", async () => {
    const compareByIssueIdentifier = vi.fn<
      SymphonyRuntimeAppServices["workflowComparison"]["compareByIssueIdentifier"]
    >().mockResolvedValue(null);
    const app = createRuntimeRoutesTestApp({
      workflowComparison: {
        compareByWorkflowId: vi.fn().mockResolvedValue(null),
        compareByIssueIdentifier
      }
    });

    const response = await app.request(
      "/api/v1/SYM-420/workflow-comparison?presetId=current-flow&presetId=current-flow"
    );
    const payload = (await response.json()) as {
      error: {
        code: string;
      };
    };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(compareByIssueIdentifier).not.toHaveBeenCalled();
  });

  it("prefers workflow-authoritative tracker state for runtime issue details", async () => {
    const issue = buildSymphonyTrackerIssue({
      identifier: "COL-123",
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const loadCurrentWorkflowTrackerState = vi
      .fn<SymphonyRuntimeAppServices["workflowRead"]["loadCurrentWorkflowTrackerState"]>()
      .mockResolvedValue("Approved");
    const app = createRuntimeRoutesTestApp({
      tracker,
      workflowRead: {
        loadCurrentWorkflowTrackerState
      }
    });

    const response = await app.request("/api/v1/COL-123");
    const payload = (await response.json()) as {
      data: {
        tracked: {
          state: string;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.tracked.state).toBe("Approved");
    expect(loadCurrentWorkflowTrackerState).toHaveBeenCalledWith({
      issueIdentifier: "COL-123"
    });
  });

  it("fails fast when a live runtime issue lacks workflow-authoritative tracker state", async () => {
    const issue = buildSymphonyTrackerIssue({
      identifier: "COL-123",
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const app = createRuntimeRoutesTestApp({
      tracker,
      orchestrator: {
        snapshot: vi.fn().mockReturnValue(
          buildSymphonyOrchestratorSnapshot({
            running: [
              {
                issue
              }
            ],
            retrying: []
          })
        ),
        runPollCycle: vi.fn(),
        isPollCycleInFlight: vi.fn().mockReturnValue(false),
        requestRefresh: vi.fn(),
        dispatchRoutedIssue: vi.fn()
      },
      workflowRead: {
        loadCurrentWorkflowTrackerState: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.request("/api/v1/COL-123");
    const payload = (await response.json()) as {
      error: {
        code: string;
        message: string;
      };
    };

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("UNKNOWN");
    expect(payload.error.message).toBe(
      "Runtime issue COL-123 is missing workflow-authoritative tracker state."
    );
  });
});

function createRuntimeRoutesTestApp(
  overrides: Partial<SymphonyRuntimeAppServices> = {}
) {
  const services = createRuntimeServicesStub(overrides);
  const app = new Hono<SymphonyRuntimeAppContextSchema>();

  app.use("*", async (c, next) => {
    c.set("requestId", "request-test");
    c.set("requestStartedAt", 0);
    c.set("logger", services.logger);
    await next();
  });

  app.route("/api/v1", createRuntimeRoutes(services));
  app.onError((error, c) => {
    const normalized = normalizeRuntimeError(error);
    return jsonError(c, normalized.appError, normalized.status);
  });

  return app;
}

function createRuntimeServicesStub(
  overrides: Partial<SymphonyRuntimeAppServices>
): SymphonyRuntimeAppServices {
  const logger = createSilentSymphonyLogger("@symphony/api.runtime-routes.unit");
  const runtimePolicy = buildSymphonyRuntimePolicy();

  return {
    logger,
    admittedRepositories: [],
    promptTemplate: {
      prompt: "prompt",
      promptTemplate: "prompt",
      sourcePath: "/tmp/prompt.md"
    },
    promptContract: {} as SymphonyRuntimeAppServices["promptContract"],
    runtimePolicy,
    tracker: createMemorySymphonyTracker(),
    orchestrator: {
      snapshot: vi.fn().mockReturnValue({
        running: [],
        retrying: [],
        agentTotals: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          secondsRunning: 0
        },
        rateLimits: null
      }),
      runPollCycle: vi.fn(),
      isPollCycleInFlight: vi.fn().mockReturnValue(false),
      requestRefresh: vi.fn().mockResolvedValue({
        queued: true,
        coalesced: false,
        requestedAt: "2026-04-11T12:00:00.000Z",
        operations: ["poll", "reconcile"]
      }),
      dispatchRoutedIssue: vi.fn()
    },
    agentAnalytics: {
      hasRun: vi.fn().mockResolvedValue(false),
      fetchRunArtifacts: vi.fn().mockResolvedValue(null),
      fetchOverflow: vi.fn().mockResolvedValue(null),
      listTurns: vi.fn(),
      listItems: vi.fn(),
      listCommandExecutions: vi.fn(),
      listToolCalls: vi.fn(),
      listAgentMessages: vi.fn(),
      listReasoning: vi.fn(),
      listFileChanges: vi.fn()
    } as SymphonyRuntimeAppServices["agentAnalytics"],
    forensics: {} as SymphonyRuntimeAppServices["forensics"],
    issueTimeline: {
      list: vi.fn().mockResolvedValue(null)
    },
    runtimeLogs: {
      list: vi.fn().mockResolvedValue({
        logs: [],
        filters: {
          limit: null,
          repo: null,
          issueIdentifier: null
        }
      })
    },
    health: {
      snapshot: vi.fn().mockReturnValue({
        healthy: true,
        db: {
          file: "/tmp/symphony.db",
          ready: true
        },
        poller: {
          running: false,
          intervalMs: 1_000,
          inFlight: false,
          lastStartedAt: null,
          lastCompletedAt: null,
          lastSucceededAt: null,
          lastError: null
        },
        machineLoad: null
      })
    },
    trackerStateIngress: {
      observeNonRunningIssue: vi.fn().mockResolvedValue(null)
    },
    workflowRead: {
      loadCurrentWorkflowTrackerState: vi.fn().mockResolvedValue(null)
    },
    runtimeTools: {
      recordDeliveryReport: vi.fn(),
      submitSpikeResult: vi.fn(),
      cancelIssue: vi.fn(),
      submitMergeResult: vi.fn()
    } as SymphonyRuntimeAppServices["runtimeTools"],
    workflowComparison: {
      compareByWorkflowId: vi.fn().mockResolvedValue(null),
      compareByIssueIdentifier: vi.fn().mockResolvedValue(null)
    },
    routeWorkflows: {} as SymphonyRuntimeAppServices["routeWorkflows"],
    githubReviewIngress: {
      ingest: vi.fn()
    } as SymphonyRuntimeAppServices["githubReviewIngress"],
    realtime: {
      openConnection: vi.fn(),
      closeConnection: vi.fn(),
      handleClientMessage: vi.fn(),
      publishSnapshotUpdated: vi.fn(),
      publishIssueUpdated: vi.fn(),
      publishRunUpdated: vi.fn(),
      publishProblemRunsUpdated: vi.fn(),
      connectionCount: vi.fn().mockReturnValue(0)
    },
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function buildWorkflowComparisonFixture(): SymphonyRuntimeWorkflowComparison {
  const workflowId = "workflow-1";
  const signals: WorkflowSignal[] = [
    {
      id: "signal_todo_observed",
      type: "tracker.state_observed",
      source: "tracker",
      occurredAt: "2026-04-11T12:01:00.000Z",
      causationId: null,
      correlationId: null,
      payload: {
        trackerState: "Todo"
      }
    },
    {
      id: "signal_implementation_started",
      type: "runtime.run_started",
      source: "runtime",
      occurredAt: "2026-04-11T12:01:10.000Z",
      causationId: null,
      correlationId: null,
      payload: {
        runId: "run-1",
        runMode: "implementation"
      }
    },
    {
      id: "signal_delivery_completed",
      type: "runtime.delivery_reported",
      source: "runtime",
      occurredAt: "2026-04-11T12:01:20.000Z",
      causationId: null,
      correlationId: null,
      payload: {
        runId: "run-1",
        status: "completed"
      }
    }
  ];
  const history = signals.map((signal, index) =>
    buildReplayHistoryRecord({
      workflowId,
      signal,
      eventSequence: index + 1
    })
  );

  const currentFlowCommand = buildCommand("command-review");
  const autoMergeCommand = buildCommand("command-merge");

  const currentFlowSimulation = buildSimulation({
    workflowId,
    finalNode: "review",
    finalCommand: currentFlowCommand,
    steps: [
      {
        signal: signals[0],
        fromNode: null,
        toNode: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        emittedCommands: [buildCommand("command-bootstrap")]
      },
      {
        signal: signals[1],
        fromNode: "bootstrapping",
        toNode: "implementation",
        reasonCode: "implementation_run_started",
        emittedCommands: []
      },
      {
        signal: signals[2],
        fromNode: "implementation",
        toNode: "review",
        reasonCode: "delivery_reported",
        emittedCommands: [currentFlowCommand]
      }
    ]
  });

  const autoMergeSimulation = buildSimulation({
    workflowId,
    finalNode: "approved_merge",
    finalCommand: autoMergeCommand,
    steps: [
      {
        signal: signals[0],
        fromNode: null,
        toNode: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        emittedCommands: [buildCommand("command-bootstrap-auto")]
      },
      {
        signal: signals[1],
        fromNode: "bootstrapping",
        toNode: "implementation",
        reasonCode: "implementation_run_started",
        emittedCommands: []
      },
      {
        signal: signals[2],
        fromNode: "implementation",
        toNode: "approved_merge",
        reasonCode: "delivery_reported_auto_approved",
        emittedCommands: [autoMergeCommand]
      }
    ]
  });

  return {
    replay: {
      workflow: {
        workflowId,
        repositoryKey: "openai/symphony",
        issueIdentifier: "SYM-420",
        routerPresetId: "current-flow",
        routerName: "current-flow",
        routerVersion: "1",
        archivedAt: null,
        insertedAt: "2026-04-11T12:00:00.000Z",
        updatedAt: "2026-04-11T12:01:20.000Z"
      },
      history,
      signals
    },
    comparedPresetIds: ["current-flow", "auto-merge"],
    comparison: {
      workflowId,
      signals,
      entries: [
        {
          candidateId: "current-flow",
          simulation: currentFlowSimulation
        },
        {
          candidateId: "auto-merge",
          simulation: autoMergeSimulation
        }
      ],
      summary: {
        diverged: true,
        finalNodeByCandidate: {
          "current-flow": "review",
          "auto-merge": "approved_merge"
        },
        reasonCodesByCandidate: {
          "current-flow": [
            "todo_claimed_for_dispatch",
            "implementation_run_started",
            "delivery_reported"
          ],
          "auto-merge": [
            "todo_claimed_for_dispatch",
            "implementation_run_started",
            "delivery_reported_auto_approved"
          ]
        },
        pendingCommandCountsByCandidate: {
          "current-flow": 1,
          "auto-merge": 1
        }
      }
    }
  };
}

function buildReplayHistoryRecord(input: {
  workflowId: string;
  signal: WorkflowSignal;
  eventSequence: number;
}): RouteHistoryEventRecord<WorkflowNodeId> {
  const recordedAt = input.signal.occurredAt;

  return {
    eventId: `history_${input.eventSequence}`,
    workflowId: input.workflowId,
    eventSequence: input.eventSequence,
    kind: "signal_recorded",
    recordedAt,
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
      signal: input.signal,
      recordedAt
    },
    insertedAt: recordedAt
  };
}

function buildSimulation(input: {
  workflowId: string;
  finalNode: WorkflowNodeId;
  finalCommand: WorkflowCommand;
  steps: ReadonlyArray<{
    signal: WorkflowSignal;
    fromNode: WorkflowNodeId | null;
    toNode: WorkflowNodeId;
    reasonCode: string;
    emittedCommands: WorkflowCommand[];
  }>;
}): WorkflowSimulationResult<WorkflowNodeId, unknown> {
  let projection = buildProjection({
    workflowId: input.workflowId,
    currentNode: null,
    pendingCommands: [],
    recordedSignalIds: [],
    emittedCommandIds: [],
    sequence: 0,
    lastSignal: null,
    lastDecision: null
  });

  const results: WorkflowRouteResult<WorkflowNodeId, unknown>[] = input.steps.map(
    (step, index) => {
      const decision = buildDecision({
        id: `decision_${index + 1}_${step.reasonCode}`,
        fromNode: step.fromNode,
        toNode: step.toNode,
        reasonCode: step.reasonCode,
        commands: step.emittedCommands
      });
      const signalEvent = {
        kind: "signal_recorded" as const,
        signal: step.signal,
        recordedAt: step.signal.occurredAt
      };
      const events = [
        signalEvent,
        {
          kind: "decision_recorded" as const,
          decision,
          recordedAt: step.signal.occurredAt
        },
        ...step.emittedCommands.map((command) => ({
          kind: "command_emitted" as const,
          decisionId: decision.id,
          command,
          recordedAt: step.signal.occurredAt
        }))
      ];
      const projectionAfter = buildProjection({
        workflowId: input.workflowId,
        currentNode: step.toNode,
        pendingCommands:
          index === input.steps.length - 1 ? [input.finalCommand] : step.emittedCommands,
        recordedSignalIds: [...projection.recordedSignalIds, step.signal.id],
        emittedCommandIds: [
          ...projection.emittedCommandIds,
          ...step.emittedCommands.map((command) => command.id)
        ],
        sequence: projection.sequence + events.length,
        lastSignal: step.signal,
        lastDecision: decision
      });
      const result: WorkflowRouteResult<WorkflowNodeId, unknown> = {
        projectionBefore: projection,
        signalEvent,
        decision,
        events,
        projectionAfter
      };

      projection = projectionAfter;
      return result;
    }
  );

  return {
    history: results.flatMap((result) => result.events),
    projection,
    steps: results.map((result) => ({
      signal: result.signalEvent.signal,
      result
    }))
  };
}

function buildProjection(input: {
  workflowId: string;
  currentNode: WorkflowNodeId | null;
  pendingCommands: WorkflowCommand[];
  recordedSignalIds: string[];
  emittedCommandIds: string[];
  sequence: number;
  lastSignal: WorkflowSignal | null;
  lastDecision: WorkflowDecision<WorkflowNodeId> | null;
}): WorkflowProjection<WorkflowNodeId, unknown> {
  return {
    workflowId: input.workflowId,
    currentNode: input.currentNode,
    pendingCommands: input.pendingCommands,
    recordedSignalIds: input.recordedSignalIds,
    emittedCommandIds: input.emittedCommandIds,
    terminal: false,
    sequence: input.sequence,
    data: null,
    lastSignal: input.lastSignal,
    lastDecision: input.lastDecision
  };
}

function buildDecision(input: {
  id: string;
  fromNode: WorkflowNodeId | null;
  toNode: WorkflowNodeId;
  reasonCode: string;
  commands: WorkflowCommand[];
}): WorkflowDecision<WorkflowNodeId> {
  return {
    id: input.id,
    fromNode: input.fromNode,
    toNode: input.toNode,
    edgeId: `edge_${input.reasonCode}`,
    reasonCode: input.reasonCode,
    commands: input.commands,
    trace: [],
    selectionMetadata: null
  };
}

function buildCommand(id: string): WorkflowCommand {
  return {
    id,
    kind: "tracker.transition",
    payload: null,
    dedupeKey: null
  };
}
