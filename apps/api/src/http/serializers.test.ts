import { describe, expect, it } from "vitest";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyTrackerIssue,
  buildSymphonyRuntimePolicy
} from "@symphony/test-support";
import {
  serializeRuntimeIssue,
  serializeRuntimeState
} from "./serializers.js";
import type { AdmittedRuntimeRepository } from "../core/runtime-admitted-repositories.js";

describe("runtime serializers", () => {
  it("resolves Pi preset labels from runtime policy defaults", () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Review",
      labels: ["model:basic"]
    });
    const baseRuntimePolicy = buildSymphonyRuntimePolicy();
    const runtimePolicy = buildSymphonyRuntimePolicy({
      pi: {
        ...baseRuntimePolicy.pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "xhigh",
        defaultPreset: "advanced",
        presets: {
          basic: {
            model: "minimax/minimax-m2.7",
            reasoningEffort: "medium",
            authMode: "provider"
          },
          advanced: {
            model: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            authMode: "provider"
          },
          premium: {
            model: "gpt-5.4",
            reasoningEffort: "high",
            authMode: "subscription"
          }
        }
      }
    });

    const serialized = serializeRuntimeIssue(
      buildSymphonyOrchestratorSnapshot({
        running: [],
        retrying: []
      }),
      runtimePolicy.github.repo,
      issue.identifier,
      issue,
      null,
      runtimePolicy.pi
    );

    expect(serialized?.operator.pi.defaultModel).toBe("xiaomi/mimo-v2-pro");
    expect(serialized?.operator.pi.selectedModel).toBe("minimax/minimax-m2.7");
    expect(serialized?.operator.pi.selectionHelpText).toContain(
      "model:"
    );
  });

  it("falls back to the configured default Pi preset when no issue label is present", () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Review",
      labels: []
    });
    const baseRuntimePolicy = buildSymphonyRuntimePolicy();
    const runtimePolicy = buildSymphonyRuntimePolicy({
      pi: {
        ...baseRuntimePolicy.pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "xhigh",
        defaultPreset: "basic",
        presets: {
          basic: {
            model: "gpt-5.4",
            reasoningEffort: "medium",
            authMode: "provider"
          },
          advanced: {
            model: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            authMode: "provider"
          },
          premium: {
            model: "gpt-5.4-mini",
            reasoningEffort: "high",
            authMode: "subscription"
          }
        }
      }
    });

    const serialized = serializeRuntimeIssue(
      buildSymphonyOrchestratorSnapshot({
        running: [],
        retrying: []
      }),
      runtimePolicy.github.repo,
      issue.identifier,
      issue,
      null,
      runtimePolicy.pi
    );

    expect(serialized?.operator.pi.selectedModel).toBe("gpt-5.4");
  });

  it("prefers workflow-authoritative tracker state when serializing runtime issues", () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const snapshot = buildSymphonyOrchestratorSnapshot({
      running: [],
      retrying: []
    });

    const serialized = serializeRuntimeIssue(
      snapshot,
      buildSymphonyRuntimePolicy().github.repo,
      issue.identifier,
      issue,
      "Approved",
      buildSymphonyRuntimePolicy().pi
    );

    expect(serialized?.tracked.state).toBe("Approved");
  });

  it("fails fast when a live runtime entry is missing its prepared workspace", () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const snapshot = buildSymphonyOrchestratorSnapshot({
      running: [
        {
          issue,
          workspace: null
        }
      ]
    });

    expect(() =>
      serializeRuntimeState(snapshot, [])
    ).toThrowError("Cannot serialize runtime workspace without a prepared workspace.");
  });

  it("fails fast when retry runtime state lacks canonical tracker issue data", () => {
    const snapshot = buildSymphonyOrchestratorSnapshot({
      retrying: [
        {
          identifier: "COL-999",
          issueId: "issue-999",
          workspace: {
            issueIdentifier: "COL-999",
            workspaceKey: "COL-999",
            backendKind: "docker",
            prepareDisposition: "created",
            containerDisposition: "started",
            networkDisposition: "created",
            afterCreateHookOutcome: "skipped",
            executionTarget: {
              kind: "container",
              workspacePath: "/workspace",
              containerId: "container-999",
              containerName: "symphony-col-999",
              hostPath: null,
              shell: "sh",
              user: "1000:1000"
            },
            materialization: {
              kind: "volume",
              volumeName: "symphony-col-999",
              containerPath: "/workspace",
              hostPath: null
            },
            networkName: "symphony-network-col-999",
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
            workerHost: "docker-host"
          }
        }
      ]
    });

    expect(() =>
      serializeRuntimeIssue(
        snapshot,
        buildSymphonyRuntimePolicy().github.repo,
        "COL-999",
        null,
        null,
        buildSymphonyRuntimePolicy().pi
      )
    ).toThrowError(
      "Cannot serialize runtime issue COL-999 without canonical tracker issue data."
    );
  });

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
          threadId: "thread-live",
          workerHost: "docker-host",
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
              hostPath: null,
              shell: "sh",
              user: "1000:1000"
            },
            materialization: {
              kind: "volume",
              volumeName: "symphony-col-123",
              containerPath: "/workspace",
              hostPath: null
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
            manifestLifecycle: {
              phases: [
                {
                  phase: "verify",
                  status: "completed",
                  trigger: "readiness_lifetime",
                  startedAt: "2026-03-31T00:00:00.000Z",
                  endedAt: "2026-03-31T00:00:01.000Z",
                  skipReason: null,
                  failureReason: null,
                  steps: [
                    {
                      phase: "verify",
                      name: "verify",
                      command: "pnpm test:smoke",
                      cwd: "/workspace",
                      timeoutMs: 1_000,
                      status: "completed",
                      startedAt: "2026-03-31T00:00:00.000Z",
                      endedAt: "2026-03-31T00:00:01.000Z",
                      failureReason: null
                    }
                  ]
                }
              ]
            },
            path: null,
            created: false,
            workerHost: "docker-host"
          },
          launchTarget: {
            kind: "container",
            hostLaunchPath: "/tmp/workspace",
            hostWorkspacePath: "/tmp/workspace",
            runtimeWorkspacePath: "/workspace",
            containerId: "container-123",
            containerName: "symphony-col-123",
            shell: "sh",
            user: "1000:1000"
          },
          workspacePath: null,
          retryAttempt: 0,
          turnCount: 1,
          lastAgentMessage: null,
          lastAgentTimestamp: "2026-03-31T00:00:01.000Z",
          lastAgentEvent: "turn_completed",
          agentInputTokens: 12,
          agentOutputTokens: 4,
          agentTotalTokens: 16,
          agentLastReportedInputTokens: 12,
          agentLastReportedOutputTokens: 4,
          agentLastReportedTotalTokens: 16,
          lastRateLimits: null,
          agentRuntimeProcessId: "4242",
          startedAt: "2026-03-31T00:00:00.000Z",
          runtimeSeconds: 12
        }
      ]
    });

    const serialized = serializeRuntimeIssue(
      snapshot,
      buildSymphonyRuntimePolicy().github.repo,
      issue.identifier,
      issue,
      null,
      buildSymphonyRuntimePolicy().pi
    );

    expect(serialized?.workspace).toEqual({
      backendKind: "docker",
      workerHost: "docker-host",
      prepareDisposition: "reused",
      executionTargetKind: "container",
      materializationKind: "volume",
      hostRepoMetadataAvailable: false,
      containerDisposition: "reused",
      networkDisposition: "reused",
      hostPath: null,
      runtimePath: "/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      networkName: "symphony-network-col-123",
      services: [],
      envBundleSummary: {
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
      },
      manifestLifecycle: {
        phases: [
          {
            phase: "verify",
            status: "completed",
            trigger: "readiness_lifetime",
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: "2026-03-31T00:00:01.000Z",
            skipReason: null,
            failureReason: null,
            steps: [
              {
                phase: "verify",
                name: "verify",
                command: "pnpm test:smoke",
                cwd: "/workspace",
                timeoutMs: 1_000,
                status: "completed",
                startedAt: "2026-03-31T00:00:00.000Z",
                endedAt: "2026-03-31T00:00:01.000Z",
                failureReason: null
              }
            ]
          }
        ]
      },
      path: null,
      executionTarget: {
        kind: "container",
        workspacePath: "/workspace",
        containerId: "container-123",
        containerName: "symphony-col-123",
        hostPath: null,
        user: "1000:1000"
      },
      materialization: {
        kind: "volume",
        volumeName: "symphony-col-123",
        containerPath: "/workspace",
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
      buildSymphonyRuntimePolicy().github.repo,
      issue.identifier,
      issue,
      null,
      buildSymphonyRuntimePolicy().pi
    );

    expect(serialized?.workspace).toEqual({
      backendKind: null,
      workerHost: null,
      prepareDisposition: null,
      executionTargetKind: null,
      materializationKind: null,
      containerDisposition: null,
      networkDisposition: null,
      hostRepoMetadataAvailable: false,
      hostPath: null,
      runtimePath: null,
      containerId: null,
      containerName: null,
      networkName: null,
      services: [],
      envBundleSummary: null,
      manifestLifecycle: null,
      path: null,
      executionTarget: null,
      materialization: null
    });
  });

  it("includes admitted repository metadata in runtime state serialization", () => {
    const serialized = serializeRuntimeState(
      buildSymphonyOrchestratorSnapshot({
        running: [],
        retrying: []
      }),
      [
        buildAdmittedRepository("conacts/symphony", {
          teamKey: "SYM"
        })
      ]
    );

    expect(serialized.repositories).toEqual([
      {
        repositoryKey: "conacts/symphony",
        linear: {
          teamKey: "SYM"
        }
      }
    ]);
  });
});

function buildAdmittedRepository(
  repositoryKey: string,
  linearBinding: AdmittedRuntimeRepository["linearBinding"]
): AdmittedRuntimeRepository {
  return {
    repositoryKey,
    repoRoot: `/tmp/${repositoryKey.replace("/", "-")}`,
    linearBinding,
    promptContract: {
      repoRoot: "/tmp",
      promptPath: "/tmp/.symphony/prompt.md",
      template: "Prompt body\n",
      variables: []
    },
    runtimeManifest: {
      repoRoot: "/tmp",
      manifestPath: "/tmp/.symphony/runtime.ts",
      manifest: {
        schemaVersion: 1,
        repositoryKey,
        linear: linearBinding,
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        services: {},
        workflow: null,
        pi: null,
        env: {
          host: {
            required: [],
            optional: []
          },
          inject: {}
        },
        lifecycle: {
          bootstrap: [],
          migrate: [],
          verify: [
            {
              name: "verify",
              run: "pnpm test"
            }
          ],
          seed: [],
          cleanup: []
        }
      }
    }
  };
}
