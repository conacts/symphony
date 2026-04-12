import { describe, expect, it } from "vitest";
import {
  createSymphonyOrchestratorState,
  prepareIssueForDispatch,
  SymphonyOrchestrator as BaseSymphonyOrchestrator
} from "./symphony-orchestrator.js";
import { SymphonyDispatchRefusedError } from "./symphony-orchestrator-errors.js";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyWorkflowRoutingAdapter
} from "./symphony-orchestrator-types.js";
import { SymphonyRuntimeManifestError } from "@symphony/runtime-contract";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type {
  AgentRunLaunch,
  AgentRuntime
} from "./agent-runtime.js";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { SymphonyWorkspaceError } from "@symphony/workspace";
import {
  buildSymphonyOrchestratorConfig,
  buildSymphonyTrackerIssue,
  createTestOrchestratorRoutingAdapters,
  createTestWorkspaceBackend
} from "./orchestrator-test-support.js";

function createAgentRuntime(
  overrides: Partial<AgentRuntime> = {}
): AgentRuntime {
  return {
    async startRun(): Promise<AgentRunLaunch> {
      return {
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null
      };
    },
    async stopRun() {
      return;
    },
    ...overrides
  };
}

type SymphonyOrchestratorInput = ConstructorParameters<
  typeof BaseSymphonyOrchestrator
>[0];

class SymphonyOrchestrator extends BaseSymphonyOrchestrator {
  constructor(
    input: Omit<
      SymphonyOrchestratorInput,
      "workflowRoutingAdapter"
    > &
      Partial<{
        workflowRoutingAdapter: Partial<SymphonyWorkflowRoutingAdapter>;
      }>
  ) {
    const routing = createTestOrchestratorRoutingAdapters({
      config: input.config,
      tracker: input.tracker,
      overrides: input.workflowRoutingAdapter
    });

    super({
      ...input,
      ...routing
    });
  }
}

