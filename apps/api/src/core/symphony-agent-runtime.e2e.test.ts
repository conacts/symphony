import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRouteWorkflowStore,
  createSqliteAgentAnalyticsStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb,
  type RouteWorkflowStore,
  type SymphonyRuntimeLogEntry,
  type SymphonyRuntimeRunStore
} from "@symphony/db";
import {
  HarnessSessionError,
  type HarnessTurnResult
} from "@symphony/agent-harnesses";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import {
  createSymphonyCapabilityPreset,
  createSymphonyTicketExecutionContract,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyWorkflowCapabilityPreset
} from "@symphony/router";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import {
  createMemorySymphonyTracker,
  type MemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import { createSilentSymphonyLogger } from "@symphony/logger";
import {
  buildHarnessAgentMessageCompletedUpdate,
  buildHarnessCommandProgressUpdate,
  buildHarnessCommandStartedUpdate,
  buildHarnessCommandCompletedUpdate,
  buildHarnessFailedTurnResult,
  buildImplementationModuleResult,
  buildImplementationModuleResultMessage,
  createTranscriptDrivenFakeHarnessBuilder,
  createTranscriptDrivenFakeHarnessStartSession,
  type TranscriptDrivenFakeHarnessBuilder,
  type TranscriptDrivenFakeHarnessController,
  type TranscriptDrivenFakeHarnessStep
} from "../test-support/transcript-driven-fake-harness.js";
import { buildBindMountPreparedWorkspace } from "../test-support/create-symphony-runtime-test-harness.js";
import {
  createDefaultRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";
import {
  createRouteWorkflowPort,
  type SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import {
  createRuntimeWorkflowSessionLoader,
  type SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import {
  createRuntimeRouteLifecycleService,
  type SymphonyRuntimeRouteLifecycleService
} from "./runtime-route-lifecycle-service.js";
import {
  createSymphonyCapabilityPlanningService,
  type SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  createSymphonyCapabilityOperatorService,
  type SymphonyCapabilityOperatorService
} from "./symphony-capability-operator.js";
import {
  createExternalRunDispatchAuthority
} from "../test-support/runtime-dispatch-authority-stub.js";
import {
  createDbBackedOrchestratorObserver
} from "./runtime-db-observer.js";

const { startSessionMock } = vi.hoisted(() => ({
  startSessionMock: vi.fn()
}));

vi.mock("./runtime-harness.js", () => ({
  createPiRuntimeHarness: () => ({
    kind: "pi",
    definition: {} as never,
    startSession: startSessionMock
  })
}));

type RuntimeAgentExecutionHarness = {
  root: string;
  issue: SymphonyTrackerIssue;
  tracker: MemorySymphonyTracker;
  routeWorkflowStore: RouteWorkflowStore;
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  capabilityPlanning: SymphonyCapabilityPlanningService;
  capabilityOperator: SymphonyCapabilityOperatorService;
  service: SymphonyRuntimeRouteLifecycleService;
  runStore: SymphonyRuntimeRunStore;
  runtimePolicy: ReturnType<typeof buildSymphonyRuntimePolicy>;
  workspace: ReturnType<typeof buildBindMountPreparedWorkspace>;
  cleanup(): Promise<void>;
  prepareInitialImplementationRun(recordedAt: string): Promise<{
    workflowId: string;
    runId: string;
    issue: SymphonyTrackerIssue;
  }>;
  prepareResumedImplementationRun(recordedAt: string): Promise<{
    runId: string;
    issue: SymphonyTrackerIssue;
  }>;
  runTranscript(input: {
    transcript: TranscriptDrivenFakeHarnessBuilder | TranscriptDrivenFakeHarnessStep[];
    runId: string;
    issue: SymphonyTrackerIssue;
    attempt?: number;
    completionRecordedAt: string;
  }): Promise<{
    completion: SymphonyAgentRuntimeCompletion;
    routeResult: Awaited<
      ReturnType<SymphonyRuntimeRouteLifecycleService["workflowRoutingAdapter"]["routeRunCompletion"]>
    >;
    controller: TranscriptDrivenFakeHarnessController;
  }>;
  listRuntimeLogs(): Promise<SymphonyRuntimeLogEntry[]>;
  listSignalTypes(workflowId: string): Promise<string[]>;
};

let harness: RuntimeAgentExecutionHarness | null = null;

afterEach(async () => {
  vi.clearAllMocks();
  await harness?.cleanup();
  harness = null;
});

describe("agent runtime transcript golden paths", () => {
  it("routes a transcript-driven delivered session to Done after terminal detection", async () => {
    harness = await createRuntimeAgentExecutionHarness();

    const prepared = await harness.prepareInitialImplementationRun(
      "2026-04-15T10:00:00.000Z"
    );

    const executed = await harness.runTranscript({
      runId: prepared.runId,
      issue: prepared.issue,
      completionRecordedAt: "2026-04-15T10:00:05.000Z",
      transcript: createTranscriptDrivenFakeHarnessBuilder()
        .update(
          buildHarnessCommandCompletedUpdate({
            command: "pnpm verify:precommit",
            aggregatedOutput: "verification complete",
            exitCode: 0
          })
        )
        .update(
          buildHarnessAgentMessageCompletedUpdate({
            text: buildImplementationModuleResultMessage()
          })
        )
        .awaitCloseThenThrow(
          new Error("session closed after terminal result detection")
        )
    });

    expect(executed.completion).toEqual(
      expect.objectContaining({
        kind: "delivered"
      })
    );
    expect(executed.routeResult).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "Done"
      }),
      continueWithRunMode: null
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");
    expect(executed.controller.closeRequested).toBe(true);

    const workflowLifecycle = await harness.service.loadWorkflowLifecycleView({
      issueIdentifier: harness.issue.identifier,
      runId: prepared.runId
    });
    expect(workflowLifecycle).toEqual(
      expect.objectContaining({
        workflowId: prepared.workflowId,
        trackerState: "Done"
      })
    );

    const signalTypes = await harness.listSignalTypes(prepared.workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "capability.completed",
        "runtime.completed"
      ])
    );

    const runtimeLogs = await harness.listRuntimeLogs();
    expect(runtimeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "runtime_terminal_result_detected",
          payload: expect.objectContaining({
            completionKind: "delivered",
            moduleId: "implement.spec",
            requestedState: "done"
          })
        }),
        expect.objectContaining({
          eventType: "runtime_run_completed",
          payload: expect.objectContaining({
            outcome: "completed",
            completionKind: "delivered"
          })
        })
      ])
    );
    expect(
      runtimeLogs.some((entry) => entry.eventType === "runtime_timeout_classified")
    ).toBe(false);
  });

  it("records transport timeouts as runtime failures and pauses the tracker shell", async () => {
    harness = await createRuntimeAgentExecutionHarness();

    const prepared = await harness.prepareInitialImplementationRun(
      "2026-04-15T10:10:00.000Z"
    );

    const executed = await harness.runTranscript({
      runId: prepared.runId,
      issue: prepared.issue,
      completionRecordedAt: "2026-04-15T10:10:05.000Z",
      transcript: createTranscriptDrivenFakeHarnessBuilder().throw(
        new HarnessSessionError(
          "pi_runner_transport_timeout",
          "Timed out waiting for Pi SDK bridge output after 5000ms.",
          {
            kind: "transport_timeout",
            transportTimeoutMs: 5_000,
            diagnostics: {
              recentStdoutLines: [],
              recentStderrLines: ["waiting for event"]
            }
          }
        )
      )
    });

    expect(executed.completion).toEqual(
      expect.objectContaining({
        kind: "failure",
        reason: "Timed out waiting for Pi SDK bridge output after 5000ms."
      })
    );
    expect(executed.routeResult.issue.state).toBe("Paused");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");

    const signalTypes = await harness.listSignalTypes(prepared.workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "capability.failed",
        "runtime.completed"
      ])
    );

    const runtimeLogs = await harness.listRuntimeLogs();
    expect(runtimeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "runtime_timeout_classified",
          payload: expect.objectContaining({
            failureClass: "transport_timeout",
            timeoutClass: "transport_timeout",
            thresholdMs: 5_000
          })
        }),
        expect.objectContaining({
          eventType: "runtime_run_paused",
          payload: expect.objectContaining({
            completionKind: "failure"
          })
        })
      ])
    );
  });

  it("records tool timeouts as runtime failures and pauses the tracker shell", async () => {
    harness = await createRuntimeAgentExecutionHarness();

    const prepared = await harness.prepareInitialImplementationRun(
      "2026-04-15T10:15:00.000Z"
    );

    const executed = await harness.runTranscript({
      runId: prepared.runId,
      issue: prepared.issue,
      completionRecordedAt: "2026-04-15T10:15:05.000Z",
      transcript: createTranscriptDrivenFakeHarnessBuilder().resolve(
        buildHarnessFailedTurnResult({
          reason: "Command execution exceeded the configured timeout.",
          failureClass: "tool_timeout",
          detail: {
            kind: "terminal_result",
            result: {
              finalAssistantMessage: null,
              moduleResult: null,
              stopReason: null,
              providerStopReason: null,
              lastActivityAt: "2026-04-15T10:15:04.000Z",
              lastActivityType: "tool_call_heartbeat"
            },
            timeoutTrigger: {
              failureClass: "tool_timeout",
              thresholdMs: 30_000,
              callId: "tool-bash-1",
              toolName: "shell",
              commandText: "pnpm test",
              lastActivityAt: "2026-04-15T10:15:04.000Z",
              lastActivityType: "tool_call_heartbeat"
            }
          }
        })
      )
    });

    expect(executed.completion).toEqual(
      expect.objectContaining({
        kind: "failure",
        reason: "Command execution exceeded the configured timeout."
      })
    );
    expect(executed.routeResult.issue.state).toBe("Paused");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");

    const signalTypes = await harness.listSignalTypes(prepared.workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "capability.failed",
        "runtime.completed"
      ])
    );

    const runtimeLogs = await harness.listRuntimeLogs();
    expect(runtimeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "runtime_timeout_classified",
          payload: expect.objectContaining({
            failureClass: "tool_timeout",
            timeoutClass: "tool_timeout",
            thresholdMs: 30_000,
            callId: "tool-bash-1",
            toolName: "shell",
            commandText: "pnpm test",
            lastActivityType: "tool_call_heartbeat"
          })
        }),
        expect.objectContaining({
          eventType: "runtime_run_paused",
          payload: expect.objectContaining({
            completionKind: "failure"
          })
        })
      ])
    );
  });

  it("routes heartbeat-backed command progress to Done without timeout classification", async () => {
    harness = await createRuntimeAgentExecutionHarness();

    const prepared = await harness.prepareInitialImplementationRun(
      "2026-04-15T10:17:00.000Z"
    );

    const executed = await harness.runTranscript({
      runId: prepared.runId,
      issue: prepared.issue,
      completionRecordedAt: "2026-04-15T10:17:05.000Z",
      transcript: createTranscriptDrivenFakeHarnessBuilder()
        .update(
          buildHarnessCommandStartedUpdate({
            id: "command-build-1",
            command: "pnpm build"
          })
        )
        .update(
          buildHarnessCommandProgressUpdate({
            id: "command-build-1",
            command: "pnpm build",
            aggregatedOutput: "Build is still running..."
          })
        )
        .update(
          buildHarnessCommandCompletedUpdate({
            id: "command-build-1",
            command: "pnpm build",
            aggregatedOutput: "Build passed.",
            exitCode: 0
          })
        )
        .update(
          buildHarnessAgentMessageCompletedUpdate({
            text: buildImplementationModuleResultMessage({
              summary:
                "Implemented the requested issue behavior after the long-running build completed."
            })
          })
        )
        .awaitCloseThenThrow(
          new Error("session closed after terminal result detection")
        )
    });

    expect(executed.completion).toEqual(
      expect.objectContaining({
        kind: "delivered"
      })
    );
    expect(executed.routeResult).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "Done"
      }),
      continueWithRunMode: null
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");
    expect(executed.controller.closeRequested).toBe(true);

    const signalTypes = await harness.listSignalTypes(prepared.workflowId);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "capability.completed",
        "runtime.completed"
      ])
    );
    expect(signalTypes).not.toContain("capability.failed");

    const runtimeLogs = await harness.listRuntimeLogs();
    expect(runtimeLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "runtime_terminal_result_detected",
          payload: expect.objectContaining({
            completionKind: "delivered",
            moduleId: "implement.spec",
            requestedState: "done"
          })
        }),
        expect.objectContaining({
          eventType: "runtime_run_completed",
          payload: expect.objectContaining({
            outcome: "completed",
            completionKind: "delivered"
          })
        })
      ])
    );
    expect(
      runtimeLogs.some((entry) => entry.eventType === "runtime_timeout_classified")
    ).toBe(false);
    expect(
      runtimeLogs.some((entry) => entry.eventType === "runtime_run_paused")
    ).toBe(false);
  });

  it("resumes a clarification-requested runtime session with a fresh session and completes the same capability", async () => {
    harness = await createRuntimeAgentExecutionHarness();

    const prepared = await harness.prepareInitialImplementationRun(
      "2026-04-15T10:20:00.000Z"
    );

    const firstRun = await harness.runTranscript({
      runId: prepared.runId,
      issue: prepared.issue,
      completionRecordedAt: "2026-04-15T10:20:05.000Z",
      transcript: createTranscriptDrivenFakeHarnessBuilder().resolve(
        buildAwaitingInputTurnResult()
      )
    });

    expect(firstRun.completion).toEqual(
      expect.objectContaining({
        kind: "awaiting_input"
      })
    );
    expect(firstRun.routeResult.issue.state).toBe("In Progress");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");

    const pending = await harness.capabilityOperator.inspectByIssueIdentifier({
      issueIdentifier: harness.issue.identifier,
      recordedAt: "2026-04-15T10:20:06.000Z"
    });
    if (
      !pending ||
      pending.capability === null ||
      pending.pendingClarification === null
    ) {
      throw new TypeError("Expected a pending clarification after awaiting_input.");
    }
    const [question] = pending.pendingClarification.questions;
    if (!question) {
      throw new TypeError("Expected the pending clarification to include a question.");
    }

    await harness.capabilityOperator.answerPendingClarificationByWorkflowId({
      workflowId: pending.capability.workflowId,
      recordedAt: "2026-04-15T10:20:07.000Z",
      requestId: pending.pendingClarification.requestId,
      answers: {
        [question.id]: "Use https://api.example.com as the production API host."
      }
    });

    const resumed = await harness.prepareResumedImplementationRun(
      "2026-04-15T10:20:08.000Z"
    );
    const secondRun = await harness.runTranscript({
      runId: resumed.runId,
      issue: resumed.issue,
      attempt: 2,
      completionRecordedAt: "2026-04-15T10:20:10.000Z",
      transcript: createTranscriptDrivenFakeHarnessBuilder()
        .update(
          buildHarnessAgentMessageCompletedUpdate({
            text: buildImplementationModuleResultMessage({
              summary: "Implemented the requested issue behavior using the clarified API host."
            })
          })
        )
        .resolve(buildCompletedTurnResult())
    });

    expect(secondRun.completion).toEqual(
      expect.objectContaining({
        kind: "delivered"
      })
    );
    expect(secondRun.routeResult).toEqual({
      issue: expect.objectContaining({
        id: harness.issue.id,
        state: "Done"
      }),
      continueWithRunMode: null
    });
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

    const signalTypes = await harness.listSignalTypes(prepared.workflowId);
    expect(countSignalType(signalTypes, "capability.started")).toBe(2);
    expect(countSignalType(signalTypes, "capability.completed")).toBe(1);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "workflow.clarification_requested",
        "workflow.clarification_answered",
        "runtime.completed"
      ])
    );
  });
});

