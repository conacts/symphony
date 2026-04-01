import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createCodexAgentRuntime,
  type AgentRunInput
} from "./agent-runtime.js";
import { buildSymphonyTrackerIssue } from "../test-support/build-symphony-tracker-issue.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";

function buildAgentRunInput(): AgentRunInput {
  const issue = buildSymphonyTrackerIssue({
    state: "In Progress"
  });
  const workflowConfig = buildSymphonyWorkflowConfig();

  return {
    issue,
    runId: "run-123",
    attempt: 1,
    workflowConfig,
    workspace: {
      issueIdentifier: issue.identifier,
      workspaceKey: issue.identifier,
      path: "/tmp/symphony-runtime",
      created: false,
      workerHost: null
    }
  };
}

describe("agent runtime facade", () => {
  it("adapts codex runtime implementations behind the stable contract", async () => {
    const runInput = buildAgentRunInput();
    const startRun = vi.fn(async () => ({
      sessionId: "thread-123",
      workerHost: "worker-a",
      workspacePath: runInput.workspace.path
    }));
    const stopRun = vi.fn(async () => undefined);
    const implementation = {
      startRun,
      stopRun
    };

    const runtime = createCodexAgentRuntime(implementation);

    expect(runtime).not.toBe(implementation);
    await expect(runtime.startRun(runInput)).resolves.toEqual({
      sessionId: "thread-123",
      workerHost: "worker-a",
      workspacePath: runInput.workspace.path
    });
    await expect(
      runtime.stopRun({
        issue: runInput.issue,
        workspacePath: runInput.workspace.path,
        workerHost: "worker-a",
        cleanupWorkspace: false
      })
    ).resolves.toBeUndefined();
    expect(startRun).toHaveBeenCalledWith(runInput);
    expect(stopRun).toHaveBeenCalledWith({
      issue: runInput.issue,
      workspacePath: runInput.workspace.path,
      workerHost: "worker-a",
      cleanupWorkspace: false
    });
  });

  it("publishes explicit expert subpaths for internal integrations", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    ) as {
      exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports)).toEqual(
      expect.arrayContaining([
        ".",
        "./meta",
        "./tracker",
        "./github",
        "./orchestration",
        "./journal",
        "./forensics",
        "./workspace/local"
      ])
    );
  });
});
