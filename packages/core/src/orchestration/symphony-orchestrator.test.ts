import { describe, expect, it } from "vitest";
import {
  createSymphonyOrchestratorState,
  prepareIssueForDispatch,
  SymphonyOrchestrator,
  type SymphonyAgentRuntime,
  type SymphonyAgentRuntimeLaunchResult
} from "./symphony-orchestrator.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";
import { buildSymphonyTrackerIssue } from "../test-support/build-symphony-tracker-issue.js";
import { createMemorySymphonyTracker } from "../tracker/symphony-tracker.js";
import { createLocalSymphonyWorkspaceManager } from "../workspace/local-symphony-workspace-manager.js";

function createAgentRuntime(
  overrides: Partial<SymphonyAgentRuntime> = {}
): SymphonyAgentRuntime {
  return {
    async startRun(): Promise<SymphonyAgentRuntimeLaunchResult> {
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
    const manager = createLocalSymphonyWorkspaceManager({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });
    const agentRuntime = createAgentRuntime({
      async startRun(input): Promise<SymphonyAgentRuntimeLaunchResult> {
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
      workspaceManager: manager,
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
      workspaceManager: createLocalSymphonyWorkspaceManager({
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
    const manager = createLocalSymphonyWorkspaceManager({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    const orchestrator = new SymphonyOrchestrator({
      workflowConfig,
      tracker,
      workspaceManager: manager,
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
});
