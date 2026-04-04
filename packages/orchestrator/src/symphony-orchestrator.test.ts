import { describe, expect, it } from "vitest";
import {
  createSymphonyOrchestratorState,
  prepareIssueForDispatch,
  SymphonyOrchestrator,
  type SymphonyAgentRuntimeCompletion
} from "./symphony-orchestrator.js";
import { SymphonyRuntimeManifestError } from "@symphony/runtime-contract";
import type {
  AgentRunLaunch,
  AgentRuntime
} from "./agent-runtime.js";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { SymphonyWorkspaceError } from "@symphony/workspace";
import {
  buildSymphonyOrchestratorConfig,
  buildSymphonyTrackerIssue,
  createTestWorkspaceBackend
} from "./orchestrator-test-support.js";

function createAgentRuntime(
  overrides: Partial<AgentRuntime> = {}
): AgentRuntime {
  return {
    async startRun(): Promise<AgentRunLaunch> {
      return {
        sessionId: "thread-1",
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

describe("symphony orchestrator", () => {
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
          sessionId: "thread-live",
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
      sessionId: "thread-live",
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
      codexAppServerPid: "4242"
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
    expect(runningSnapshot.running[0]?.sessionId).toBe("thread-live");
    expect(runningSnapshot.running[0]?.workspace?.executionTarget.kind).toBe("container");
    expect(runningSnapshot.running[0]?.turnCount).toBe(1);
    expect(runningSnapshot.running[0]?.codexTotalTokens).toBe(16);
    expect(runningSnapshot.running[0]?.codexAppServerPid).toBe("4242");

    await orchestrator.handleRunCompletion("issue-123", {
      kind: "normal"
    });

    const completedSnapshot = orchestrator.snapshot();
    expect(completedSnapshot.running).toHaveLength(0);
    expect(completedSnapshot.retrying).toHaveLength(0);
    expect(completedSnapshot.codexTotals.totalTokens).toBe(16);
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
      name: "missing codex auth",
      error: Object.assign(new Error("missing codex auth"), {
        code: "codex_auth_unavailable"
      }),
      expectedOrigin: "codex_auth_contract"
    },
    {
      name: "missing codex binary in the image",
      error: new SymphonyWorkspaceError(
        "workspace_docker_image_invalid",
        "Docker workspace image is missing required tools: codex."
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
          startupFailureTransitionToState: "Backlog"
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

      await orchestrator.dispatchIssue(issue, 0);

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
        stateName: "Backlog"
      });
    }
  );

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

  it("records pause and workspace preservation after a failed run completes", async () => {
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

    await orchestrator.dispatchIssue(issue, 0);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "failure",
      reason: "agent exited"
    });

    expect(lifecycleEvents).toContainEqual({
      eventType: "pause_transition",
      runId: "run-1",
      issueIdentifier: "COL-123"
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

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 0);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "startup_failure",
      reason: "workspace hook failed",
      failureStage: "workspace_before_run",
      failureOrigin: "workspace_lifecycle",
      launchTarget: null
    });

    expect(hookEnvs).toHaveLength(2);
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
            sessionId: "thread-live",
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
        method: "codex/event/token_count",
        params: {
          msg: {
            type: "event_msg",
            payload: {
              type: "token_count",
              rate_limits: {
                limit_id: "codex",
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
      limit_id: "codex",
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
    const tracker = createMemorySymphonyTracker([
      {
        ...todoIssue,
        state: "Done"
      }
    ]);

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
            sessionId: "thread-1",
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

    await orchestrator.dispatchIssue(todoIssue, 0);
    await orchestrator.reconcileRunningIssues();

    expect(stopped).toEqual(["issue-123"]);
    expect(orchestrator.snapshot().running).toHaveLength(0);
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

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 0);
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

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 0);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "provider_transient",
      reason: "unexpected status 502 Bad Gateway"
    });

    expect(orchestrator.snapshot().retrying).toHaveLength(1);
    expect(orchestrator.snapshot().retrying[0]).toMatchObject({
      attempt: 1,
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
    expect(orchestrator.snapshot().running[0]?.retryAttempt).toBe(1);
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

    await orchestrator.dispatchIssue(buildSymphonyTrackerIssue(), 0);
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

  it("pauses stalled runs instead of silently retrying them", async () => {
    const config = buildSymphonyOrchestratorConfig({
      codex: {
        ...buildSymphonyOrchestratorConfig().codex,
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

    await orchestrator.dispatchIssue(issue, 0);
    orchestrator.applyAgentUpdate("issue-123", {
      event: "session_started",
      sessionId: "thread-live",
      timestamp: "2026-03-31T00:00:00.000Z"
    });

    await orchestrator.reconcileRunningIssues();

    expect(stopped).toEqual(["issue-123"]);
    expect(finalized).toEqual([
      {
        kind: "stalled",
        reason: "stalled for 5000ms without codex activity"
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

  it("formats startup-failure comments with moved-state guidance", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: [],
        startupFailureTransitionToState: "Backlog"
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

    await orchestrator.dispatchIssue(issue, 0);
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
      stateName: "Backlog"
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Symphony agent startup failed.")
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Symphony moved the issue to `Backlog`.")
    });
  });

  it("formats startup-failure comments with manual cleanup guidance when transition fails", async () => {
    const config = buildSymphonyOrchestratorConfig({
      tracker: {
        ...buildSymphonyOrchestratorConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: [],
        startupFailureTransitionToState: "Backlog"
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

    await orchestrator.dispatchIssue(issue, 0);
    await orchestrator.handleRunCompletion("issue-123", {
      kind: "startup_failure",
      reason: "workspace hook `before_run` exited with status 1.",
      failureStage: "workspace_before_run",
      failureOrigin: "workspace_lifecycle",
      launchTarget: null
    });

    expect(comments[0]).toContain(
      "Symphony could not move the issue to `Backlog`, so manual state cleanup is required before the ticket is requeued."
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

    await orchestrator.dispatchIssue(issue, 0);
    orchestrator.applyAgentUpdate("issue-123", {
      event: "notification",
      payload: {
        method: "codex/event/token_count",
        params: {
          msg: {
            type: "event_msg",
            payload: {
              type: "token_count",
              rate_limits: {
                limit_id: "codex",
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
        "Symphony agent paused after hitting a Codex rate limit."
      )
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "comment",
      issueId: "issue-123",
      body: expect.stringContaining("Latest rate limits: codex; primary: 90/100 remaining, reset 95s")
    });
    expect(tracker.listOperations()).toContainEqual({
      kind: "update_state",
      issueId: "issue-123",
      stateName: "Paused"
    });
    expect(orchestrator.snapshot().retrying).toHaveLength(0);
  });
});