describe("symphony orchestrator", () => {
  it("claims an issue before startup completes so concurrent polls cannot redispatch it", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const issue = buildSymphonyTrackerIssue();
    const tracker = createMemorySymphonyTracker([issue]);
    let prepareWorkspaceCalls = 0;
    let releasePrepareWorkspace: (() => void) | null = null;
    const prepareWorkspacePromise = new Promise<void>((resolve) => {
      releasePrepareWorkspace = resolve;
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: {
        ...createTestWorkspaceBackend({
          commandRunner: async () => ({
            exitCode: 0,
            stdout: "",
            stderr: ""
          })
        }),
        async prepareWorkspace(input) {
          prepareWorkspaceCalls += 1;
          await prepareWorkspacePromise;
          return await createTestWorkspaceBackend({
            commandRunner: async () => ({
              exitCode: 0,
              stdout: "",
              stderr: ""
            })
          }).prepareWorkspace(input);
        }
      },
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    const firstPoll = orchestrator.runPollCycle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(orchestrator.snapshot().claimedIssueIds).toContain(issue.id);

    await orchestrator.runPollCycle();
    expect(prepareWorkspaceCalls).toBe(1);

    expect(releasePrepareWorkspace).not.toBeNull();
    releasePrepareWorkspace!();
    await firstPoll;

    expect(orchestrator.snapshot().running).toHaveLength(1);
    expect(orchestrator.snapshot().running[0]?.issue.id).toBe(issue.id);
  });

  it("creates deterministic runtime state from orchestrator config", () => {
    const config = buildSymphonyOrchestratorConfig();
    const state = createSymphonyOrchestratorState(config, {
      now: () => new Date("2026-03-31T00:00:00.000Z"),
      nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
    });

    expect(state.pollIntervalMs).toBe(5_000);
    expect(state.maxConcurrentAgents).toBe(10);
    expect(state.nextPollDueAtMs).toBe(Date.parse("2026-03-31T00:00:00.000Z"));
  });

  it("transitions configured source states before dispatch and leaves a tracker comment", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const issue = buildSymphonyTrackerIssue({
      state: "Rework"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    const prepared = await prepareIssueForDispatch(config, tracker, issue);

    expect(prepared.state).toBe("Bootstrapping");
    expect(tracker.listOperations()).toEqual([
      {
        kind: "update_state",
        issueId: "issue-123",
        stateName: "Bootstrapping"
      },
      {
        kind: "comment",
        issueId: "issue-123",
        body: expect.stringContaining("moved it from `Rework` to `Bootstrapping`")
      }
    ]);
  });

  it("uses the dispatch bootstrap router result when no run mode override is provided", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "Todo"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const startRuns: SymphonyRunMode[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun(input) {
          startRuns.push(input.runMode);
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        }
      }),
      workflowRoutingAdapter: {
        async routeDispatchBootstrap() {
          await tracker.updateIssueState(issue.id, "Bootstrapping");
          return {
            issue: {
              ...issue,
              state: "Bootstrapping"
            },
            runMode: "rework"
          };
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);

    expect(startRuns).toEqual(["rework"]);
    expect(orchestrator.snapshot().running[0]?.issue.state).toBe("In Progress");
  });

  it("bypasses the dispatch bootstrap router when a run mode override is provided", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Rework"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const startRuns: SymphonyRunMode[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig(),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun(input) {
          startRuns.push(input.runMode);
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        }
      }),
      workflowRoutingAdapter: {
        async routeDispatchBootstrap() {
          throw new Error("dispatch bootstrap router should not be called");
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1, null, "rework");

    expect(startRuns).toEqual(["rework"]);
    expect(tracker.getIssue(issue.id)?.state).toBe("In Progress");
  });

  it("activates started runs through the run-start activation router", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Bootstrapping"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const startRunStates: string[] = [];
    const lifecycleEvents: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig({
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun(input) {
          startRunStates.push(input.issue.state);
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        }
      }),
      workflowRoutingAdapter: {
        async activateRunStart(input) {
          await tracker.updateIssueState(input.issue.id, "In Progress");
          return {
            issue: {
              ...input.issue,
              state: "In Progress"
            }
          };
        }
      },
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);

    expect(startRunStates).toEqual(["Bootstrapping"]);
    expect(tracker.getIssue(issue.id)?.state).toBe("In Progress");
    expect(orchestrator.snapshot().running[0]?.issue.state).toBe("In Progress");
    expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
  });

  it("treats run-start activation failures as runtime_session_start startup failures", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Bootstrapping"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const stoppedIssueIds: string[] = [];
    const lifecycleEvents: string[] = [];
    const runtimeStartupFailureIssueStates: string[] = [];
    const finalizedIssueStates: string[] = [];
    let finalizedCompletion: SymphonyAgentRuntimeCompletion | null = null;
    const routedCompletions: SymphonyAgentRuntimeCompletion[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig({
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun() {
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun({ issue: stoppedIssue }) {
          stoppedIssueIds.push(stoppedIssue.id);
        }
      }),
      workflowRoutingAdapter: {
        async activateRunStart() {
          throw new Error("activation failed");
        },
        async observeRunningIssueState(input) {
          return {
            issue: input.issue
          };
        },
        async routeRunCompletion(input) {
          routedCompletions.push(input.completion);
          await tracker.updateIssueState(input.issue.id, "Failed");
          return {
            issue: {
              ...input.issue,
              state: "Failed"
            }
          };
        }
      },
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          if (input.eventType === "runtime_startup_failed") {
            runtimeStartupFailureIssueStates.push(input.issue.state);
          }
          return;
        },
        finalizeRun(input) {
          finalizedCompletion = input.completion;
          finalizedIssueStates.push(input.issue.state);
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);

    expect(stoppedIssueIds).toEqual([issue.id]);
    expect(tracker.getIssue(issue.id)?.state).toBe("Failed");
    expect(finalizedCompletion).toEqual(
      expect.objectContaining({
        kind: "startup_failure",
        failureStage: "runtime_session_start"
      })
    );
    expect(routedCompletions).toEqual([
      expect.objectContaining({
        kind: "startup_failure",
        failureStage: "runtime_session_start"
      })
    ]);
    expect(runtimeStartupFailureIssueStates).toEqual(["Failed"]);
    expect(finalizedIssueStates).toEqual(["Failed"]);
    expect(lifecycleEvents).toContain("runtime_startup_failed");
  });

  it("routes running issue state changes through the lifecycle router before stopping the run", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const observedStates: string[] = [];
    const stoppedIssueIds: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig({
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async stopRun({ issue: stoppedIssue }) {
          stoppedIssueIds.push(stoppedIssue.id);
        }
      }),
      workflowRoutingAdapter: {
        async observeRunningIssueState(input) {
          observedStates.push(input.issue.state);
          return {
            issue: input.issue
          };
        },
        async routeRunCompletion(input) {
          return {
            issue: input.issue
          };
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1, null, "implementation");
    await tracker.updateIssueState(issue.id, "In Review");

    await orchestrator.reconcileRunningIssues();

    expect(observedStates).toEqual(["In Review"]);
    expect(stoppedIssueIds).toEqual([issue.id]);
    expect(orchestrator.snapshot().running).toHaveLength(0);
  });

  it("routes blocked completions through the lifecycle router before final tracker cleanup", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const routedCompletions: string[] = [];
    const lifecycleEvents: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig({
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      workflowRoutingAdapter: {
        async observeRunningIssueState(input) {
          return {
            issue: input.issue
          };
        },
        async routeRunCompletion(input) {
          routedCompletions.push(input.completion.kind);
          await tracker.updateIssueState(input.issue.id, "Blocked");
          return {
            issue: {
              ...input.issue,
              state: "Blocked"
            }
          };
        }
      },
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1, null, "implementation");
    await orchestrator.handleRunCompletion(issue.id, {
      kind: "blocked",
      reason: "repository blocker"
    });

    expect(routedCompletions).toEqual(["blocked"]);
    expect(tracker.getIssue(issue.id)?.state).toBe("Blocked");
    expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
    expect(
      tracker
        .listOperations()
        .filter(
          (operation) =>
            operation.kind === "update_state" &&
            operation.issueId === issue.id &&
            operation.stateName === "Blocked"
        )
    ).toHaveLength(1);
  });

  it("routes approved merge completions through the lifecycle router before final cleanup", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Approved"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const routedCompletions: string[] = [];
    const lifecycleEvents: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig({
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      workflowRoutingAdapter: {
        async observeRunningIssueState(input) {
          return {
            issue: input.issue
          };
        },
        async routeRunCompletion(input) {
          routedCompletions.push(input.completion.kind);
          await tracker.updateIssueState(input.issue.id, "Done");
          return {
            issue: {
              ...input.issue,
              state: "Done"
            }
          };
        }
      },
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.runPollCycle();
    await orchestrator.handleRunCompletion(issue.id, {
      kind: "merged"
    });

    expect(routedCompletions).toEqual(["merged"]);
    expect(tracker.getIssue(issue.id)?.state).toBe("Done");
    expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
    expect(
      tracker
        .listOperations()
        .filter(
          (operation) =>
            operation.kind === "update_state" &&
            operation.issueId === issue.id &&
            operation.stateName === "Done"
        )
    ).toHaveLength(1);
  });

  it("dispatches eligible issues, updates snapshots, and preserves the workspace when a run stops", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const manager = createTestWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });
    const agentRuntime = createAgentRuntime({
      async startRun(): Promise<AgentRunLaunch> {
        return {
          threadId: "thread-live",
          workerHost: null,
          launchTarget: null
        };
      }
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: manager,
      agentRuntime,
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.runPollCycle();
    orchestrator.applyAgentUpdate("issue-123", {
      event: "session_started",
      threadId: "thread-live",
      timestamp: "2026-03-31T00:00:01.000Z"
    });
    orchestrator.applyAgentUpdate("issue-123", {
      event: "notification",
      payload: {
        method: "thread/tokenUsage/updated",
        params: {
          tokenUsage: {
            total: {
              inputTokens: 12,
              outputTokens: 4,
              totalTokens: 16
            }
          }
        }
      },
      timestamp: "2026-03-31T00:00:02.000Z",
      agentRuntimeProcessId: "4242"
    });
    orchestrator.applyAgentUpdate("issue-123", {
      event: "turn_completed",
      payload: {
        usage: {
          input_tokens: 12,
          output_tokens: 4,
          total_tokens: 16
        }
      },
      timestamp: "2026-03-31T00:00:03.000Z"
    });

    const runningSnapshot = orchestrator.snapshot();
    expect(runningSnapshot.running[0]?.threadId).toBe("thread-live");
    expect(runningSnapshot.running[0]?.workspace?.executionTarget.kind).toBe("container");
    expect(runningSnapshot.running[0]?.turnCount).toBe(1);
    expect(runningSnapshot.running[0]?.agentTotalTokens).toBe(16);
    expect(runningSnapshot.running[0]?.agentRuntimeProcessId).toBe("4242");

    await orchestrator.handleRunCompletion("issue-123", {
      kind: "delivered"
    });

    const completedSnapshot = orchestrator.snapshot();
    expect(completedSnapshot.running).toHaveLength(0);
    expect(completedSnapshot.retrying).toHaveLength(0);
    expect(completedSnapshot.agentTotals.totalTokens).toBe(16);
  });

  it.each([
    {
      name: "missing required manifest env",
      error: new SymphonyRuntimeManifestError(
        "runtime_manifest_env_resolution_failed",
        "missing required manifest env",
        {
          issues: [
            {
              path: "env.host.required[0]",
              message: "missing"
            }
          ]
        }
      ),
      expectedOrigin: "repo_env_contract"
    },
    {
      name: "invalid optional manifest env",
      error: new SymphonyRuntimeManifestError(
        "runtime_manifest_env_resolution_failed",
        "invalid optional manifest env",
        {
          issues: [
            {
              path: "env.host.optional[0]",
              message: "invalid"
            }
          ]
        }
      ),
      expectedOrigin: "repo_env_contract"
    },
    {
      name: "missing required manifest env key",
      error: new SymphonyRuntimeManifestError(
        "runtime_manifest_env_resolution_failed",
        "missing required manifest env key",
        {
          issues: [
            {
              path: "env.host.required[0]",
              message: "missing"
            }
          ]
        }
      ),
      expectedOrigin: "repo_env_contract"
    },
    {
      name: "missing pi auth",
      error: Object.assign(new Error("missing pi auth"), {
        code: "pi_auth_unavailable"
      }),
      expectedOrigin: "pi_auth_contract"
    },
    {
      name: "missing pi binary in the image",
      error: new SymphonyWorkspaceError(
        "workspace_docker_image_invalid",
        "Docker workspace image is missing required tools: pi."
      ),
      expectedOrigin: "image_tooling_contract"
    },
    {
      name: "docker daemon unavailable",
      error: new SymphonyWorkspaceError(
        "workspace_docker_unavailable",
        "Docker daemon unavailable."
      ),
      expectedOrigin: "docker_backend_contract"
    }
  ])(
    "does not queue retries for deterministic docker contract startup failures: $name",
    async ({ error, expectedOrigin }) => {
      const config = buildSymphonyOrchestratorConfig({
        tracker: {
          ...buildSymphonyOrchestratorConfig().tracker,
          claimTransitionToState: null,
          claimTransitionFromStates: [],
          startupFailureTransitionToState: "Failed"
        }
      });
      const issue = buildSymphonyTrackerIssue({
        state: "In Progress"
      });
      const tracker = createMemorySymphonyTracker([issue]);
      const finalized: SymphonyAgentRuntimeCompletion[] = [];
      const workspaceBackend = {
        kind: "docker" as const,
        async prepareWorkspace() {
          throw error;
        },
        async runBeforeRun() {
          throw new Error("runBeforeRun should not be called");
        },
        async runAfterRun() {
          return {
            hookKind: "after_run" as const,
            outcome: "skipped" as const
          };
        },
        async cleanupWorkspace() {
          return {
            backendKind: "docker" as const,
            workerHost: null,
            hostPath: null,
            runtimePath: null,
            containerId: null,
            containerName: null,
            networkName: null,
            networkRemovalDisposition: "not_applicable" as const,
            serviceCleanup: [],
            beforeRemoveHookOutcome: "skipped" as const,
            manifestLifecycleCleanup: null,
            workspaceRemovalDisposition: "missing" as const,
            containerRemovalDisposition: "missing" as const
          };
        }
      };

      const orchestrator = new SymphonyOrchestrator({
        config,
        tracker,
        workspaceBackend,
        agentRuntime: createAgentRuntime(),
        observer: {
          startRun() {
            return "run-1";
          },
          recordLifecycleEvent() {
            return;
          },
          finalizeRun(input) {
            finalized.push(input.completion);
            return;
          }
        },
        clock: {
          now: () => new Date("2026-04-02T00:00:00.000Z"),
          nowMs: () => Date.parse("2026-04-02T00:00:00.000Z")
        }
      });

      await orchestrator.dispatchIssue(issue, 1);

      expect(finalized).toEqual([
        expect.objectContaining({
          kind: "startup_failure",
          failureStage: "workspace_prepare",
          failureOrigin: expectedOrigin
        })
      ]);
      expect(orchestrator.snapshot().retrying).toEqual([]);
      expect(orchestrator.snapshot().running).toEqual([]);
      expect(tracker.listOperations()).toContainEqual({
        kind: "update_state",
        issueId: issue.id,
        stateName: "Failed"
      });
    }
  );

  it("rejects invalid dispatch attempts before mutating tracker state", async () => {
    const issue = buildSymphonyTrackerIssue();
    const tracker = createMemorySymphonyTracker([issue]);
    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig(),
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent() {
          return;
        },
        finalizeRun() {
          return;
        }
      }
    });

    await expect(orchestrator.dispatchIssue(issue, 0)).rejects.toThrow(
      "Dispatch attempt must be >= 1. Received 0."
    );
    expect(tracker.listOperations()).toEqual([]);
    expect(orchestrator.snapshot().running).toEqual([]);
  });

  it("records explicit bootstrapping lifecycle events during startup", async () => {
    const issue = buildSymphonyTrackerIssue();
    const lifecycleEvents: string[] = [];
    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig(),
      tracker: createMemorySymphonyTracker([issue]),
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);

    expect(lifecycleEvents).toEqual(
      expect.arrayContaining([
        "dispatch_started",
        "workspace_prepare_started",
        "workspace_prepare_completed",
        "workspace_before_run_started",
        "workspace_before_run_completed",
        "runtime_launch_starting",
        "runtime_launch_requested"
      ])
    );
    expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
  });

  it("refuses duplicate dispatch starts without failing the poll cycle", async () => {
    const issue = buildSymphonyTrackerIssue();
    const lifecycleEvents: string[] = [];
    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig(),
      tracker: createMemorySymphonyTracker([issue]),
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          throw new SymphonyDispatchRefusedError({
            reason: "active_run_exists",
            issueIdentifier: issue.identifier,
            activeRunId: "run-duplicate-1",
            activeRunStatus: "running"
          });
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      }
    });

    await expect(orchestrator.runPollCycle()).resolves.toEqual(
      expect.objectContaining({
        running: []
      })
    );

    expect(orchestrator.snapshot().claimedIssueIds).toEqual([]);
    expect(lifecycleEvents).toContain("dispatch_refused_active_run");
  });

  it("accumulates token usage from raw pi message_end and turn_end payloads", async () => {
    const agentRuntime: AgentRuntime = {
      async startRun() {
        return {
          threadId: null,
          workerHost: null,
          launchTarget: null
        };
      },
      async stopRun() {
        return;
      }
    };

    const issue = buildSymphonyTrackerIssue();
    const orchestrator = new SymphonyOrchestrator({
      config: buildSymphonyOrchestratorConfig(),
      tracker: createMemorySymphonyTracker([issue]),
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime,
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.runPollCycle();
    orchestrator.applyAgentUpdate(issue.id, {
      event: "item.completed",
      payload: {
        type: "message_end",
        message: {
          usage: {
            input: 5,
            cacheRead: 0,
            output: 2
          }
        }
      },
      timestamp: "2026-03-31T00:00:01.000Z"
    });
    orchestrator.applyAgentUpdate(issue.id, {
      event: "turn_end",
      payload: {
        type: "turn_end",
        message: {
          usage: {
            input: 5,
            cacheRead: 0,
            output: 2
          }
        }
      },
      timestamp: "2026-03-31T00:00:02.000Z"
    });

    const snapshot = orchestrator.snapshot();
    expect(snapshot.running[0]?.turnCount).toBe(1);
    expect(snapshot.running[0]?.agentInputTokens).toBe(5);
    expect(snapshot.running[0]?.agentOutputTokens).toBe(2);
    expect(snapshot.running[0]?.agentTotalTokens).toBe(7);
  });

  it("clears the poll-in-progress flag when a poll cycle fails", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const issue = buildSymphonyTrackerIssue();

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker: {
        async fetchCandidateIssues() {
          throw new Error("boom");
        },
        async fetchIssuesByStates() {
          return [issue];
        },
        async fetchIssueStatesByIds() {
          return [];
        },
        async fetchIssueByIdentifier() {
          return issue;
        },
        async createComment() {
          return;
        },
        async updateIssueState() {
          return;
        }
      },
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await expect(orchestrator.runPollCycle()).rejects.toThrow("boom");
    expect(orchestrator.snapshot().pollCheckInProgress).toBe(false);
  });

  it("preserves the workspace after a failed run completes", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const lifecycleEvents: Array<{
      eventType: string;
      runId: string | null;
      issueIdentifier: string;
    }> = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push({
            eventType: input.eventType,
            runId: input.runId ?? null,
            issueIdentifier: input.issue.identifier
          });
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "failure",
      reason: "agent exited"
    });

    expect(lifecycleEvents).toContainEqual({
      eventType: "workspace_preserved_after_run",
      runId: "run-1",
      issueIdentifier: "COL-123"
    });
    expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
  });

  it("preserves the workspace after delivery moves the issue into In Review", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const lifecycleEvents: Array<{
      eventType: string;
      runId: string | null;
      issueIdentifier: string;
    }> = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push({
            eventType: input.eventType,
            runId: input.runId ?? null,
            issueIdentifier: input.issue.identifier
          });
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await tracker.updateIssueState(issue.id, "In Review");
    await orchestrator.handleRunCompletion(issue.id, {
      kind: "delivered"
    });

    expect(lifecycleEvents).toContainEqual({
      eventType: "workspace_preserved_after_run",
      runId: "run-1",
      issueIdentifier: "COL-123"
    });
  });

  it("passes runner env through workspace lifecycle hooks", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: [],
        startupFailureTransitionToState: null
      },
      hooks: {
        afterCreate: "echo after_create",
        beforeRun: "echo before_run",
        afterRun: "echo after_run",
        beforeRemove: "echo before_remove",
        timeoutMs: 1_000
      }
    });
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const hookEnvs: Array<Record<string, string>> = [];
    const manager = createTestWorkspaceBackend({
      commandRunner: async ({ env }) => {
        hookEnvs.push(env);
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      }
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: manager,
      agentRuntime: createAgentRuntime(),
      runnerEnv: {
        LINEAR_API_KEY: "test-linear-api-key",
        SYMPHONY_SOURCE_REPO: "/tmp/source-repo"
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "startup_failure",
      reason: "workspace hook failed",
      failureStage: "workspace_before_run",
      failureOrigin: "workspace_lifecycle",
      launchTarget: null
    });

    expect(hookEnvs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          LINEAR_API_KEY: "test-linear-api-key",
          SYMPHONY_SOURCE_REPO: "/tmp/source-repo"
        })
      ])
    );
  });

  it("tracks rate-limit payloads in the runtime snapshot", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const manager = createTestWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: manager,
      agentRuntime: createAgentRuntime({
        async startRun(): Promise<AgentRunLaunch> {
          return {
            threadId: "thread-live",
            workerHost: null,
            launchTarget: null
          };
        }
      }),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.runPollCycle();
    orchestrator.applyAgentUpdate("issue-123", {
      event: "notification",
      payload: {
        method: "pi/event/token_count",
        params: {
          msg: {
            type: "event_msg",
            payload: {
              type: "token_count",
              rate_limits: {
                limit_id: "pi",
                primary: {
                  remaining: 90,
                  limit: 100
                }
              }
            }
          }
        }
      },
      timestamp: "2026-03-31T00:00:01.000Z"
    });

    expect(orchestrator.snapshot().rateLimits).toEqual({
      limit_id: "pi",
      primary: {
        remaining: 90,
        limit: 100
      }
    });
  });

  it("reconciles terminal and non-dispatchable running issues by stopping them", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const todoIssue = buildSymphonyTrackerIssue();
    const tracker = createMemorySymphonyTracker([todoIssue]);

    const stopped: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun() {
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun({ issue }) {
          stopped.push(issue.id);
        }
      }),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(todoIssue, 1);
    await tracker.updateIssueState(todoIssue.id, "Done");
    await orchestrator.reconcileRunningIssues();

    expect(stopped).toEqual(["issue-123"]);
    expect(orchestrator.snapshot().running).toHaveLength(0);
  });

  it("preserves the workspace when a running issue moves to In Review", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const lifecycleEvents: string[] = [];
    const runtimeStartupFailureIssueStates: string[] = [];
    const finalizedIssueStates: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun() {
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {
          return;
        }
      }),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          if (input.eventType === "runtime_startup_failed") {
            runtimeStartupFailureIssueStates.push(input.issue.state);
          }
          return;
        },
        finalizeRun(input) {
          finalizedIssueStates.push(input.issue.state);
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await tracker.updateIssueState(issue.id, "In Review");
    await orchestrator.reconcileRunningIssues();

    expect(lifecycleEvents).toContain("run_stopped_inactive");
    expect(lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(lifecycleEvents).toContain("docker_container_stopped");
  });

  it("stops stale candidates before runtime launch when they are already non-runnable", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const staleIssue = buildSymphonyTrackerIssue();
    const tracker = createMemorySymphonyTracker([
      {
        ...staleIssue,
        state: "Backlog"
      }
    ]);
    const lifecycleEvents: string[] = [];
    let startRunCalls = 0;

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun() {
          startRunCalls += 1;
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {
          return;
        }
      }),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      }
    });

    await orchestrator.dispatchIssue(staleIssue, 1);

    expect(startRunCalls).toBe(0);
    expect(orchestrator.snapshot().running).toEqual([]);
    expect(orchestrator.snapshot().claimedIssueIds).toEqual([]);
    expect(Object.keys(orchestrator.state.dispatching)).toEqual([]);
    expect(lifecycleEvents).toContain("run_stopped_inactive");
    expect(tracker.listOperations()).toEqual([]);
  });

  it("preserves the workspace when bootstrapping is cancelled during workspace prepare", async () => {
    const harness = createBlockedDispatchHarness({
      blockPhase: "prepare"
    });

    const dispatchPromise = harness.orchestrator.dispatchIssue(harness.issue, 1);
    await harness.blockStarted;
    await harness.tracker.updateIssueState(harness.issue.id, "Backlog");
    await harness.orchestrator.reconcileRunningIssues();
    harness.releaseBlocked();
    await dispatchPromise;

    expect(harness.counts.startRunCalls).toBe(0);
    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(harness.lifecycleEvents).toContain("run_stopped_inactive");
    expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(harness.lifecycleEvents).toContain("docker_container_stopped");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Backlog");
    expect(harness.tracker.listOperations()).not.toContainEqual({
      kind: "update_state",
      issueId: harness.issue.id,
      stateName: "Paused"
    });
  });

  it("destroys the workspace when bootstrapping is cancelled by a terminal state during workspace prepare", async () => {
    const harness = createBlockedDispatchHarness({
      blockPhase: "prepare"
    });

    const dispatchPromise = harness.orchestrator.dispatchIssue(harness.issue, 1);
    await harness.blockStarted;
    await harness.tracker.updateIssueState(harness.issue.id, "Canceled");
    await harness.orchestrator.reconcileRunningIssues();
    harness.releaseBlocked();
    await dispatchPromise;

    expect(harness.counts.startRunCalls).toBe(0);
    expect(harness.cleanupModes).toEqual(["destroy"]);
    expect(harness.lifecycleEvents).toContain("run_stopped_terminal");
    expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(harness.lifecycleEvents).toContain("docker_container_removed");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Canceled");
  });

  it("preserves the workspace when a non-runnable state arrives during before_run", async () => {
    const harness = createBlockedDispatchHarness({
      blockPhase: "before_run"
    });

    const dispatchPromise = harness.orchestrator.dispatchIssue(harness.issue, 1);
    await harness.blockStarted;
    await harness.tracker.updateIssueState(harness.issue.id, "Paused");
    await harness.orchestrator.reconcileRunningIssues();
    harness.releaseBlocked();
    await dispatchPromise;

    expect(harness.counts.startRunCalls).toBe(0);
    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(harness.lifecycleEvents).toContain("run_stopped_inactive");
    expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(harness.lifecycleEvents).toContain("docker_container_stopped");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");
  });

  it("stops the launched runtime when a non-runnable state arrives during runtime launch", async () => {
    const harness = createBlockedDispatchHarness({
      blockPhase: "runtime_launch",
      issue: {
        state: "In Progress"
      },
      config: {
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }
    });

    const dispatchPromise = harness.orchestrator.dispatchIssue(harness.issue, 1);
    await harness.blockStarted;
    await harness.tracker.updateIssueState(harness.issue.id, "Paused");
    await harness.orchestrator.reconcileRunningIssues();
    harness.releaseBlocked();
    await dispatchPromise;

    expect(harness.counts.startRunCalls).toBe(1);
    expect(harness.stoppedIssueIds).toEqual([harness.issue.id]);
    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(harness.lifecycleEvents).toContain("run_stopped_inactive");
    expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(harness.lifecycleEvents).toContain("docker_container_stopped");
    expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");
  });

  it("drains dispatching work during runtime shutdown and preserves the prepared workspace", async () => {
    const shutdownReason =
      "Symphony runtime shut down while the run was active.";
    const harness = createBlockedDispatchHarness({
      blockPhase: "before_run"
    });

    const dispatchPromise = harness.orchestrator.dispatchIssue(harness.issue, 1);
    await harness.blockStarted;

    await expect(
      harness.orchestrator.shutdownActiveRuns(shutdownReason)
    ).resolves.toBe(1);

    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(harness.stoppedIssueIds).toEqual([]);
    expect(harness.lifecycleEvents).toContain("runtime_shutdown_dispatch_drained");
    expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(harness.lifecycleEvents).not.toContain("run_stopped_inactive");
    expect(harness.orchestrator.snapshot().claimedIssueIds).toEqual([]);

    harness.releaseBlocked();
    await dispatchPromise;

    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(harness.stoppedIssueIds).toEqual([]);
    expect(Object.keys(harness.orchestrator.state.dispatching)).toEqual([]);
  });

  it("makes a best-effort runtime stop when shutdown interrupts runtime launch", async () => {
    const shutdownReason =
      "Symphony runtime shut down while the run was active.";
    const harness = createBlockedDispatchHarness({
      blockPhase: "runtime_launch",
      issue: {
        state: "In Progress"
      },
      config: {
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      }
    });

    const dispatchPromise = harness.orchestrator.dispatchIssue(harness.issue, 1);
    await harness.blockStarted;

    await expect(
      harness.orchestrator.shutdownActiveRuns(shutdownReason)
    ).resolves.toBe(1);

    expect(harness.counts.startRunCalls).toBe(1);
    expect(harness.stoppedIssueIds).toEqual([harness.issue.id]);
    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(harness.lifecycleEvents).toContain("runtime_shutdown_dispatch_drained");
    expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(harness.lifecycleEvents).not.toContain("run_stopped_inactive");
    expect(harness.orchestrator.snapshot().claimedIssueIds).toEqual([]);

    harness.releaseBlocked();
    await dispatchPromise;

    expect(harness.stoppedIssueIds).toEqual([harness.issue.id]);
    expect(harness.cleanupModes).toEqual(["preserve"]);
    expect(Object.keys(harness.orchestrator.state.dispatching)).toEqual([]);
  });

  it("does not redispatch an issue until the cancelled bootstrap dispatch has finished cleaning up", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const issue = buildSymphonyTrackerIssue();
    const tracker = createMemorySymphonyTracker([issue]);
    const lifecycleEvents: string[] = [];
    const cleanupModes: string[] = [];
    let prepareWorkspaceCalls = 0;
    let startRunCalls = 0;
    let releasePrepareWorkspace: (() => void) | null = null;
    let blockFirstPrepare = true;
    const prepareWorkspaceEntered = createDeferred<void>();
    const baseBackend = createTestWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: {
        ...baseBackend,
        async prepareWorkspace(input) {
          prepareWorkspaceCalls += 1;
          if (blockFirstPrepare) {
            blockFirstPrepare = false;
            prepareWorkspaceEntered.resolve();
            await new Promise<void>((resolve) => {
              releasePrepareWorkspace = resolve;
            });
          }
          return await baseBackend.prepareWorkspace(input);
        },
        async cleanupWorkspace(input) {
          cleanupModes.push(input.mode ?? "destroy");
          return await baseBackend.cleanupWorkspace(input);
        }
      },
      agentRuntime: createAgentRuntime({
        async startRun() {
          startRunCalls += 1;
          return {
            threadId: "thread-1",
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {
          return;
        }
      }),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      }
    });

    const firstPoll = orchestrator.runPollCycle();
    await prepareWorkspaceEntered.promise;
    await tracker.updateIssueState(issue.id, "Backlog");
    await orchestrator.reconcileRunningIssues();
    await tracker.updateIssueState(issue.id, "Todo");

    await orchestrator.runPollCycle();
    expect(prepareWorkspaceCalls).toBe(1);
    expect(startRunCalls).toBe(0);

    expect(releasePrepareWorkspace).not.toBeNull();
    releasePrepareWorkspace!();
    await firstPoll;

    await orchestrator.runPollCycle();

    expect(cleanupModes).toEqual(["preserve"]);
    expect(lifecycleEvents).toContain("run_stopped_inactive");
    expect(prepareWorkspaceCalls).toBe(2);
    expect(startRunCalls).toBe(1);
    expect(orchestrator.snapshot().running).toHaveLength(1);
  });

  it("counts dispatching work against the global concurrency limit", async () => {
    const config = buildSymphonyOrchestratorConfig({
      agent: {
        maxConcurrentAgents: 1
      }
    });
    const firstIssue = buildSymphonyTrackerIssue();
    const secondIssue = buildSymphonyTrackerIssue({
      id: "issue-456",
      identifier: "SYM-456",
      title: "Second issue"
    });
    const tracker = createMemorySymphonyTracker([firstIssue, secondIssue]);
    let prepareWorkspaceCalls = 0;
    let releasePrepareWorkspace: (() => void) | null = null;
    const prepareWorkspaceEntered = createDeferred<void>();
    const baseBackend = createTestWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: {
        ...baseBackend,
        async prepareWorkspace(input) {
          prepareWorkspaceCalls += 1;
          if (input.context.issueIdentifier === firstIssue.identifier) {
            prepareWorkspaceEntered.resolve();
            await new Promise<void>((resolve) => {
              releasePrepareWorkspace = resolve;
            });
          }
          return await baseBackend.prepareWorkspace(input);
        }
      },
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    const firstPoll = orchestrator.runPollCycle();
    await prepareWorkspaceEntered.promise;
    await orchestrator.runPollCycle();

    expect(prepareWorkspaceCalls).toBe(1);

    expect(releasePrepareWorkspace).not.toBeNull();
    releasePrepareWorkspace!();
    await firstPoll;
  });

  it("pauses failed runs instead of scheduling hidden retries", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const manager = createTestWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: manager,
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "failure",
      reason: "agent exited"
    });

    expect(orchestrator.snapshot().retrying).toHaveLength(0);
    expect(tracker.listOperations()).toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Paused"
    });
  });

  it("schedules bounded retries for transient provider failures instead of pausing immediately", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    let currentNowMs = Date.parse("2026-03-31T00:00:00.000Z");

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date(currentNowMs),
        nowMs: () => currentNowMs
      }
    });

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "provider_transient",
      reason: "unexpected status 502 Bad Gateway"
    });

    expect(orchestrator.snapshot().retrying).toHaveLength(1);
    expect(orchestrator.snapshot().retrying[0]).toMatchObject({
      attempt: 2,
      delayType: "failure"
    });
    expect(tracker.listOperations()).not.toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Paused"
    });
    expect(tracker.listOperations()).not.toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Automatic retries were exhausted.")
    });

    currentNowMs = orchestrator.snapshot().retrying[0]?.dueAtMs ?? currentNowMs;
    await orchestrator.runPollCycle();

    expect(orchestrator.snapshot().retrying).toHaveLength(0);
    expect(orchestrator.snapshot().running[0]?.retryAttempt).toBe(2);
  });

  it("pauses after the transient provider retry budget is exhausted", async () => {
    const config = buildSymphonyOrchestratorConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      workflowRoutingAdapter: {
        observeRunningIssueState(input) {
          return {
            issue: input.issue
          };
        },
        async routeRunCompletion(input) {
          await tracker.updateIssueState(input.issue.id, "Paused");
          return {
            issue: {
              ...input.issue,
              state: "Paused"
            }
          };
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 3);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "provider_transient",
      reason: "unexpected status 502 Bad Gateway"
    });

    expect(orchestrator.snapshot().retrying).toHaveLength(0);
    expect(tracker.listOperations()).toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Paused"
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Automatic retries were exhausted.")
    });
  });

  it("moves max-turn pauses into the paused state without retrying", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const finalized: SymphonyAgentRuntimeCompletion[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent() {
          return;
        },
        finalizeRun(input) {
          finalized.push(input.completion);
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "max_turns_reached",
      maxTurns: 2,
      reason: "Reached the configured 2-turn limit while the issue remained active."
    });

    expect(orchestrator.snapshot().retrying).toHaveLength(0);
    expect(finalized).toEqual([
      {
        kind: "max_turns_reached",
        maxTurns: 2,
        reason: "Reached the configured 2-turn limit while the issue remained active."
      }
    ]);
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Symphony agent paused after reaching max turns.")
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining(
        "Symphony did not retry automatically."
      )
    });
  });

  it("preserves the workspace after max-turn pauses", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const lifecycleEvents: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "max_turns_reached",
      maxTurns: 2,
      reason: "Reached the configured 2-turn limit while the issue remained active."
    });

    expect(lifecycleEvents).toContain("workspace_preserved_after_run");
  });

  it("pauses stalled runs instead of silently retrying them", async () => {
    const config = buildSymphonyOrchestratorConfig({
      agentRuntime: {
        ...buildSymphonyOrchestratorConfig().agentRuntime,
        stallTimeoutMs: 1_000
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const stopped: string[] = [];
    const finalized: SymphonyAgentRuntimeCompletion[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async stopRun({ issue }) {
          stopped.push(issue.id);
        }
      }),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent() {
          return;
        },
        finalizeRun(input) {
          finalized.push(input.completion);
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:05.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:05.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    orchestrator.applyAgentUpdate("issue-123", {
      event: "session_started",
      threadId: "thread-live",
      timestamp: "2026-03-31T00:00:00.000Z"
    });

    await orchestrator.reconcileRunningIssues();

    expect(stopped).toEqual(["issue-123"]);
    expect(finalized).toEqual([
      {
        kind: "stalled",
        reason: "stalled for 5000ms without agent activity"
      }
    ]);
    expect(orchestrator.snapshot().running).toHaveLength(0);
    expect(orchestrator.snapshot().retrying).toHaveLength(0);
    expect(tracker.listOperations()).toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Paused"
    });
  });

  it("describes runtime failures as stopped when the pause transition fails", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const baseTracker = createMemorySymphonyTracker([issue]);
    const lifecycleEvents: string[] = [];
    const tracker = baseTracker;
    const updateIssueState = baseTracker.updateIssueState.bind(baseTracker);
    tracker.updateIssueState = async (issueId: string, stateName: string) => {
      if (stateName === "Paused") {
        throw new Error("tracker unavailable");
      }

      await updateIssueState(issueId, stateName);
    };

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          return;
        },
        finalizeRun() {
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await orchestrator.handleRunCompletion(issue.id, {
      kind: "failure",
      reason: "agent exited"
    });

    expect(baseTracker.getIssue(issue.id)?.state).toBe("In Progress");
    expect(baseTracker.listOperations()).toEqual(
      expect.arrayContaining([
        {
          kind: "comment",
          issueId: issue.id,
          body: expect.stringContaining("Symphony agent stopped after a runtime failure.")
        },
        {
          kind: "comment",
          issueId: issue.id,
          body: expect.stringContaining(
            "The issue is currently in `In Progress`. Manual state cleanup may be required before the ticket is requeued."
          )
        }
      ])
    );
    expect(lifecycleEvents).toContain("workspace_preserved_after_run");
    expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
  });

  it("formats startup-failure comments with routed-state guidance", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: [],
        startupFailureTransitionToState: "Failed"
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "startup_failure",
      reason: "workspace hook `before_run` exited with status 1.",
      failureStage: "workspace_before_run",
      failureOrigin: "workspace_lifecycle",
      launchTarget: null
    });

    expect(tracker.listOperations()).toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Failed"
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Symphony agent startup failed.")
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("The issue is currently in `Failed`.")
    });
  });

  it("preserves the workspace after startup failures", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: [],
        startupFailureTransitionToState: "Failed"
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const lifecycleEvents: string[] = [];
    const runtimeStartupFailureIssueStates: string[] = [];
    const finalizedIssueStates: string[] = [];

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      observer: {
        startRun() {
          return "run-1";
        },
        recordLifecycleEvent(input) {
          lifecycleEvents.push(input.eventType);
          if (input.eventType === "runtime_startup_failed") {
            runtimeStartupFailureIssueStates.push(input.issue.state);
          }
          return;
        },
        finalizeRun(input) {
          finalizedIssueStates.push(input.issue.state);
          return;
        }
      },
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "startup_failure",
      reason: "Pi RPC process exited (code:137).",
      failureStage: "runtime_session_start",
      failureOrigin: "pi_startup",
      launchTarget: null
    });

    expect(lifecycleEvents).toContain("workspace_cleanup_completed");
    expect(lifecycleEvents).toContain("docker_container_stopped");
    expect(runtimeStartupFailureIssueStates).toEqual(["Failed"]);
    expect(finalizedIssueStates).toEqual(["Failed"]);
  });

  it("formats startup-failure comments with manual cleanup guidance when routing leaves the issue unchanged", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: [],
        startupFailureTransitionToState: "Failed"
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const comments: string[] = [];

    const tracker = {
      async fetchCandidateIssues() {
        return [issue];
      },
      async fetchIssuesByStates() {
        return [issue];
      },
      async fetchIssueStatesByIds() {
        return [issue];
      },
      async fetchIssueByIdentifier() {
        return issue;
      },
      async createComment(_issueId: string, body: string) {
        comments.push(body);
      },
      async updateIssueState() {
        throw new Error("tracker unavailable");
      }
    };

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "startup_failure",
      reason: "workspace hook `before_run` exited with status 1.",
      failureStage: "workspace_before_run",
      failureOrigin: "workspace_lifecycle",
      launchTarget: null
    });

    expect(comments[0]).toContain(
      "The issue is currently in `In Progress`. Manual state cleanup may be required before the ticket is requeued."
    );
  });

  it("formats rate-limited comments with rate-limit detail", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    const orchestrator = new SymphonyOrchestrator({
      config,
      tracker,
      workspaceBackend: createTestWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime(),
      clock: {
        now: () => new Date("2026-03-31T00:00:00.000Z"),
        nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
      }
    });

    await orchestrator.dispatchIssue(issue, 1);
    orchestrator.applyAgentUpdate("issue-123", {
      event: "notification",
      payload: {
        method: "pi/event/token_count",
        params: {
          msg: {
            type: "event_msg",
            payload: {
              type: "token_count",
              rate_limits: {
                limit_id: "pi",
                primary: {
                  remaining: 90,
                  limit: 100,
                  reset_in_seconds: 95
                }
              }
            }
          }
        }
      },
      timestamp: "2026-03-31T00:00:01.000Z"
    });
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "rate_limited",
      reason: "rate_limit_exceeded"
    });

    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining(
        "Symphony agent paused after hitting a Pi rate limit."
      )
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Latest rate limits: pi; primary: 90/100 remaining, reset 95s")
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Paused"
    });
    expect(orchestrator.snapshot().retrying).toHaveLength(0);
  });

  describe("workflow transition flows", () => {
    it("moves Todo issues into Bootstrapping and preserves the workspace after In Review handoff", async () => {
      const harness = createFlowHarness();

      await harness.orchestrator.runPollCycle();

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "Bootstrapping"
          },
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "In Progress"
          }
        ])
      );

      await harness.tracker.updateIssueState(harness.issue.id, "In Review");
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "delivered"
      });

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Review");
      expect(harness.lifecycleEvents).toContain("workspace_preserved_after_run");
      expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
      expect(harness.stoppedIssueIds).toEqual([]);
    });

    it("moves Bootstrapping startup failures into Failed", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "Bootstrapping"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.dispatchIssue(harness.issue, 1);
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "startup_failure",
        reason: "workspace bootstrap failed",
        failureStage: "workspace_prepare",
        failureOrigin: "workspace_lifecycle",
        launchTarget: null
      });

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Failed");
      expect(harness.tracker.listOperations()).toContainEqual({
        kind: "update_state",
        issueId: harness.issue.id,
        stateName: "Failed"
      });
      expect(harness.lifecycleEvents).toContain("runtime_startup_failed");
      expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
      expect(harness.lifecycleEvents).toContain("docker_container_stopped");
    });

    it("moves failed in-progress runs into Paused", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "In Progress"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.dispatchIssue(harness.issue, 1);
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "failure",
        reason: "agent exited"
      });

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");
      expect(harness.tracker.listOperations()).toContainEqual({
        kind: "update_state",
        issueId: harness.issue.id,
        stateName: "Paused"
      });
      expect(harness.lifecycleEvents).toContain("workspace_preserved_after_run");
      expectNoTrackerTransitionLifecycleEvents(harness.lifecycleEvents);
    });

    it("moves blocked implementation runs into Blocked and leaves blocker guidance", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "In Progress"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.dispatchIssue(harness.issue, 1);
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "blocked",
        reason: "Missing required repo credentials for integration tests."
      });

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");
      expect(harness.tracker.listOperations()).toContainEqual({
        kind: "update_state",
        issueId: harness.issue.id,
        stateName: "Blocked"
      });
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("Symphony agent reported a repo or workspace blocker.")
          },
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("move it back to `Todo`")
          }
        ])
      );
      expect(harness.lifecycleEvents).toContain("workspace_preserved_after_run");
      expectNoTrackerTransitionLifecycleEvents(harness.lifecycleEvents);
    });

    it("dispatches Approved issues in approved_merge mode and completes them into Done", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "Approved"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.runPollCycle();
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "merged"
      });

      expect(harness.startRuns).toEqual([
        expect.objectContaining({
          issueId: harness.issue.id,
          issueState: "Approved",
          runMode: "approved_merge"
        })
      ]);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");
      expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
      expect(harness.lifecycleEvents).toContain("workspace_destroyed_after_run");
      expectNoTrackerTransitionLifecycleEvents(harness.lifecycleEvents);
    });

    it("downgrades merged approved runs when the Done transition fails", async () => {
      const config = buildSymphonyOrchestratorConfig({
        tracker: {
          claimTransitionToState: null,
          claimTransitionFromStates: []
        }
      });
      const issue = buildSymphonyTrackerIssue({
        state: "Approved"
      });
      const baseTracker = createMemorySymphonyTracker([issue]);
      const lifecycleEvents: string[] = [];
      const tracker = baseTracker;
      const updateIssueState = baseTracker.updateIssueState.bind(baseTracker);
      tracker.updateIssueState = async (issueId: string, stateName: string) => {
        if (stateName === "Done") {
          throw new Error("tracker unavailable");
        }

        await updateIssueState(issueId, stateName);
      };

      const orchestrator = new SymphonyOrchestrator({
        config,
        tracker,
        workspaceBackend: createTestWorkspaceBackend({
          commandRunner: async () => ({
            exitCode: 0,
            stdout: "",
            stderr: ""
          })
        }),
        agentRuntime: createAgentRuntime(),
        observer: {
          startRun() {
            return "run-1";
          },
          recordLifecycleEvent(input) {
            lifecycleEvents.push(input.eventType);
            return;
          },
          finalizeRun() {
            return;
          }
        },
        clock: {
          now: () => new Date("2026-03-31T00:00:00.000Z"),
          nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
        }
      });

      await orchestrator.runPollCycle();
      await orchestrator.handleRunCompletion(issue.id, {
        kind: "merged"
      });

      expect(baseTracker.getIssue(issue.id)?.state).toBe("Blocked");
      expect(baseTracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "update_state",
            issueId: issue.id,
            stateName: "In Progress"
          },
          {
            kind: "update_state",
            issueId: issue.id,
            stateName: "Blocked"
          },
          {
            kind: "comment",
            issueId: issue.id,
            body: expect.stringContaining("could not move the issue to `Done`")
          }
        ])
      );
      expectNoTrackerTransitionLifecycleEvents(lifecycleEvents);
    });

    it("moves failed approved merge runs into Blocked", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "Approved"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.runPollCycle();
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "failure",
        reason: "git merge origin/main failed with conflicts"
      });

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "In Progress"
          },
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "Blocked"
          },
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("move it back to `Approved`")
          }
        ])
      );
      expect(harness.lifecycleEvents).toContain("workspace_preserved_after_run");
      expectNoTrackerTransitionLifecycleEvents(harness.lifecycleEvents);
    });

    it("moves explicit blocked merge results into Blocked and leaves merge rerun guidance", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "Approved"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.runPollCycle();
      await harness.orchestrator.handleRunCompletion(harness.issue.id, {
        kind: "merge_blocked",
        reason: "Conflicts in packages/workspace/src/docker-client.ts"
      });

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("Symphony merge automation reported a merge blocker.")
          },
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("move it back to `Approved`")
          }
        ])
      );
      expect(harness.lifecycleEvents).toContain("workspace_preserved_after_run");
      expectNoTrackerTransitionLifecycleEvents(harness.lifecycleEvents);
    });

    it("stops implementation runs that move into Approved so merge mode can take over", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "In Progress"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.dispatchIssue(harness.issue, 1);
      await harness.tracker.updateIssueState(harness.issue.id, "Approved");
      await harness.orchestrator.reconcileRunningIssues();

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Approved");
      expect(harness.stoppedIssueIds).toEqual([harness.issue.id]);
      expect(harness.lifecycleEvents).toContain("run_stopped_inactive");
      expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
      expect(harness.lifecycleEvents).toContain("docker_container_stopped");
    });

    it("stops and destroys runs that move into Canceled", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "In Progress"
        },
        config: {
          tracker: {
            claimTransitionToState: null,
            claimTransitionFromStates: []
          }
        }
      });

      await harness.orchestrator.dispatchIssue(harness.issue, 1);
      await harness.tracker.updateIssueState(harness.issue.id, "Canceled");
      await harness.orchestrator.reconcileRunningIssues();

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Canceled");
      expect(harness.stoppedIssueIds).toEqual([harness.issue.id]);
      expect(harness.lifecycleEvents).toContain("run_stopped_terminal");
      expect(harness.lifecycleEvents).toContain("workspace_cleanup_completed");
      expect(harness.lifecycleEvents).toContain("docker_container_removed");
    });

    it("re-dispatches Rework issues through Bootstrapping and leaves a handoff comment", async () => {
      const harness = createFlowHarness({
        issue: {
          state: "Rework"
        }
      });

      await harness.orchestrator.runPollCycle();

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Progress");
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "Bootstrapping"
          },
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("moved it from `Rework` to `Bootstrapping`")
          },
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "In Progress"
          }
        ])
      );
    });
  });
});

