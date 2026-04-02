import { describe, expect, it } from "vitest";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyTrackerIssue,
  buildSymphonyWorkflowConfig
} from "@symphony/test-support";
import { serializeRuntimeIssue } from "./serializers.js";

describe("runtime serializers", () => {
  it("preserves execution-target metadata for container-backed workspaces", () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const snapshot = buildSymphonyOrchestratorSnapshot({
      running: [
        {
          issueId: issue.id,
          issue,
          runId: "run-123",
          sessionId: "thread-live",
          workerHost: "docker-host",
          workspace: {
            issueIdentifier: issue.identifier,
            workspaceKey: issue.identifier,
            backendKind: "docker",
            prepareDisposition: "reused",
            containerDisposition: "reused",
            afterCreateHookOutcome: "skipped",
            executionTarget: {
              kind: "container",
              workspacePath: "/home/agent/workspace",
              containerId: "container-123",
              containerName: "symphony-col-123",
              hostPath: null,
              shell: "sh"
            },
            materialization: {
              kind: "volume",
              volumeName: "symphony-col-123",
              containerPath: "/home/agent/workspace",
              hostPath: null
            },
            path: null,
            created: false,
            workerHost: "docker-host"
          },
          launchTarget: {
            kind: "container",
            hostWorkspacePath: "/tmp/workspace",
            runtimeWorkspacePath: "/home/agent/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            shell: "sh"
          },
          workspacePath: null,
          retryAttempt: 0,
          turnCount: 1,
          lastCodexMessage: null,
          lastCodexTimestamp: "2026-03-31T00:00:01.000Z",
          lastCodexEvent: "turn_completed",
          codexInputTokens: 12,
          codexOutputTokens: 4,
          codexTotalTokens: 16,
          codexLastReportedInputTokens: 12,
          codexLastReportedOutputTokens: 4,
          codexLastReportedTotalTokens: 16,
          lastRateLimits: null,
          codexAppServerPid: "4242",
          startedAt: "2026-03-31T00:00:00.000Z",
          runtimeSeconds: 12
        }
      ]
    });

    const serialized = serializeRuntimeIssue(
      snapshot,
      buildSymphonyWorkflowConfig(),
      issue.identifier,
      issue
    );

    expect(serialized?.workspace).toEqual({
      backendKind: "docker",
      workerHost: "docker-host",
      prepareDisposition: "reused",
      executionTargetKind: "container",
      materializationKind: "volume",
      containerDisposition: "reused",
      hostPath: null,
      runtimePath: "/home/agent/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      path: null,
      executionTarget: {
        kind: "container",
        workspacePath: "/home/agent/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123",
        hostPath: null
      },
      materialization: {
        kind: "volume",
        volumeName: "symphony-col-123",
        containerPath: "/home/agent/workspace",
        hostPath: null
      }
    });
  });

  it("does not fabricate a workspace path when no prepared workspace exists", () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Done"
    });

    const serialized = serializeRuntimeIssue(
      buildSymphonyOrchestratorSnapshot({
        running: [],
        retrying: []
      }),
      buildSymphonyWorkflowConfig(),
      issue.identifier,
      issue
    );

    expect(serialized?.workspace).toEqual({
      backendKind: null,
      workerHost: null,
      prepareDisposition: null,
      executionTargetKind: null,
      materializationKind: null,
      containerDisposition: null,
      hostPath: null,
      runtimePath: null,
      containerId: null,
      containerName: null,
      path: null,
      executionTarget: null,
      materialization: null
    });
  });
});
