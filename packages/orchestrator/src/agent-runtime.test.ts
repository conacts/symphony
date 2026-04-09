import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createAgentRuntime,
  type AgentRunInput
} from "./agent-runtime.js";
import {
  buildSymphonyOrchestratorConfig,
  buildSymphonyTrackerIssue
} from "./orchestrator-test-support.js";

function buildAgentRunInput(): AgentRunInput {
  const issue = buildSymphonyTrackerIssue({
    state: "In Progress"
  });
  const config = buildSymphonyOrchestratorConfig();

  return {
    issue,
    runId: "run-123",
    attempt: 1,
    runMode: "implementation",
    runtimePolicy: config.runtime,
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
        workspacePath: "/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123",
        hostPath: "/tmp/symphony-runtime",
        shell: "sh"
      },
      materialization: {
        kind: "bind_mount",
        hostPath: "/tmp/symphony-runtime",
        containerPath: "/workspace"
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
  it("adapts pi runtime implementations behind the stable contract", async () => {
    const runInput = buildAgentRunInput();
    const startRun = vi.fn(async () => ({
      threadId: "thread-123",
      workerHost: "worker-a",
      launchTarget: null
    }));
    const stopRun = vi.fn(async () => undefined);
    const implementation = {
      startRun,
      stopRun
    };

    const runtime = createAgentRuntime(implementation);

    expect(runtime).not.toBe(implementation);
    await expect(runtime.startRun(runInput)).resolves.toEqual({
      threadId: "thread-123",
      workerHost: "worker-a",
      launchTarget: null
    });
    await expect(
      runtime.stopRun({
        issue: runInput.issue,
        workspace: runInput.workspace,
        cleanupMode: "preserve"
      })
    ).resolves.toBeUndefined();
    expect(startRun).toHaveBeenCalledWith(runInput);
    expect(stopRun).toHaveBeenCalledWith({
      issue: runInput.issue,
      workspace: runInput.workspace,
      cleanupMode: "preserve"
    });
  });

  it("publishes explicit expert subpaths for internal integrations", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    ) as {
      exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports)).toEqual(
      expect.arrayContaining([
        ".",
        "./package.json"
      ])
    );
  });
});