const trackerTransitionLifecycleEvents = [
  "claim_transition",
  "bootstrap_transition",
  "approved_merge_transition",
  "pause_transition",
  "pause_transition_failed",
  "blocked_transition",
  "blocked_transition_failed",
  "done_transition",
  "done_transition_failed"
] as const;

function expectNoTrackerTransitionLifecycleEvents(
  events: string[] | Array<{ eventType: string }>
): void {
  const eventTypes = events.map((event) =>
    typeof event === "string" ? event : event.eventType
  );

  expect(eventTypes).toEqual(
    expect.not.arrayContaining([...trackerTransitionLifecycleEvents])
  );
}

function createFlowHarness(input: {
  issue?: Parameters<typeof buildSymphonyTrackerIssue>[0];
  config?: Parameters<typeof buildSymphonyOrchestratorConfig>[0];
} = {}) {
  const config = buildSymphonyOrchestratorConfig(input.config);
  const issue = buildSymphonyTrackerIssue(input.issue);
  const tracker = createMemorySymphonyTracker([issue]);
  const lifecycleEvents: string[] = [];
  const stoppedIssueIds: string[] = [];
  const startRuns: Array<{
    issueId: string;
    issueState: string;
    runMode: SymphonyRunMode;
  }> = [];

  const orchestrator = new SymphonyOrchestrator({
    config,
    tracker,
    workspaceBackend: createTestWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    }),
    agentRuntime: createAgentRuntime({
      async startRun(runInput) {
        startRuns.push({
          issueId: runInput.issue.id,
          issueState: runInput.issue.state,
          runMode: runInput.runMode
        });
        return {
          threadId: "thread-1",
          workerHost: null,
          launchTarget: null
        };
      },
      async stopRun({ issue: stoppedIssue }) {
        stoppedIssueIds.push(stoppedIssue.id);
      }
    }),
    observer: {
      startRun() {
        return "run-1";
      },
      recordLifecycleEvent(input) {
        lifecycleEvents.push(input.eventType);
        return;
      },
      finalizeRun() {
        return;
      }
    },
    clock: {
      now: () => new Date("2026-03-31T00:00:00.000Z"),
      nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
    }
  });

  return {
    config,
    issue,
    tracker,
    lifecycleEvents,
    stoppedIssueIds,
    startRuns,
    orchestrator
  };
}

