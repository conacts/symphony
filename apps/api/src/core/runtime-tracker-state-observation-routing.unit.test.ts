import { describe, expect, it, vi } from "vitest";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";
import type { WorkflowCommand } from "@symphony/router";
import { buildSymphonyTrackerIssue } from "@symphony/test-support";
import { createRuntimeTrackerStateObservationRouter } from "./runtime-tracker-state-observation-routing.js";
import type { SymphonyRuntimeWorkflowReceiveSession } from "./runtime-workflow-session-types.js";

describe("runtime tracker state observation routing", () => {
  it("settles same-mode active redispatch inside workflow history without updating tracker state", async () => {
    const issue = buildSymphonyTrackerIssue({
      id: "tracker-420",
      identifier: "SYM-420",
      state: "Approved"
    });
    const command = buildDispatchCommand("approved_merge");
    const { routeWorkflows, sessionLoader, settleCommandAsync, appendCommandSettlement } =
      createCommandHarness({
        command,
        issueIdentifier: issue.identifier
      });
    const tracker = {
      fetchIssueByIdentifier: vi.fn().mockResolvedValue(issue),
      updateIssueState: vi.fn()
    };

    const router = await createRuntimeTrackerStateObservationRouter({
      routeWorkflows,
      tracker: tracker as never,
      trackerConfig: {} as never,
      repositoryKey: "openai/symphony",
      routing: buildRoutingSelection({
        dispatchRunMode: "approved_merge"
      }),
      sessionLoader
    });

    const result = await router.observe({
      observationKind: "active",
      issueIdentifier: issue.identifier,
      runId: "run-approved-merge-1",
      runMode: "approved_merge",
      recordedAt: "2026-04-12T18:00:00.000Z"
    });

    expect(result?.issue.state).toBe("Approved");
    expect(tracker.updateIssueState).not.toHaveBeenCalled();
    expect(settleCommandAsync).toHaveBeenCalledWith({
      commandId: command.id,
      status: "succeeded",
      payload: null,
      recordedAt: "2026-04-12T18:00:00.000Z"
    });
    expect(appendCommandSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        commandId: command.id,
        status: "succeeded"
      })
    );
  });

  it("fails fast on unsupported tracker observation command kinds", async () => {
    const issue = buildSymphonyTrackerIssue({
      id: "tracker-421",
      identifier: "SYM-421",
      state: "Approved"
    });
    const unsupportedCommand: WorkflowCommand = {
      id: "command-custom-1",
      kind: "custom.command",
      dedupeKey: null,
      payload: null
    };
    const { routeWorkflows, sessionLoader, appendCommandSettlement } =
      createCommandHarness({
        command: unsupportedCommand,
        issueIdentifier: issue.identifier
      });
    const tracker = {
      fetchIssueByIdentifier: vi.fn().mockResolvedValue(issue),
      updateIssueState: vi.fn()
    };

    const router = await createRuntimeTrackerStateObservationRouter({
      routeWorkflows,
      tracker: tracker as never,
      trackerConfig: {} as never,
      repositoryKey: "openai/symphony",
      routing: buildRoutingSelection({
        dispatchRunMode: "approved_merge"
      }),
      sessionLoader
    });

    await expect(
      router.observe({
        observationKind: "active",
        issueIdentifier: issue.identifier,
        runId: "run-approved-merge-1",
        runMode: "approved_merge",
        recordedAt: "2026-04-12T18:05:00.000Z"
      })
    ).rejects.toThrow(
      "Tracker state observation only supports tracker.transition and run.dispatch commands. Received custom.command."
    );

    expect(appendCommandSettlement).not.toHaveBeenCalled();
    expect(tracker.updateIssueState).not.toHaveBeenCalled();
  });
});

function createCommandHarness(input: {
  command: WorkflowCommand;
  issueIdentifier: string;
}): {
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
        commands: [input.command]
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

  return {
    routeWorkflows: {
      ensureWorkflowForIssue: vi.fn().mockResolvedValue({
        workflow: {
          workflowId: "workflow-1"
        }
      }),
      loadHydrationStateByWorkflowId: vi.fn(),
      loadHydrationStateByIssueIdentifier: vi.fn(),
      loadHydrationStateByScopedIssue: vi.fn(),
      loadReplayStateByWorkflowId: vi.fn(),
      loadReplayStateByIssueIdentifier: vi.fn(),
      loadReplayStateByScopedIssue: vi.fn(),
      rehydrateProjectionByWorkflowId: vi.fn(),
      rehydrateProjectionByIssueIdentifier: vi.fn(),
      rehydrateProjectionByScopedIssue: vi.fn(),
      resumeSessionByWorkflowId: vi.fn(),
      resumeSessionByIssueIdentifier: vi.fn(),
      resumeSessionByScopedIssue: vi.fn(),
      recordRouteResult: vi.fn().mockResolvedValue(undefined),
      appendCommandSettlement
    } as SymphonyRouteWorkflowPort,
    sessionLoader: {
      loadHydrationByWorkflowId: vi.fn(),
      loadHydrationByIssueIdentifier: vi.fn(),
      loadHydrationByScopedIssue: vi.fn(),
      resumeByWorkflowId: vi.fn().mockResolvedValue({
        routing: buildRoutingSelection({
          dispatchRunMode: "approved_merge"
        }),
        resumed: {
          hydrationState: {
            workflow: {
              workflowId: "workflow-1"
            }
          },
          session
        }
      }),
      resumeByIssueIdentifier: vi.fn(),
      resumeByScopedIssue: vi.fn()
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
    createRuntimeCompletionSignal: vi.fn(),
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
    id: "command-dispatch-1",
    kind: "run.dispatch",
    dedupeKey: null,
    payload: {
      runMode
    }
  };
}
