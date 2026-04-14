import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { SymphonyRuntimeWorkflowObservabilityResult } from "@symphony/contracts";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { buildBindMountPreparedWorkspace } from "../../test-support/create-symphony-runtime-test-harness.js";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { jsonError } from "../../core/envelope.js";
import { normalizeRuntimeError } from "../../core/errors.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";
import { createRuntimeRoutes } from "./runtime-routes.js";

describe("runtime routes", () => {
  it("serves the runtime config snapshot", async () => {
    const app = createRuntimeRoutesTestApp();

    const response = await app.request("/api/v1/runtime/config");
    const payload = (await response.json()) as {
      data: {
        runtime: {
          repositoryKey: string;
          trackerKind: string;
        };
        bootstrap: {
          presetSelection: {
            presetId: string;
          };
        };
        admittedRepositories: Array<{
          repositoryKey: string;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.runtime.repositoryKey).toBe("openai/symphony");
    expect(payload.data.runtime.trackerKind).toBe("linear");
    expect(payload.data.bootstrap.presetSelection.presetId).toBe("intelligent-flow");
    expect(payload.data.admittedRepositories).toEqual([]);
  });

  it("serves workflow observability through the issue route", async () => {
    const loadByIssueIdentifier = vi
      .fn<SymphonyRuntimeAppServices["workflowObservability"]["loadByIssueIdentifier"]>()
      .mockResolvedValue(buildWorkflowObservabilityFixture());
    const app = createRuntimeRoutesTestApp({
      workflowObservability: {
        loadByWorkflowId: vi.fn().mockResolvedValue(null),
        loadByIssueIdentifier
      }
    });

    const response = await app.request(
      "/api/v1/SYM-420/workflow-observability?historyLimit=25&decisionLimit=5"
    );
    const payload = (await response.json()) as {
      data: {
        workflow: {
          workflowId: string;
          issueIdentifier: string;
        };
        snapshot: {
          currentNode: string | null;
        } | null;
        decisions: Array<{
          commands: Array<{
            settled: {
              status: string;
            } | null;
          }>;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(loadByIssueIdentifier).toHaveBeenCalledWith({
      issueIdentifier: "SYM-420",
      recordedAt: expect.any(String),
      historyLimit: 25,
      decisionLimit: 5
    });
    expect(payload.data.workflow.workflowId).toBe("workflow-1");
    expect(payload.data.workflow.issueIdentifier).toBe("SYM-420");
    expect(payload.data.snapshot?.currentNode).toBe("active");
    expect(payload.data.decisions[0]?.commands[0]?.settled?.status).toBe(
      "succeeded"
    );
  });

  it("serves workflow observability through the workflow route", async () => {
    const loadByWorkflowId = vi
      .fn<SymphonyRuntimeAppServices["workflowObservability"]["loadByWorkflowId"]>()
      .mockResolvedValue(buildWorkflowObservabilityFixture());
    const app = createRuntimeRoutesTestApp({
      workflowObservability: {
        loadByWorkflowId,
        loadByIssueIdentifier: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.request("/api/v1/workflows/workflow-1/observability");
    const payload = (await response.json()) as {
      data: {
        workflow: {
          workflowId: string;
        };
        replay: {
          recordedDecisionCount: number;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(loadByWorkflowId).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      recordedAt: expect.any(String),
      historyLimit: undefined,
      decisionLimit: undefined
    });
    expect(payload.data.workflow.workflowId).toBe("workflow-1");
    expect(payload.data.replay.recordedDecisionCount).toBe(1);
  });

  it("returns 404 when workflow observability is unavailable", async () => {
    const loadByIssueIdentifier = vi
      .fn<SymphonyRuntimeAppServices["workflowObservability"]["loadByIssueIdentifier"]>()
      .mockResolvedValue(null);
    const app = createRuntimeRoutesTestApp({
      workflowObservability: {
        loadByWorkflowId: vi.fn().mockResolvedValue(null),
        loadByIssueIdentifier
      }
    });

    const response = await app.request("/api/v1/SYM-404/workflow-observability");
    const payload = (await response.json()) as {
      error: {
        code: string;
      };
    };

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe("NOT_FOUND");
    expect(loadByIssueIdentifier).toHaveBeenCalledWith({
      issueIdentifier: "SYM-404",
      recordedAt: expect.any(String),
      historyLimit: undefined,
      decisionLimit: undefined
    });
  });

  it("prefers workflow-authoritative tracker state for runtime issue details", async () => {
    const issue = buildSymphonyTrackerIssue({
      identifier: "COL-123",
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const loadWorkflowLifecycleView = vi
      .fn<SymphonyRuntimeAppServices["workflowRead"]["loadWorkflowLifecycleView"]>()
      .mockResolvedValue({
        workflowId: "workflow-123",
        trackerState: "Bootstrapping"
      });
    const app = createRuntimeRoutesTestApp({
      tracker,
      workflowRead: {
        loadWorkflowLifecycleView
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
    expect(payload.data.tracked.state).toBe("Bootstrapping");
    expect(loadWorkflowLifecycleView).toHaveBeenCalledWith({
      issueIdentifier: "COL-123"
    });
  });

  it("includes capability operator state in runtime issue details", async () => {
    const issue = buildSymphonyTrackerIssue({
      identifier: "COL-123",
      state: "In Progress"
    });
    const inspectByIssueIdentifier = vi
      .fn<SymphonyRuntimeAppServices["capabilityOperator"]["inspectByIssueIdentifier"]>()
      .mockResolvedValue({
        workflowId: "workflow-123",
        contractId: "contract-123",
        policyId: "default",
        planKind: "awaiting_input",
        summary: "Need clarification before continuing implement.spec.",
        decidedAt: "2026-04-13T18:00:00.000Z",
        capabilityId: "implement.spec",
        modelProfileId: null,
        workEpoch: 1,
        completion: null,
        pendingClarification: {
          requestId: "clarify_123",
          raisedByCapabilityId: "implement.spec",
          workEpoch: 1,
          summary: "Need clarification before continuing implement.spec.",
          answerPath: "/api/v1/COL-123/clarification-answer",
          questions: [
            {
              id: "question_1",
              prompt: "What behavior should this capability prove?",
              context: null
            }
          ]
        }
      });
    const app = createRuntimeRoutesTestApp({
      tracker: createMemorySymphonyTracker([issue]),
      capabilityOperator: {
        inspectByIssueIdentifier,
        answerPendingClarificationByWorkflowId: vi.fn()
      }
    });

    const response = await app.request("/api/v1/COL-123");
    const payload = (await response.json()) as {
      data: {
        operator: {
          capability: {
            planKind: string;
            pendingClarification: {
              requestId: string;
            } | null;
          } | null;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.operator.capability?.planKind).toBe("awaiting_input");
    expect(payload.data.operator.capability?.pendingClarification?.requestId).toBe(
      "clarify_123"
    );
    expect(inspectByIssueIdentifier).toHaveBeenCalledTimes(1);
  });

  it("records clarification answers through the runtime operator route", async () => {
    const answerPendingClarificationByWorkflowId = vi
      .fn<
        SymphonyRuntimeAppServices["capabilityOperator"]["answerPendingClarificationByWorkflowId"]
      >()
      .mockResolvedValue({
        issueIdentifier: "COL-123",
        workflowId: "workflow-123",
        requestId: "clarify_123",
        answeredAt: "2026-04-13T18:10:00.000Z",
        capability: {
          workflowId: "workflow-123",
          contractId: "contract-123",
          policyId: "default",
          planKind: "execute",
          summary: "Next capability execution is implement.spec.",
          decidedAt: "2026-04-13T18:10:01.000Z",
          capabilityId: "implement.spec",
          modelProfileId: "builder_fast",
          workEpoch: 1,
          pendingClarification: null,
          completion: null
        }
      });
    const publishIssueUpdated = vi.fn();
    const app = createRuntimeRoutesTestApp({
      capabilityOperator: {
        inspectByIssueIdentifier: vi.fn().mockResolvedValue({
          workflowId: "workflow-123",
          contractId: "contract-123",
          policyId: "default",
          planKind: "awaiting_input",
          summary: "Need clarification before continuing implement.spec.",
          decidedAt: "2026-04-13T18:09:00.000Z",
          capabilityId: "implement.spec",
          modelProfileId: null,
          workEpoch: 1,
          completion: null,
          pendingClarification: {
            requestId: "clarify_123",
            raisedByCapabilityId: "implement.spec",
            workEpoch: 1,
            summary: "Need clarification before continuing implement.spec.",
            answerPath: "/api/v1/COL-123/clarification-answer",
            questions: [
              {
                id: "question_1",
                prompt: "What behavior should this capability prove?",
                context: null
              }
            ]
          }
        }),
        answerPendingClarificationByWorkflowId
      },
      realtime: {
        ...createRuntimeServicesStub({}).realtime,
        publishIssueUpdated
      }
    });

    const response = await app.request("/api/v1/COL-123/clarification-answer", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        requestId: "clarify_123",
        answers: {
          question_1: "Proceed with strict backend behavior."
        }
      })
    });
    const payload = (await response.json()) as {
      data: {
        requestId: string;
        capability: {
          planKind: string;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.data.requestId).toBe("clarify_123");
    expect(payload.data.capability.planKind).toBe("execute");
    expect(answerPendingClarificationByWorkflowId).toHaveBeenCalledWith({
      workflowId: "workflow-123",
      recordedAt: expect.any(String),
      requestId: "clarify_123",
      answers: {
        question_1: "Proceed with strict backend behavior."
      }
    });
    expect(publishIssueUpdated).toHaveBeenCalledWith("COL-123");
  });

  it("fails fast when runtime state serialization sees a live entry without workflow-authoritative tracker state", async () => {
    const issue = buildSymphonyTrackerIssue({
      identifier: "COL-123",
      state: "In Progress"
    });
    const app = createRuntimeRoutesTestApp({
      orchestrator: {
        snapshot: vi.fn().mockReturnValue(
          buildSymphonyOrchestratorSnapshot({
            running: [
              {
                issue,
                workspace: buildBindMountPreparedWorkspace(
                  issue.identifier,
                  `/tmp/symphony-${issue.identifier}`
                ),
                workspacePath: `/tmp/symphony-${issue.identifier}`
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
        loadWorkflowLifecycleView: vi.fn().mockResolvedValue(null)
      }
    });

    const response = await app.request("/api/v1/state");
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
        loadWorkflowLifecycleView: vi.fn().mockResolvedValue(null)
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
    bootstrapBinding: {
      kind: "workflow_binding",
      repositorySource: {
        kind: "admitted_source_repositories",
        source: "explicit",
        sourceRepos: []
      },
      defaultRepositoryKey: "openai/symphony",
      manifestPath: null,
      bindingScope: null,
      presetSelection: {
        presetId: "intelligent-flow",
        source: "registry_default",
        repositoryKey: null,
        manifestPath: null
      }
    },
    admittedRepositories: [],
    promptTemplate: {
      prompt: "prompt",
      promptTemplate: "prompt",
      sourcePath: "/tmp/prompt.md"
    },
    promptContract: {} as SymphonyRuntimeAppServices["promptContract"],
    runtimePolicy,
    runtimeConfig: {
      runtime: {
        repositoryKey: "openai/symphony",
        githubRepository: "openai/symphony",
        trackerKind: runtimePolicy.tracker.kind,
        trackerTeamKey: null,
        agentHarness: runtimePolicy.agent.harness,
        workspaceRoot: runtimePolicy.workspace.root
      },
      credentials: {
        linearApiKeyConfigured: true,
        githubCliAuthMode: "env",
        githubCliAuthEnvKey: "GITHUB_TOKEN",
        piAuthMode: "provider_env",
        piProviderEnvKey: "OPENAI_API_KEY"
      },
      bootstrap: {
        kind: "workflow_binding",
        repositorySource: {
          kind: "admitted_source_repositories",
          source: "explicit",
          sourceRepos: []
        },
        defaultRepositoryKey: "openai/symphony",
        manifestPath: null,
        bindingScope: null,
        presetSelection: {
          presetId: "intelligent-flow",
          source: "registry_default",
          repositoryKey: null,
          manifestPath: null
        }
      },
      admittedRepositories: [],
      bindingCatalog: null
    },
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
      loadWorkflowLifecycleView: vi.fn().mockResolvedValue(null)
    },
    capabilityOperator: {
      inspectByIssueIdentifier: vi.fn().mockResolvedValue(null),
      answerPendingClarificationByWorkflowId: vi.fn()
    },
    workflowObservability: {
      loadByWorkflowId: vi.fn().mockResolvedValue(null),
      loadByIssueIdentifier: vi.fn().mockResolvedValue(null)
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

function buildWorkflowObservabilityFixture(): SymphonyRuntimeWorkflowObservabilityResult {
  return {
    workflow: {
      workflowId: "workflow-1",
      trackerIssueId: "tracker-420",
      repositoryKey: "openai/symphony",
      issueIdentifier: "SYM-420",
      bindingScope: null,
      routerPresetId: "intelligent-flow",
      routerName: "symphony-intelligent-flow",
      routerVersion: "1",
      archivedAt: null,
      insertedAt: "2026-04-11T12:00:00.000Z",
      updatedAt: "2026-04-11T12:01:20.000Z"
    },
    trackerState: "In Progress",
    capability: {
      workflowId: "workflow-1",
      contractId: "contract-1",
      policyId: "default",
      planKind: "execute" as const,
      summary: "Next capability execution is implement.spec.",
      decidedAt: "2026-04-11T12:01:20.000Z",
      capabilityId: "implement.spec",
      modelProfileId: "builder_fast",
      workEpoch: 2,
      pendingClarification: null,
      completion: null
    },
    snapshot: {
      eventSequence: 4,
      currentNode: "active",
      terminal: false,
      lastSignalId: "signal_delivery_completed",
      lastDecisionId: "decision_delivery_reported",
      pendingCommandCount: 1,
      projection: {
        currentNode: "active",
        terminal: false,
        pendingCommands: [
          {
            id: "command-review",
            kind: "request.review",
            payload: {
              workflowId: "workflow-1"
            },
            dedupeKey: null
          }
        ]
      }
    },
    replay: {
      recordedEventCount: 4,
      recordedSignalCount: 2,
      recordedDecisionCount: 1,
      recordedCommandCount: 1,
      settledCommandCount: 1,
      signals: [
        {
          id: "signal_todo_observed",
          type: "tracker.state_observed",
          source: "tracker" as const,
          occurredAt: "2026-04-11T12:01:00.000Z",
          causationId: null,
          correlationId: null,
          payload: {
            trackerState: "Todo"
          }
        },
        {
          id: "signal_delivery_completed",
          type: "runtime.delivery_reported",
          source: "runtime" as const,
          occurredAt: "2026-04-11T12:01:20.000Z",
          causationId: null,
          correlationId: null,
          payload: {
            runId: "run-1",
            status: "completed"
          }
        }
      ]
    },
    routerDecision: null,
    currentModule: {
      executionId: null,
      module: {
        moduleId: "implement.spec",
        phase: "implementing",
        executionKind: "agent",
        summary: "Implement the requested ticket slice.",
        description:
          "Produces the canonical change set for the current work epoch.",
        enabledByDefault: true,
        runtimeSupported: true,
        supportedModelProfileIds: ["builder_fast", "builder_deep"],
        producesEvidenceIds: ["change_set"],
        requiresEvidenceIds: []
      },
      workEpoch: 2,
      attempt: null,
      state: "selected",
      summary: "Next capability execution is implement.spec.",
      modelProfileId: "builder_fast",
      selectedAt: "2026-04-11T12:01:20.000Z",
      startedAt: null,
      completedAt: null,
      retryable: null,
      reasonCode: null,
      failureKind: null,
      evidenceProduced: [],
      decision: null
    },
    recentModuleRuns: [],
    history: [
      {
        eventId: "history_1",
        eventSequence: 1,
        kind: "signal_recorded" as const,
        recordedAt: "2026-04-11T12:01:00.000Z",
        signalId: "signal_todo_observed",
        signalType: "tracker.state_observed",
        signalSource: "tracker" as const,
        decisionId: null,
        commandId: null,
        fromNode: null,
        toNode: null,
        edgeId: null,
        reasonCode: null,
        event: {
          kind: "signal_recorded",
          recordedAt: "2026-04-11T12:01:00.000Z",
          signal: {
            id: "signal_todo_observed",
            type: "tracker.state_observed",
            source: "tracker",
            occurredAt: "2026-04-11T12:01:00.000Z",
            causationId: null,
            correlationId: null,
            payload: {
              trackerState: "Todo"
            }
          }
        }
      },
      {
        eventId: "history_2",
        eventSequence: 2,
        kind: "decision_recorded" as const,
        recordedAt: "2026-04-11T12:01:20.000Z",
        signalId: "signal_delivery_completed",
        signalType: "runtime.delivery_reported",
        signalSource: "runtime" as const,
        decisionId: "decision_delivery_reported",
        commandId: null,
        fromNode: "bootstrapping",
        toNode: "active",
        edgeId: "claimed_run_started_to_active",
        reasonCode: "active_selected_implementation",
        event: {
          kind: "decision_recorded",
          recordedAt: "2026-04-11T12:01:20.000Z",
          decision: {
            id: "decision_delivery_reported",
            fromNode: "bootstrapping",
            toNode: "active",
            edgeId: "claimed_run_started_to_active",
            reasonCode: "active_selected_implementation",
            commands: [
              {
                id: "command-review",
                kind: "request.review",
                payload: {
                  workflowId: "workflow-1"
                },
                dedupeKey: null
              }
            ]
          }
        }
      }
    ],
    decisions: [
      {
        decisionId: "decision_delivery_reported",
        eventSequence: 2,
        signalId: "signal_delivery_completed",
        fromNode: "bootstrapping",
        toNode: "active",
        edgeId: "claimed_run_started_to_active",
        reasonCode: "active_selected_implementation",
        policy: {
          presetId: "intelligent-flow"
        },
        projectionBefore: {
          currentNode: "claimed"
        },
        projectionAfter: {
          currentNode: "active"
        },
        commands: [
          {
            commandId: "command-review",
            kind: "request.review",
            dedupeKey: null,
            payload: {
              workflowId: "workflow-1"
            },
            settled: {
              eventId: "history_4",
              eventSequence: 4,
              recordedAt: "2026-04-11T12:01:21.000Z",
              status: "succeeded" as const,
              payload: {
                accepted: true
              }
            }
          }
        ],
        trace: [
          {
            message: "Router selected implement.spec and advanced the lifecycle into active execution."
          }
        ],
        selectionMetadata: {
          score: 1
        },
        recordedAt: "2026-04-11T12:01:20.000Z",
        insertedAt: "2026-04-11T12:01:20.000Z"
      }
    ],
    filters: {
      historyLimit: 25,
      decisionLimit: 5
    }
  };
}
