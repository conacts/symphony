import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HarnessSessionError,
  type HarnessSession,
  type HarnessSessionClient
} from "@symphony/agent-harnesses";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createSilentSymphonyLogger } from "@symphony/logger";
import type { PreparedWorkspace } from "@symphony/workspace";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";

const { startSessionMock } = vi.hoisted(() => ({
  startSessionMock: vi.fn()
}));

vi.mock("./runtime-harness.js", () => ({
  createPiRuntimeHarness: () => ({
    kind: "pi",
    definition: {} as never,
    startSession: startSessionMock
  })
}));

describe("agent harness runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a capability-managed completion as soon as a terminal module result is observed", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const runtimeLogs = {
      record: vi.fn(async () => {})
    };
    const workspace = buildPreparedWorkspace(issue.identifier);
    const completions: SymphonyAgentRuntimeCompletion[] = [];
    let resolveCompletion: ((completion: SymphonyAgentRuntimeCompletion) => void) | null =
      null;
    const completionPromise = new Promise<SymphonyAgentRuntimeCompletion>((resolve) => {
      resolveCompletion = resolve;
    });
    let closeRequested = false;
    let rejectTurn: ((error: Error) => void) | null = null;

    startSessionMock.mockImplementation(async ({ launchTarget, issue: startedIssue }) => ({
      client: {
        close: vi.fn(() => {
          closeRequested = true;
          rejectTurn?.(new Error("session closed after terminal result detection"));
        }),
        async runTurn(
          _session: HarnessSession,
          input: Parameters<HarnessSessionClient["runTurn"]>[1]
        ) {
          await input.onMessage({
            event: {
              type: "item.completed",
              item: {
                id: "agent-message-1",
                type: "agent_message",
                text: [
                  "```json",
                  JSON.stringify(
                    {
                      schemaVersion: "1",
                      moduleId: "implement.spec",
                      outcome: "completed",
                      summary: "Implemented the requested issue behavior.",
                      evidence: {
                        filesChanged: ["apps/api/src/example.ts"],
                        verification: [],
                        notes: null
                      },
                      requestedState: "done",
                      nextInputPrompt: null,
                      blockers: []
                    },
                    null,
                    2
                  ),
                  "```"
                ].join("\n")
              }
            }
          });

          await new Promise<never>((_resolve, reject) => {
            rejectTurn = reject;
            if (closeRequested) {
              reject(new Error("session closed after terminal result detection"));
            }
          });
          throw new Error("unreachable");
        }
      },
      threadId: "thread-1",
      workspacePath: "/workspace",
      hostLaunchPath: "/tmp/symphony-runtime",
      hostWorkspacePath: "/tmp/symphony-runtime",
      launchTarget,
      issue: startedIssue,
      processId: "1234",
      autoApproveRequests: true,
      approvalPolicy: "never",
      model: "xiaomi/mimo-v2-pro",
      reasoningEffort: "high",
      profile: null,
      providerId: "openrouter",
      providerName: "OpenRouter"
    }));

    const runtime = await import("./agent-harness-runtime.js").then((module) =>
      module.createSymphonyAgentRuntime({
        promptContract: {
          repoRoot: "/tmp/repo",
          promptPath: "/tmp/repo/prompt.md",
          template: "Implement the issue.",
          variables: []
        },
        githubRepository: "openai/symphony",
        tracker,
        runStore: {} as never,
        loadWorkflowLifecycleView: async () => null,
        observeActiveWorkflowIssueState: async () => true,
        isCapabilityManagedRun: async () => true,
        agentAnalytics: {
          recordEvent: vi.fn(async () => {}),
          recordCommandResourceProfile: vi.fn(async () => {})
        } as never,
        runtimeLogs: runtimeLogs as never,
        hostCommandEnvSource: {},
        logger: createSilentSymphonyLogger("@symphony/api.test"),
        callbacks: {
          onUpdate: vi.fn(async () => {}),
          onComplete: vi.fn(async (_issueId, completion) => {
            completions.push(completion);
            resolveCompletion?.(completion);
          })
        }
      })
    );

    await runtime.startRun({
      issue,
      runId: null,
      attempt: 1,
      runMode: "implementation",
      runtimePolicy,
      workspace
    });

    await expect(completionPromise).resolves.toEqual(
      expect.objectContaining({
        kind: "delivered"
      })
    );
    expect(completions).toHaveLength(1);
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_terminal_result_detected",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          completionKind: "delivered",
          moduleId: "implement.spec",
          outcome: "completed",
          requestedState: "done"
        })
      })
    );
  });

  it("maps explicit awaiting_input turn results into runtime completion without throwing", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const workspace = buildPreparedWorkspace(issue.identifier);
    let resolveCompletion: ((completion: SymphonyAgentRuntimeCompletion) => void) | null =
      null;
    const completionPromise = new Promise<SymphonyAgentRuntimeCompletion>((resolve) => {
      resolveCompletion = resolve;
    });
    const finalAssistantMessage = [
      "```json",
      JSON.stringify(
        {
          schemaVersion: "1",
          moduleId: "implement.spec",
          outcome: "awaiting_input",
          summary: "Need the production API host before continuing.",
          evidence: {
            filesChanged: [],
            verification: [],
            notes: null
          },
          requestedState: "awaiting_input",
          nextInputPrompt: "Provide the production API host.",
          blockers: []
        },
        null,
        2
      ),
      "```"
    ].join("\n");

    startSessionMock.mockImplementation(async ({ launchTarget, issue: startedIssue }) => ({
      client: {
        close: vi.fn(),
        async runTurn() {
          return {
            kind: "awaiting_input",
            threadId: "thread-1",
            turnId: "turn-1",
            usage: null,
            reason: "Need the production API host before continuing.",
            prompt: "Provide the production API host.",
            detail: {
              finalAssistantMessage
            }
          };
        }
      },
      threadId: "thread-1",
      workspacePath: "/workspace",
      hostLaunchPath: "/tmp/symphony-runtime",
      hostWorkspacePath: "/tmp/symphony-runtime",
      launchTarget,
      issue: startedIssue,
      processId: "1234",
      autoApproveRequests: true,
      approvalPolicy: "never",
      model: "xiaomi/mimo-v2-pro",
      reasoningEffort: "high",
      profile: null,
      providerId: "openrouter",
      providerName: "OpenRouter"
    }));

    const runtime = await import("./agent-harness-runtime.js").then((module) =>
      module.createSymphonyAgentRuntime({
        promptContract: {
          repoRoot: "/tmp/repo",
          promptPath: "/tmp/repo/prompt.md",
          template: "Implement the issue.",
          variables: []
        },
        githubRepository: "openai/symphony",
        tracker,
        runStore: {} as never,
        loadWorkflowLifecycleView: async () => null,
        observeActiveWorkflowIssueState: async () => true,
        isCapabilityManagedRun: async () => false,
        agentAnalytics: {
          recordEvent: vi.fn(async () => {}),
          recordCommandResourceProfile: vi.fn(async () => {})
        } as never,
        runtimeLogs: {
          record: vi.fn(async () => {})
        } as never,
        hostCommandEnvSource: {},
        logger: createSilentSymphonyLogger("@symphony/api.test"),
        callbacks: {
          onUpdate: vi.fn(async () => {}),
          onComplete: vi.fn(async (_issueId, completion) => {
            resolveCompletion?.(completion);
          })
        }
      })
    );

    await runtime.startRun({
      issue,
      runId: null,
      attempt: 1,
      runMode: "implementation",
      runtimePolicy,
      workspace
    });

    await expect(completionPromise).resolves.toEqual(
      expect.objectContaining({
        kind: "awaiting_input",
        reason: "Need the production API host before continuing.",
        prompt: "Provide the production API host.",
        moduleResult: expect.objectContaining({
          moduleId: "implement.spec",
          outcome: "awaiting_input",
          requestedState: "awaiting_input"
        })
      })
    );
  });

  it("maps model idle timeout failures into stalled completions with structured timeout logs", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const workspace = buildPreparedWorkspace(issue.identifier);
    const runtimeLogs = {
      record: vi.fn(async () => {})
    };
    let resolveCompletion: ((completion: SymphonyAgentRuntimeCompletion) => void) | null =
      null;
    const completionPromise = new Promise<SymphonyAgentRuntimeCompletion>((resolve) => {
      resolveCompletion = resolve;
    });

    startSessionMock.mockImplementation(async ({ launchTarget, issue: startedIssue }) => ({
      client: {
        close: vi.fn(),
        async runTurn() {
          return {
            kind: "failed",
            threadId: "thread-1",
            turnId: "turn-1",
            usage: null,
            reason: "Pi SDK runner idled for 30000ms without visible activity.",
            failureClass: "model_idle_timeout",
            detail: {
              result: {
                failureClass: "model_idle_timeout",
                lastActivityAt: "2026-04-14T18:00:35.000Z",
                lastActivityType: "assistant_text_delta"
              },
              timeoutTriggerEvent: {
                eventType: "idle_timeout_triggered",
                thresholdMs: 30_000,
                lastActivityAt: "2026-04-14T18:00:35.000Z",
                lastActivityType: "assistant_text_delta"
              }
            }
          };
        }
      },
      threadId: "thread-1",
      workspacePath: "/workspace",
      hostLaunchPath: "/tmp/symphony-runtime",
      hostWorkspacePath: "/tmp/symphony-runtime",
      launchTarget,
      issue: startedIssue,
      processId: "1234",
      autoApproveRequests: true,
      approvalPolicy: "never",
      model: "xiaomi/mimo-v2-pro",
      reasoningEffort: "high",
      profile: null,
      providerId: "openrouter",
      providerName: "OpenRouter"
    }));

    const runtime = await import("./agent-harness-runtime.js").then((module) =>
      module.createSymphonyAgentRuntime({
        promptContract: {
          repoRoot: "/tmp/repo",
          promptPath: "/tmp/repo/prompt.md",
          template: "Implement the issue.",
          variables: []
        },
        githubRepository: "openai/symphony",
        tracker,
        runStore: {} as never,
        loadWorkflowLifecycleView: async () => null,
        observeActiveWorkflowIssueState: async () => true,
        isCapabilityManagedRun: async () => false,
        agentAnalytics: {
          recordEvent: vi.fn(async () => {}),
          recordCommandResourceProfile: vi.fn(async () => {})
        } as never,
        runtimeLogs: runtimeLogs as never,
        hostCommandEnvSource: {},
        logger: createSilentSymphonyLogger("@symphony/api.test"),
        callbacks: {
          onUpdate: vi.fn(async () => {}),
          onComplete: vi.fn(async (_issueId, completion) => {
            resolveCompletion?.(completion);
          })
        }
      })
    );

    await runtime.startRun({
      issue,
      runId: null,
      attempt: 1,
      runMode: "implementation",
      runtimePolicy,
      workspace
    });

    await expect(completionPromise).resolves.toEqual({
      kind: "stalled",
      reason: "Pi SDK runner idled for 30000ms without visible activity."
    });
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_idle_timeout",
        payload: expect.objectContaining({
          failureClass: "model_idle_timeout",
          thresholdMs: 30_000,
          lastActivityType: "assistant_text_delta"
        })
      })
    );
  });

  it.each([
    {
      failureClass: "run_timeout" as const,
      eventType: "runtime_run_timeout",
      reason: "Pi SDK runner exceeded the 30000ms turn timeout.",
      detail: {
        result: {
          failureClass: "run_timeout",
          lastActivityAt: "2026-04-14T18:00:35.000Z",
          lastActivityType: "assistant_reasoning_delta"
        },
        timeoutTriggerEvent: {
          eventType: "run_timeout_triggered",
          thresholdMs: 30_000,
          lastActivityAt: "2026-04-14T18:00:35.000Z",
          lastActivityType: "assistant_reasoning_delta"
        }
      }
    },
    {
      failureClass: "tool_timeout" as const,
      eventType: "runtime_tool_timeout",
      reason: "Command execution exceeded the configured timeout.",
      detail: {
        failureClass: "tool_timeout",
        lastActivityAt: "2026-04-14T18:00:40.000Z",
        lastActivityType: "command_failed"
      }
    }
  ])(
    "maps $failureClass failures into explicit runtime failure logs",
    async ({ failureClass, eventType, reason, detail }) => {
      const issue = buildSymphonyTrackerIssue({
        state: "In Progress"
      });
      const tracker = createMemorySymphonyTracker([issue]);
      const runtimePolicy = buildSymphonyRuntimePolicy();
      const workspace = buildPreparedWorkspace(issue.identifier);
      const runtimeLogs = {
        record: vi.fn(async () => {})
      };
      let resolveCompletion: ((completion: SymphonyAgentRuntimeCompletion) => void) | null =
        null;
      const completionPromise = new Promise<SymphonyAgentRuntimeCompletion>((resolve) => {
        resolveCompletion = resolve;
      });

      startSessionMock.mockImplementation(async ({ launchTarget, issue: startedIssue }) => ({
        client: {
          close: vi.fn(),
          async runTurn() {
            return {
              kind: "failed",
              threadId: "thread-1",
              turnId: "turn-1",
              usage: null,
              reason,
              failureClass,
              detail
            };
          }
        },
        threadId: "thread-1",
        workspacePath: "/workspace",
        hostLaunchPath: "/tmp/symphony-runtime",
        hostWorkspacePath: "/tmp/symphony-runtime",
        launchTarget,
        issue: startedIssue,
        processId: "1234",
        autoApproveRequests: true,
        approvalPolicy: "never",
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: null,
        providerId: "openrouter",
        providerName: "OpenRouter"
      }));

      const runtime = await import("./agent-harness-runtime.js").then((module) =>
        module.createSymphonyAgentRuntime({
          promptContract: {
            repoRoot: "/tmp/repo",
            promptPath: "/tmp/repo/prompt.md",
            template: "Implement the issue.",
            variables: []
          },
          githubRepository: "openai/symphony",
          tracker,
          runStore: {} as never,
          loadWorkflowLifecycleView: async () => null,
          observeActiveWorkflowIssueState: async () => true,
          isCapabilityManagedRun: async () => false,
          agentAnalytics: {
            recordEvent: vi.fn(async () => {}),
            recordCommandResourceProfile: vi.fn(async () => {})
          } as never,
          runtimeLogs: runtimeLogs as never,
          hostCommandEnvSource: {},
          logger: createSilentSymphonyLogger("@symphony/api.test"),
          callbacks: {
            onUpdate: vi.fn(async () => {}),
            onComplete: vi.fn(async (_issueId, completion) => {
              resolveCompletion?.(completion);
            })
          }
        })
      );

      await runtime.startRun({
        issue,
        runId: null,
        attempt: 1,
        runMode: "implementation",
        runtimePolicy,
        workspace
      });

      await expect(completionPromise).resolves.toEqual({
        kind: "failure",
        reason
      });
      expect(runtimeLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType,
          payload: expect.objectContaining({
            failureClass
          })
        })
      );
    }
  );

  it("classifies in-turn transport timeouts as execution failures instead of startup failures", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const workspace = buildPreparedWorkspace(issue.identifier);
    const runtimeLogs = {
      record: vi.fn(async () => {})
    };
    let resolveCompletion: ((completion: SymphonyAgentRuntimeCompletion) => void) | null =
      null;
    const completionPromise = new Promise<SymphonyAgentRuntimeCompletion>((resolve) => {
      resolveCompletion = resolve;
    });

    startSessionMock.mockImplementation(async ({ launchTarget, issue: startedIssue }) => ({
      client: {
        close: vi.fn(),
        async runTurn() {
          throw new HarnessSessionError(
            "pi_sdk_runner_transport_timeout",
            "Timed out waiting for Pi SDK bridge output after 5000ms.",
            {
              transportTimeoutMs: 5_000,
              diagnostics: {
                recentStdoutLines: ["waiting for bridge output"],
                recentStderrLines: []
              }
            }
          );
        }
      },
      threadId: "thread-1",
      workspacePath: "/workspace",
      hostLaunchPath: "/tmp/symphony-runtime",
      hostWorkspacePath: "/tmp/symphony-runtime",
      launchTarget,
      issue: startedIssue,
      processId: "1234",
      autoApproveRequests: true,
      approvalPolicy: "never",
      model: "xiaomi/mimo-v2-pro",
      reasoningEffort: "high",
      profile: null,
      providerId: "openrouter",
      providerName: "OpenRouter"
    }));

    const runtime = await import("./agent-harness-runtime.js").then((module) =>
      module.createSymphonyAgentRuntime({
        promptContract: {
          repoRoot: "/tmp/repo",
          promptPath: "/tmp/repo/prompt.md",
          template: "Implement the issue.",
          variables: []
        },
        githubRepository: "openai/symphony",
        tracker,
        runStore: {} as never,
        loadWorkflowLifecycleView: async () => null,
        observeActiveWorkflowIssueState: async () => true,
        isCapabilityManagedRun: async () => false,
        agentAnalytics: {
          recordEvent: vi.fn(async () => {}),
          recordCommandResourceProfile: vi.fn(async () => {})
        } as never,
        runtimeLogs: runtimeLogs as never,
        hostCommandEnvSource: {},
        logger: createSilentSymphonyLogger("@symphony/api.test"),
        callbacks: {
          onUpdate: vi.fn(async () => {}),
          onComplete: vi.fn(async (_issueId, completion) => {
            resolveCompletion?.(completion);
          })
        }
      })
    );

    await runtime.startRun({
      issue,
      runId: null,
      attempt: 1,
      runMode: "implementation",
      runtimePolicy,
      workspace
    });

    await expect(completionPromise).resolves.toEqual({
      kind: "failure",
      reason: "Timed out waiting for Pi SDK bridge output after 5000ms."
    });
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_transport_timeout",
        payload: expect.objectContaining({
          failureStage: null,
          failureOrigin: null,
          thresholdMs: 5_000,
          failureClass: "transport_timeout"
        })
      })
    );
    expect(runtimeLogs.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_startup_failed"
      })
    );
  });
});

function buildPreparedWorkspace(issueIdentifier: string): PreparedWorkspace {
  return {
    issueIdentifier,
    workspaceKey: "workspace-1",
    backendKind: "docker",
    prepareDisposition: "created",
    containerDisposition: "started",
    networkDisposition: "created",
    afterCreateHookOutcome: "completed",
    executionTarget: {
      kind: "container",
      workspacePath: "/workspace",
      hostPath: "/tmp/symphony-runtime",
      containerId: "container-1",
      containerName: "symphony-workspace-1",
      shell: "bash",
      user: "1000:1000"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/symphony-runtime",
      containerPath: "/workspace"
    },
    networkName: "symphony-workspace-network",
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
    path: "/tmp/symphony-runtime",
    created: true,
    workerHost: null
  };
}
