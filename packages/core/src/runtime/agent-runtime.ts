import type { SymphonyTrackerIssue } from "../tracker/symphony-tracker.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type { PreparedWorkspace } from "../workspace/workspace-backend.js";

export type AgentRuntimeLaunchTarget = {
  kind: "container";
  hostLaunchPath: string;
  hostWorkspacePath: string | null;
  runtimeWorkspacePath: string;
  containerId: string | null;
  containerName: string;
  shell: string;
};

export type AgentRunInput = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  attempt: number;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  workspace: PreparedWorkspace;
};

export type AgentRunLaunch = {
  sessionId: string | null;
  workerHost: string | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
};

export type AgentStopInput = {
  issue: SymphonyTrackerIssue;
  workspace: PreparedWorkspace | null;
  cleanupWorkspace: boolean;
};

export interface AgentRuntime {
  startRun(input: AgentRunInput): Promise<AgentRunLaunch>;
  stopRun(input: AgentStopInput): Promise<void>;
}

export function createCodexAgentRuntime(input: {
  startRun(input: AgentRunInput): Promise<AgentRunLaunch> | AgentRunLaunch;
  stopRun(input: AgentStopInput): Promise<void> | void;
}): AgentRuntime {
  return {
    async startRun(runInput) {
      return await input.startRun(runInput);
    },
    async stopRun(stopInput) {
      await input.stopRun(stopInput);
    }
  };
}