function createBlockedDispatchHarness(input: {
  blockPhase: "prepare" | "before_run" | "runtime_launch";
  issue?: Parameters<typeof buildSymphonyTrackerIssue>[0];
  config?: Parameters<typeof buildSymphonyOrchestratorConfig>[0];
}): {
  config: ReturnType<typeof buildSymphonyOrchestratorConfig>;
  issue: ReturnType<typeof buildSymphonyTrackerIssue>;
  tracker: ReturnType<typeof createMemorySymphonyTracker>;
  lifecycleEvents: string[];
  stoppedIssueIds: string[];
  cleanupModes: Array<"destroy" | "preserve">;
  counts: {
    prepareWorkspaceCalls: number;
    beforeRunCalls: number;
    startRunCalls: number;
  };
  blockStarted: Promise<void>;
  releaseBlocked: () => void;
  orchestrator: SymphonyOrchestrator;
} {
  const config = buildSymphonyOrchestratorConfig(input.config);
  const issue = buildSymphonyTrackerIssue(input.issue);
  const tracker = createMemorySymphonyTracker([issue]);
  const lifecycleEvents: string[] = [];
  const stoppedIssueIds: string[] = [];
  const cleanupModes: Array<"destroy" | "preserve"> = [];
  const counts = {
    prepareWorkspaceCalls: 0,
    beforeRunCalls: 0,
    startRunCalls: 0
  };
  const blockStarted = createDeferred<void>();
  const blockReleased = createDeferred<void>();
  let blockOpen = true;
  const baseBackend = createTestWorkspaceBackend({
    commandRunner: async () => ({
      exitCode: 0,
      stdout: "",
      stderr: ""
    })
  });

  const orchestrator = new SymphonyOrchestrator({
    config,
    tracker,
    workspaceBackend: {
      ...baseBackend,
      async prepareWorkspace(workspaceInput) {
        counts.prepareWorkspaceCalls += 1;
        if (input.blockPhase === "prepare" && blockOpen) {
          blockOpen = false;
          blockStarted.resolve();
          await blockReleased.promise;
        }
        return await baseBackend.prepareWorkspace(workspaceInput);
      },
      async runBeforeRun(workspaceInput) {
        counts.beforeRunCalls += 1;
        if (input.blockPhase === "before_run" && blockOpen) {
          blockOpen = false;
          blockStarted.resolve();
          await blockReleased.promise;
        }
        return await baseBackend.runBeforeRun(workspaceInput);
      },
      async cleanupWorkspace(workspaceInput) {
        cleanupModes.push((workspaceInput.mode ?? "destroy") as "destroy" | "preserve");
        return await baseBackend.cleanupWorkspace(workspaceInput);
      }
    },
    agentRuntime: createAgentRuntime({
      async startRun() {
        counts.startRunCalls += 1;
        if (input.blockPhase === "runtime_launch" && blockOpen) {
          blockOpen = false;
          blockStarted.resolve();
          await blockReleased.promise;
        }
        return {
          threadId: "thread-1",
          workerHost: null,
          launchTarget: null
        };
      },
      async stopRun({ issue: stoppedIssue }) {
        stoppedIssueIds.push(stoppedIssue.id);
      }
    }),
    observer: {
      startRun() {
        return "run-1";
      },
      recordLifecycleEvent(lifecycleInput) {
        lifecycleEvents.push(lifecycleInput.eventType);
        return;
      },
      finalizeRun() {
        return;
      }
    },
    clock: {
      now: () => new Date("2026-03-31T00:00:00.000Z"),
      nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
    }
  });

  return {
    config,
    issue,
    tracker,
    lifecycleEvents,
    stoppedIssueIds,
    cleanupModes,
    counts,
    blockStarted: blockStarted.promise,
    releaseBlocked: blockReleased.resolve,
    orchestrator
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve
  };
}
