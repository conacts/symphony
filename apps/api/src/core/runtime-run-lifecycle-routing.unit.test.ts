import { describe, expect, it, vi } from "vitest";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type { WorkflowCommand } from "@symphony/router";
import type { SymphonyRuntimeWorkflowReceiveSession } from "./runtime-workflow-session-types.js";
import { buildSymphonyTrackerIssue } from "@symphony/test-support";
import { createRuntimeRunLifecycleRouter } from "./runtime-run-lifecycle-routing.js";

describe("runtime run lifecycle routing", () => {
  it("settles same-mode redispatch during active lifecycle observation without mutating tracker state", async () => {
    const issue = buildSymphonyTrackerIssue({
      id: "tracker-520",
      identifier: "SYM-520",
      state: "Approved"
    });
    const command = buildDispatchCommand("approved_merge");
    const {
      routeWorkflows,
      sessionLoader,
      settleCommandAsync,
      appendCommandSettlement
    } = createCommandHarness(command);
    const tracker = {
      updateIssueState: vi.fn()
    };

    const router = await createRuntimeRunLifecycleRouter({
      routeWorkflows,
      tracker: tracker as never,
      sessionLoader
    });

    const result = await router.observeIssueState({
      issue,
      runId: "run-approved-merge-2",
      runMode: "approved_merge",
      recordedAt: "2026-04-12T18:10:00.000Z"
    });

    expect(result.issue.state).toBe("Approved");
    expect(tracker.updateIssueState).not.toHaveBeenCalled();
    expect(settleCommandAsync).toHaveBeenCalledWith({
      commandId: command.id,
      status: "succeeded",
      payload: null,
      recordedAt: "2026-04-12T18:10:00.000Z"
    });
    expect(appendCommandSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        commandId: command.id,
        status: "succeeded"
      })
    );
  });

  it("fails fast on unsupported observation command kinds", async () => {
    const issue = buildSymphonyTrackerIssue({
      id: "tracker-521",
      identifier: "SYM-521",
      state: "Approved"
    });
    const unsupportedCommand: WorkflowCommand = {
      id: "command-custom-2",
      kind: "custom.command",
      dedupeKey: null,
      payload: null
    };
    const { routeWorkflows, sessionLoader, appendCommandSettlement } =
      createCommandHarness(unsupportedCommand);

    const router = await createRuntimeRunLifecycleRouter({
      routeWorkflows,
      tracker: {
        updateIssueState: vi.fn()
      } as never,
      sessionLoader
    });

    await expect(
      router.observeIssueState({
        issue,
        runId: "run-approved-merge-2",
        runMode: "approved_merge",
        recordedAt: "2026-04-12T18:15:00.000Z"
      })
    ).rejects.toThrow(
      "Run lifecycle observation only supports tracker.transition and run.dispatch commands. Received custom.command."
    );

    expect(appendCommandSettlement).not.toHaveBeenCalled();
  });

  it("fails fast on unsupported completion command kinds", async () => {
    const issue = buildSymphonyTrackerIssue({
      id: "tracker-522",
      identifier: "SYM-522",
      state: "In Progress"
    });
    const runDispatchCommand = buildDispatchCommand("approved_merge");
    const { routeWorkflows, sessionLoader, appendCommandSettlement } =
      createCommandHarness(runDispatchCommand);

    const router = await createRuntimeRunLifecycleRouter({
      routeWorkflows,
      tracker: {
        updateIssueState: vi.fn()
      } as never,
      sessionLoader
    });

    await expect(
      router.routeCompletion({
        issue,
        runId: "run-approved-merge-3",
        runMode: "approved_merge",
        completion: {
          kind: "merged"
        },
        recordedAt: "2026-04-12T18:20:00.000Z"
      })
    ).rejects.toThrow(
      "Run completion routing only supports tracker.transition commands. Received run.dispatch."
    );

    expect(appendCommandSettlement).not.toHaveBeenCalled();
  });
});

