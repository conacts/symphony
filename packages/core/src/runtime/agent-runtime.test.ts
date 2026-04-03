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
      backendKind: "docker",
      prepareDisposition: "reused",
      containerDisposition: "reused",
      networkDisposition: "reused",
      afterCreateHookOutcome: "skipped",
      executionTarget: {
        kind: "container",
        workspacePath: "/home/agent/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123",
        hostPath: "/tmp/symphony-runtime",
        shell: "sh"
      },
      materialization: {
        kind: "bind_mount",
        hostPath: "/tmp/symphony-runtime",
        containerPath: "/home/agent/workspace"
      },
      networkName: "symphony-network-col-123",
      services: [],
      envBundle: {
        source: "ambient",
        values: {},
        summary: {
          source: "ambient",
          injectedKeys: [],
          requiredHostKeys: [],
          optionalHostKeys: [],
          repoEnvPath: null,
          projectedRepoKeys: [],
          requiredRepoKeys: [],
          optionalRepoKeys: [],
          staticBindingKeys: [],
          runtimeBindingKeys: [],
          serviceBindingKeys: []
        }
      },
      manifestLifecycle: null,
      path: null,
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
      launchTarget: null
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
      launchTarget: null
    });
    await expect(
      runtime.stopRun({
        issue: runInput.issue,
        workspace: runInput.workspace,
        cleanupWorkspace: false
      })
    ).resolves.toBeUndefined();
    expect(startRun).toHaveBeenCalledWith(runInput);
    expect(stopRun).toHaveBeenCalledWith({
      issue: runInput.issue,
      workspace: runInput.workspace,
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
        "./forensics"
      ])
    );
  });
});
