import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createCodexAgentRuntime } from "../runtime/agent-runtime.js";
import {
  createSymphonyRuntime,
  type SymphonyRuntime
} from "../runtime/symphony-runtime.js";
import {
  createMemorySymphonyTracker,
  type MemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "../tracker/symphony-tracker.js";
import type {
  SymphonyAgentRuntime,
  SymphonyAgentRuntimeLaunchResult
} from "../orchestration/symphony-orchestrator.js";
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
  agentRuntime?: Partial<SymphonyAgentRuntime>;
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

  const agentRuntime: SymphonyAgentRuntime = {
    async startRun(runInput): Promise<SymphonyAgentRuntimeLaunchResult> {
      launchRecords.push({
        attempt: runInput.attempt,
        issueId: runInput.issue.id,
        workspacePath: runInput.workspace.path
      });

      return {
        sessionId: "thread-live",
        workerHost: null,
        workspacePath: runInput.workspace.path
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