async function createRuntimeAgentExecutionHarness(): Promise<RuntimeAgentExecutionHarness> {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-agent-runtime-e2e-"));
  const issue = buildSymphonyTrackerIssue({
    state: "Todo"
  });
  const baseRuntimePolicy = buildSymphonyRuntimePolicy();
  const runtimePolicy = {
    ...baseRuntimePolicy,
    workspace: {
      ...baseRuntimePolicy.workspace,
      root
    }
  };
  const tracker = createMemorySymphonyTracker([issue]);
  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const repositoryKey = "openai/symphony";
  const issueStore = createSymphonyIssueStore(database.db);
  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey,
    latestRunStartedAt: null,
    recordedAt: "2026-04-15T09:59:00.000Z"
  });

  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
    repositoryKey
  });
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
    repositoryKey
  });
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: database.db,
    timelineStore: issueTimelineStore
  });
  const agentAnalyticsStore = createSqliteAgentAnalyticsStore({
    db: database.db
  });
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const capabilityPlanning = createSymphonyCapabilityPlanningService({
    routeWorkflowStore,
    createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker
  });
  const capabilityOperator = createSymphonyCapabilityOperatorService({
    routeWorkflowStore,
    routeWorkflows,
    sessionLoader,
    capabilityPlanning
  });
  const service = await createRuntimeRouteLifecycleService({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey,
    presetSelection: {
      ...createDefaultRuntimeWorkflowPresetSelection(),
      presetId: "intelligent-flow"
    },
    capabilityDispatchAuthority: createExternalRunDispatchAuthority(),
    routeWorkflowStore,
    capabilityPlanning
  });
  const workspacePath = path.join(root, `symphony-${issue.identifier}`);
  await mkdir(workspacePath, {
    recursive: true
  });
  const workspace = buildBindMountPreparedWorkspace(issue.identifier, workspacePath);
  const observer = createDbBackedOrchestratorObserver({
    admittedRepositories: [
      {
        repositoryKey,
        repoRoot: root,
        linearBinding: {
          teamKey: issue.teamKey
        },
        promptContract: {
          repoRoot: root,
          promptPath: path.join(root, ".symphony", "prompt.md"),
          template: "Implement the issue.",
          variables: []
        },
        runtimeManifest: {
          manifest: {
            repositoryKey,
            linear: {
              teamKey: issue.teamKey
            }
          }
        }
      } as never
    ],
    runStore,
    issueTimelineStore,
    runtimeLogs: runtimeLogStore
  });

  return {
    root,
    issue,
    tracker,
    routeWorkflowStore,
    routeWorkflows,
    sessionLoader,
    capabilityPlanning,
    capabilityOperator,
    service,
    runStore,
    runtimePolicy,
    workspace,
    async cleanup() {
      database.close();
      await rm(root, {
        recursive: true,
        force: true
      });
    },
    async prepareInitialImplementationRun(recordedAt) {
      await service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: recordedAt
      });

      const bootstrappingIssue = requireTrackedIssue(tracker, issue.id);
      const runId = requireRunId(
        await observer.startRun({
          harness: "pi",
          issue: bootstrappingIssue,
          attempt: 1,
          workspace,
          workerHost: null,
          startedAt: recordedAt,
          runMode: "implementation"
        })
      );
      const activated = await service.workflowRoutingAdapter.activateRunStart({
        issue: bootstrappingIssue,
        runId,
        runMode: "implementation",
        threadId: `thread-${runId}`,
        workerHost: null,
        launchTarget: null,
        recordedAt: incrementIsoTimestamp(recordedAt, 1)
      });

      const workflowId = await loadRequiredWorkflowId(routeWorkflows, issue.identifier);
      await routeWorkflows.saveExecutionContract({
        workflowId,
        contract: buildImplementationOnlyContract({
          workflowId,
          issueIdentifier: issue.identifier,
          repositoryKey,
          summary: issue.title,
          recordedAt: incrementIsoTimestamp(recordedAt, 2)
        }),
        recordedAt: incrementIsoTimestamp(recordedAt, 2)
      });

      return {
        workflowId,
        runId,
        issue: activated.issue
      };
    },
    async prepareResumedImplementationRun(recordedAt) {
      const inProgressIssue = requireTrackedIssue(tracker, issue.id);
      const runId = requireRunId(
        await observer.startRun({
          harness: "pi",
          issue: inProgressIssue,
          attempt: 2,
          workspace,
          workerHost: null,
          startedAt: recordedAt,
          runMode: "implementation"
        })
      );
      const activated = await service.workflowRoutingAdapter.activateRunStart({
        issue: inProgressIssue,
        runId,
        runMode: "implementation",
        threadId: `thread-${runId}`,
        workerHost: null,
        launchTarget: null,
        recordedAt: incrementIsoTimestamp(recordedAt, 1)
      });

      return {
        runId,
        issue: activated.issue
      };
    },
    async runTranscript(input) {
      const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
        transcript: input.transcript
      });
      startSessionMock.mockImplementationOnce(fakeHarness.startSession);

      const completionResult = await new Promise<{
        completion: SymphonyAgentRuntimeCompletion;
        routeResult: Awaited<
          ReturnType<SymphonyRuntimeRouteLifecycleService["workflowRoutingAdapter"]["routeRunCompletion"]>
        >;
        controller: TranscriptDrivenFakeHarnessController;
      }>((resolve, reject) => {
        void import("./agent-harness-runtime.js")
          .then((module) =>
            module.createSymphonyAgentRuntime({
              promptContract: {
                repoRoot: root,
                promptPath: path.join(root, ".symphony", "prompt.md"),
                template: "Implement the issue.",
                variables: []
              },
              githubRepository: repositoryKey,
              tracker,
              runStore,
              loadWorkflowLifecycleView: ({ issueIdentifier, runId = null }) =>
                service.loadWorkflowLifecycleView({
                  issueIdentifier,
                  runId
                }),
              observeActiveWorkflowIssueState: ({ issueIdentifier, recordedAt }) =>
                service.observeActiveIssueStateByIdentifier({
                  issueIdentifier,
                  recordedAt
                }),
              isCapabilityManagedRun: async () => true,
              agentAnalytics: agentAnalyticsStore,
              runtimeLogs: runtimeLogStore,
              hostCommandEnvSource: {},
              logger: createSilentSymphonyLogger("@symphony/api.runtime-e2e"),
              callbacks: {
                onUpdate: async () => {},
                onComplete: async (issueId, completion) => {
                  try {
                    const currentIssue = requireTrackedIssue(tracker, issueId);
                    const routeResult =
                      await service.workflowRoutingAdapter.routeRunCompletion({
                        issue: currentIssue,
                        runId: input.runId,
                        runMode: "implementation",
                        completion,
                        recordedAt: input.completionRecordedAt
                      });
                    await observer.finalizeRun({
                      issue: input.issue,
                      runId: input.runId,
                      completion,
                      workerHost: input.issue.branchName ?? null,
                      workspace,
                      startedAt: input.completionRecordedAt,
                      endedAt: incrementIsoTimestamp(
                        input.completionRecordedAt,
                        1
                      ),
                      turnCount: fakeHarness.controller.runTurnCalls.length,
                      inputTokens: 0,
                      outputTokens: 0,
                      totalTokens: 0
                    });
                    resolve({
                      completion,
                      routeResult,
                      controller: fakeHarness.controller
                    });
                  } catch (error) {
                    reject(error);
                  }
                }
              }
            })
          )
          .then(async (runtime) => {
            await runtime.startRun({
              issue: input.issue,
              runId: input.runId,
              attempt: input.attempt ?? 1,
              runMode: "implementation",
              runtimePolicy,
              workspace
            });
          })
          .catch(reject);
      });

      return completionResult;
    },
    async listRuntimeLogs() {
      return await runtimeLogStore.list({
        issueIdentifier: issue.identifier,
        limit: 200
      });
    },
    async listSignalTypes(workflowId) {
      const history = await routeWorkflowStore.listHistory(workflowId);
      return history.flatMap((entry) =>
        entry.event.kind === "signal_recorded"
          ? [entry.signalType ?? entry.event.signal.type]
          : []
      );
    }
  };
}

