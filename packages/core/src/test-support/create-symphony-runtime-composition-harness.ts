import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createCodexAgentRuntime,
  type AgentRunLaunch,
  type AgentRuntime
} from "../runtime/agent-runtime.js";
import {
  createSymphonyRuntime,
  type SymphonyRuntime
} from "../runtime/symphony-runtime.js";
import {
  createMemorySymphonyTracker,
  type MemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "../tracker/symphony-tracker.js";
import { createLocalWorkspaceBackend } from "../workspace/workspace-backend.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import { buildSymphonyTrackerIssue } from "./build-symphony-tracker-issue.js";
import { buildSymphonyWorkflowConfig } from "./build-symphony-workflow-config.js";

export type SymphonyRuntimeCompositionHarness = {
  cleanup(): Promise<void>;
  issue: SymphonyTrackerIssue;
  launchRecords: Array<{
    attempt: number;
    issueId: string;
    workspacePath: string;
  }>;
  root: string;
  runtime: SymphonyRuntime;
  stopRecords: Array<{
    issueId: string;
  }>;
  tracker: MemorySymphonyTracker;
  workflowConfig: SymphonyResolvedWorkflowConfig;
};

export async function createSymphonyRuntimeCompositionHarness(input: {
  agentRuntime?: Partial<AgentRuntime>;
  issue?: Partial<SymphonyTrackerIssue>;
  rootPrefix?: string;
  workflowConfig?: Partial<SymphonyResolvedWorkflowConfig>;
} = {}): Promise<SymphonyRuntimeCompositionHarness> {
  const root = await mkdtemp(
    path.join(tmpdir(), input.rootPrefix ?? "symphony-runtime-composition-")
  );
  await mkdir(root, {
    recursive: true
  });

  const issue = buildSymphonyTrackerIssue(input.issue);
  const workflowConfig = buildSymphonyWorkflowConfig({
    workspace: {
      root
    },
    ...input.workflowConfig
  });
  const tracker = createMemorySymphonyTracker([issue]);
  const launchRecords: SymphonyRuntimeCompositionHarness["launchRecords"] = [];
  const stopRecords: SymphonyRuntimeCompositionHarness["stopRecords"] = [];

  const agentRuntime: AgentRuntime = {
    async startRun(runInput): Promise<AgentRunLaunch> {
      launchRecords.push({
        attempt: runInput.attempt,
        issueId: runInput.issue.id,
        workspacePath: hostPathForWorkspace(runInput.workspace)
      });

      return {
        sessionId: "thread-live",
        workerHost: null
      };
    },
    async stopRun(stopInput) {
      stopRecords.push({
        issueId: stopInput.issue.id
      });
    },
    ...input.agentRuntime
  };

  const runtime = createSymphonyRuntime({
    workflowConfig,
    tracker,
    workspaceBackend: createLocalWorkspaceBackend({
      commandRunner: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    }),
    agentRuntime: createCodexAgentRuntime(agentRuntime),
    clock: {
      now: () => new Date("2026-03-31T00:00:00.000Z"),
      nowMs: () => Date.parse("2026-03-31T00:00:00.000Z")
    }
  });

  return {
    async cleanup() {
      await rm(root, {
        recursive: true,
        force: true
      });
    },
    issue,
    launchRecords,
    root,
    runtime,
    stopRecords,
    tracker,
    workflowConfig
  };
}

function hostPathForWorkspace(
  workspace: Parameters<AgentRuntime["startRun"]>[0]["workspace"]
): string {
  if (workspace.executionTarget.kind === "host_path") {
    return workspace.executionTarget.path;
  }

  throw new TypeError("Expected a local prepared workspace.");
}