function createCommandHarness(command: WorkflowCommand): {
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  settleCommandAsync: ReturnType<typeof vi.fn>;
  appendCommandSettlement: ReturnType<typeof vi.fn>;
} {
  const settleCommandAsync = vi.fn().mockResolvedValue({
    workflowId: "workflow-1",
    currentNode: "approved_merge",
    pendingCommands: [],
    recordedSignalIds: [],
    emittedCommandIds: [],
    terminal: false,
    sequence: 2,
    data: {
      trackerState: "Approved"
    },
    lastSignal: null,
    lastDecision: null
  });
  const session: SymphonyRuntimeWorkflowReceiveSession<string, unknown, unknown> = {
    workflowId() {
      return "workflow-1";
    },
    receiveAsync: vi.fn().mockResolvedValue({
      decision: {
        commands: [command]
      }
    }),
    settleCommandAsync
  };
  const appendCommandSettlement = vi.fn().mockResolvedValue({
    historyEvent: {
      eventId: "history-1"
    },
    snapshot: {
      snapshotId: "snapshot-1"
    }
  });
  const routing = buildRoutingSelection({
    dispatchRunMode: "approved_merge"
  });

  return {
    routeWorkflows: {
      ensureWorkflowForIssue: vi.fn(),
      loadHydrationStateByWorkflowId: vi.fn(),
      loadHydrationStateByTrackerIssueKey: vi.fn(),
      loadHydrationStateByScopedTrackerIssueKey: vi.fn(),
      loadReplayStateByWorkflowId: vi.fn(),
      loadReplayStateByTrackerIssueKey: vi.fn(),
      loadReplayStateByScopedTrackerIssueKey: vi.fn(),
      rehydrateProjectionByWorkflowId: vi.fn(),
      rehydrateProjectionByTrackerIssueKey: vi.fn(),
      rehydrateProjectionByScopedTrackerIssueKey: vi.fn(),
      resumeSessionByWorkflowId: vi.fn(),
      resumeSessionByTrackerIssueKey: vi.fn(),
      resumeSessionByScopedTrackerIssueKey: vi.fn(),
      recordRouteResult: vi.fn().mockResolvedValue(undefined),
      appendCommandSettlement
    } as SymphonyRouteWorkflowPort,
    sessionLoader: {
      loadHydrationByWorkflowId: vi.fn(),
      loadHydrationByTrackerIssueKey: vi.fn(),
      loadHydrationByScopedTrackerIssueKey: vi.fn(),
      resumeByWorkflowId: vi.fn().mockResolvedValue({
        routing,
        resumed: {
          hydrationState: {
            workflow: {
              workflowId: "workflow-1"
            }
          },
          session
        }
      }),
      resumeByTrackerIssueKey: vi.fn().mockResolvedValue({
        routing,
        resumed: {
          hydrationState: {
            workflow: {
              workflowId: "workflow-1"
            }
          },
          session
        }
      }),
      resumeByScopedTrackerIssueKey: vi.fn()
    } as SymphonyRuntimeWorkflowSessionLoader,
    settleCommandAsync,
    appendCommandSettlement
  };
}

function buildRoutingSelection(input: {
  dispatchRunMode: "implementation" | "rework" | "approved_merge";
}) {
  const runtimeAdapter: SymphonyRuntimeWorkflowPresetAdapter = {
    createTrackerStateObservedSignal: vi.fn().mockImplementation((signal) => ({
      ...signal,
      type: "tracker.state_observed",
      source: "tracker",
      payload: {
        state: signal.trackerState,
        runId: signal.runId,
        runMode: signal.runMode
      }
    })),
    createRunStartedSignal: vi.fn(),
    createRuntimeCompletionSignal: vi.fn().mockImplementation((signal) => ({
      ...signal,
      type: "runtime.completed",
      source: "runtime",
      payload: {
        runId: signal.runId,
        runMode: signal.runMode,
        completion: signal.completion
      }
    })),
    createDeliveryReportedSignal: vi.fn(),
    createMergeResultReportedSignal: vi.fn(),
    createReviewReworkRequestedSignal: vi.fn(),
    createStateRequestedSignal: vi.fn(),
    createShutdownRequestedSignal: vi.fn(),
    readTrackerStateFromProjection: vi.fn(),
    shouldObserveUnchangedIdleTrackerState: vi.fn(),
    readLastDispatchModeFromProjection: vi.fn(),
    readActiveRunModeFromProjection: vi.fn(),
    readLatestReworkHandoffFromProjection: vi.fn(),
    readLatestMergeResultFromProjection: vi.fn(),
    readTrackerTransitionState: vi.fn(),
    readDispatchRunMode: vi.fn().mockReturnValue(input.dispatchRunMode)
  };

  return {
    presetId: "current-flow",
    router: {} as never,
    policy: {},
    module: {
      runtimeAdapter
    }
  } as never;
}

function buildDispatchCommand(
  runMode: "implementation" | "rework" | "approved_merge"
): WorkflowCommand {
  return {
    id: "command-dispatch-2",
    kind: "run.dispatch",
    dedupeKey: null,
    payload: {
      runMode
    }
  };
}