function buildImplementationOnlyContract(input: {
  workflowId: string;
  issueIdentifier: string;
  repositoryKey: string;
  summary: string;
  recordedAt: string;
}) {
  return createSymphonyTicketExecutionContract({
    contractId: `contract_${input.workflowId}`,
    workflowId: input.workflowId,
    issueIdentifier: input.issueIdentifier,
    repositoryKey: input.repositoryKey,
    summary: input.summary,
    objective: "Prove runtime transcript execution against the intelligent-flow path.",
    doneDefinition:
      "The runtime session records a valid module result and the workflow shell reaches the expected terminal state.",
    routingDirectives: {
      requiredCapabilityIds: ["implement.spec"],
      preferredCapabilityIds: [],
      forbiddenCapabilityIds: [],
      requiredEvidenceIds: ["change_set"],
      allowedModelProfileIds: [
        "builder_fast",
        "builder_deep",
        "critic_strict",
        "critic_adversarial",
        "critic_browser"
      ] satisfies SymphonyCapabilityModelProfileId[],
      clarificationPolicy: {
        mode: "required"
      },
      reviewStrictness: "strict",
      maxRetryCount: 2
    },
    createdAt: input.recordedAt,
    updatedAt: input.recordedAt
  });
}

async function loadRequiredWorkflowId(
  routeWorkflows: SymphonyRouteWorkflowPort,
  issueIdentifier: string
): Promise<string> {
  const hydration = await routeWorkflows.loadHydrationStateByIssueIdentifier(
    issueIdentifier
  );
  if (!hydration) {
    throw new TypeError(
      `Expected workflow hydration for ${issueIdentifier}.`
    );
  }

  return hydration.workflow.workflowId;
}

