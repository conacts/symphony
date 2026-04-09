import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type {
  PreparedWorkspace,
  WorkspaceCleanupMode
} from "@symphony/workspace";
import type { SymphonyAgentRuntimeConfig } from "./orchestrator-config.js";
import type { SymphonyRunMode } from "@symphony/runtime-contract";

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
  runMode: SymphonyRunMode;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  workspace: PreparedWorkspace;
};

export type AgentRunLaunch = {
  threadId: string | null;
  workerHost: string | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
};

export type AgentStopInput = {
  issue: SymphonyTrackerIssue;
  workspace: PreparedWorkspace | null;
  cleanupMode: WorkspaceCleanupMode;
};

export interface AgentRuntime {
  startRun(input: AgentRunInput): Promise<AgentRunLaunch>;
  stopRun(input: AgentStopInput): Promise<void>;
}

export function createAgentRuntime(input: {
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
