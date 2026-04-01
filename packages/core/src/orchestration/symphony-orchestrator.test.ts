import { describe, expect, it } from "vitest";
import {
  createSymphonyOrchestratorState,
  prepareIssueForDispatch,
  SymphonyOrchestrator,
  type SymphonyAgentRuntimeCompletion
} from "./symphony-orchestrator.js";
import type {
  AgentRunLaunch,
  AgentRuntime
} from "../runtime/agent-runtime.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";
import { buildSymphonyTrackerIssue } from "../test-support/build-symphony-tracker-issue.js";
import { createMemorySymphonyTracker } from "../tracker/symphony-tracker.js";
import { createLocalWorkspaceBackend } from "../workspace/workspace-backend.js";

function createAgentRuntime(
  overrides: Partial<AgentRuntime> = {}
): AgentRuntime {
  return {
    async startRun(): Promise<AgentRunLaunch> {
      return {
        sessionId: "thread-1",
        workerHost: null,
        workspacePath: "/tmp/symphony-workspaces/symphony-COL-123"
      };
    },
    async stopRun() {
      return;
    },
    ...overrides
  };
}

describe("symphony orchestrator", () => {
  it("creates deterministic runtime state from workflow config", () => {
    const config = buildSymphonyWorkflowConfig();
    const state = createSymphonyOrchestratorState(config, {
      now: () => new Date("2026-03-31T00:00:00.000Z"),
      nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
    });

    expect(state.pollIntervalMs).toBe(5_000);
    expect(state.maxConcurrentAgents).toBe(10);
    expect(state.nextPollDueAtMs).toBe(Date.parse("2026-03-31T00:00:00.000Z"));
  });

  it("transitions configured source states before dispatch and leaves a tracker comment", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig();
    const issue = buildSymphonyTrackerIssue({
      state: "Rework"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    const prepared = await prepareIssueForDispatch(workflowConfig, tracker, issue);

    expect(prepared.state).toBe("In Progress");
    expect(tracker.listOperations()).toEqual([
      {
        kind: "update_state",
        issueId: "issue-123",
        stateName: "In Progress"
      },
      {
        kind: "comment",
        issueId: "issue-123",
        body: expect.stringContaining("moved it from `Rework` to `In Progress`")
      }
    ]);
  });

  it("dispatches eligible issues, updates snapshots, and schedules continuation retries", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const manager = createLocalWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });
    const agentRuntime = createAgentRuntime({
      async startRun(input): Promise<AgentRunLaunch> {
        return {
          sessionId: "thread-live",
          workerHost: null,
          workspacePath: input.workspace.path
        };
      }
    });

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
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
    expect(runningSnapshot.running[0]?.turnCount).toBe(1);
    expect(runningSnapshot.running[0]?.codexTotalTokens).toBe(16);
    expect(runningSnapshot.running[0]?.codexAppServerPid).toBe("4242");

    await orchestrator.handleRunCompletion("issue-123", {
      kind: "normal"
    });

    const completedSnapshot = orchestrator.snapshot();
    expect(completedSnapshot.running).toHaveLength(0);
    expect(completedSnapshot.retrying[0]?.attempt).toBe(1);
    expect(completedSnapshot.retrying[0]?.delayType).toBe("continuation");
    expect(completedSnapshot.codexTotals.totalTokens).toBe(16);
  });

  it("clears the poll-in-progress flag when a poll cycle fails", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig();
    const issue = buildSymphonyTrackerIssue();

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
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
      workspaceBackend: createLocalWorkspaceBackend({
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

  it("records retry scheduling after a run completes", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
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
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
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
      eventType: "retry_scheduled",
      runId: "run-1",
      issueIdentifier: "COL-123"
    });
  });

  it("passes runner env through workspace lifecycle hooks", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
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
    const manager = createLocalWorkspaceBackend({
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
      workflowConfig,
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
      reason: "workspace hook failed"
    });

    expect(hookEnvs).toHaveLength(4);
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
    const workflowConfig = buildSymphonyWorkflowConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const manager = createLocalWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
      tracker,
      workspaceBackend: manager,
      agentRuntime: createAgentRuntime({
        async startRun(input): Promise<AgentRunLaunch> {
          return {
            sessionId: "thread-live",
            workerHost: null,
            workspacePath: input.workspace.path
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
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
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
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
        commandRunner: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        })
      }),
      agentRuntime: createAgentRuntime({
        async startRun(input) {
          return {
            sessionId: "thread-1",
            workerHost: null,
            workspacePath: input.workspace.path
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

  it("schedules backoff retries after failures", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig();
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const manager = createLocalWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
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

    expect(orchestrator.snapshot().retrying[0]?.dueAtMs).toBe(
      Date.parse("2026-03-31T00:00:00.000Z") + 10_000
    );
  });

  it("treats max-turn pauses as continuation retries and journals a paused outcome", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const tracker = createMemorySymphonyTracker([buildSymphonyTrackerIssue()]);
    const finalized: SymphonyAgentRuntimeCompletion[] = [];

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
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

    expect(orchestrator.snapshot().retrying[0]?.delayType).toBe("continuation");
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
        "Symphony will start a fresh run automatically while the issue remains in an active state."
      )
    });
  });

  it("restarts stalled runs with retry backoff instead of leaving them active", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig({
      codex: {
        ...buildSymphonyWorkflowConfig().codex,
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
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
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
    expect(orchestrator.snapshot().retrying[0]?.delayType).toBe("failure");
  });

  it("formats startup-failure comments with moved-state guidance", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
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
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
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
      reason: "workspace hook `before_run` exited with status 1."
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
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
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
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
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
      reason: "workspace hook `before_run` exited with status 1."
    });

    expect(comments[0]).toContain(
      "Symphony could not move the issue to `Backlog`, so manual state cleanup is required before the ticket is requeued."
    );
  });

  it("formats rate-limited comments with rate-limit detail", async () => {
    const workflowConfig = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
        claimTransitionToState: null,
        claimTransitionFromStates: []
      }
    });
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
      tracker,
      workspaceBackend: createLocalWorkspaceBackend({
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
  });
});