function requireTrackedIssue(
  tracker: MemorySymphonyTracker,
  issueId: string
): SymphonyTrackerIssue {
  const issue = tracker.getIssue(issueId);
  if (!issue) {
    throw new TypeError(`Expected tracked issue ${issueId}.`);
  }

  return issue;
}

function requireRunId(runId: string | null): string {
  if (!runId) {
    throw new TypeError("Expected observer.startRun to return a run id.");
  }

  return runId;
}

function createNeutralCapabilityPresetFactory() {
  return (
    input: {
      policyId?: SymphonyCapabilityPresetPolicyId;
    } = {}
  ): SymphonyWorkflowCapabilityPreset => {
    const preset = createSymphonyCapabilityPreset({
      policyId: input.policyId
    });

    return {
      capabilities: preset.capabilities.map((definition) => ({
        ...definition
      })),
      modelProfiles: preset.modelProfiles.map((profile) => ({
        ...profile
      })),
      defaultPolicy: {
        requiredCapabilityIds: [],
        preferredCapabilityIds: [],
        forbiddenCapabilityIds: [],
        requiredEvidenceIds: [],
        allowedModelProfileIds: preset.modelProfiles.map((profile) => profile.id),
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2
      }
    };
  };
}

function buildAwaitingInputTurnResult(): Extract<
  HarnessTurnResult,
  { kind: "awaiting_input" }
> {
  const prompt = "Provide the production API host.";

  return {
    kind: "awaiting_input",
    threadId: "thread-1",
    turnId: "turn-1",
    usage: null,
    reason: "Need the production API host before continuing.",
    prompt,
    detail: {
      finalAssistantMessage: null,
      moduleResult: buildImplementationModuleResult({
        outcome: "awaiting_input",
        summary: "Need the production API host before continuing.",
        requestedState: "awaiting_input",
        nextInputPrompt: prompt
      }),
      stopReason: null,
      providerStopReason: null,
      lastActivityAt: null,
      lastActivityType: null
    }
  };
}

function buildCompletedTurnResult(): Extract<HarnessTurnResult, { kind: "completed" }> {
  return {
    kind: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    usage: null
  };
}

function incrementIsoTimestamp(timestamp: string, seconds: number): string {
  return new Date(Date.parse(timestamp) + seconds * 1_000).toISOString();
}

function countSignalType(signalTypes: string[], signalType: string) {
  return signalTypes.filter((candidate) => candidate === signalType).length;
}
