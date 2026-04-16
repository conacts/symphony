import { beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessSessionError } from "@symphony/agent-harnesses";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createSilentSymphonyLogger } from "@symphony/logger";
import type { PreparedWorkspace } from "@symphony/workspace";
import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import {
  buildHarnessAgentMessageCompletedUpdate,
  buildHarnessAwaitingInputTurnResult,
  buildHarnessCommandCompletedUpdate,
  buildHarnessCompletedTurnResult,
  buildHarnessFailedTurnResult,
  buildImplementationModuleResult,
  buildImplementationModuleResultMessage,
  createTranscriptDrivenFakeHarnessBuilder,
  createTranscriptDrivenFakeHarnessStartSession
} from "../test-support/transcript-driven-fake-harness.js";

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
    const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
      transcript: createTranscriptDrivenFakeHarnessBuilder()
        .update(
          buildHarnessAgentMessageCompletedUpdate({
            text: buildImplementationModuleResultMessage()
          })
        )
        .awaitCloseThenThrow(
          new Error("session closed after terminal result detection")
        )
    });
    startSessionMock.mockImplementation(fakeHarness.startSession);

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
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_turn_started",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          turnNumber: 1,
          runMode: "implementation",
          capabilityManagedRun: true,
          explicitCompletionRequirement: "none"
        })
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_run_completed",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          outcome: "completed",
          completionKind: "delivered",
          moduleId: "implement.spec",
          moduleOutcome: "completed",
          requestedState: "done"
        })
      })
    );
    expect(fakeHarness.controller.closeRequested).toBe(true);
    expect(fakeHarness.controller.closeCount).toBeGreaterThanOrEqual(1);
  });

  it("keeps a detected capability-managed completion when the harness later returns a timeout failure", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Progress"
    });
    const tracker = createMemorySymphonyTracker([issue]);
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const runtimeLogs = {
      record: vi.fn(async () => {})
    };
    const workspace = buildPreparedWorkspace(issue.identifier);
    let resolveCompletion: ((completion: SymphonyAgentRuntimeCompletion) => void) | null =
      null;
    const completionPromise = new Promise<SymphonyAgentRuntimeCompletion>((resolve) => {
      resolveCompletion = resolve;
    });
    const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
      transcript: createTranscriptDrivenFakeHarnessBuilder()
        .update(
          buildHarnessAgentMessageCompletedUpdate({
            text: buildImplementationModuleResultMessage({
              summary: "Implemented the requested issue behavior and recorded the result."
            })
          })
        )
        .resolve(
          buildHarnessFailedTurnResult({
            reason: "Pi SDK runner idled for 30000ms without visible activity.",
            failureClass: "model_idle_timeout",
            detail: {
              kind: "terminal_result",
              result: {
                finalAssistantMessage: null,
                moduleResult: null,
                stopReason: null,
                providerStopReason: null,
                lastActivityAt: "2026-04-14T18:00:35.000Z",
                lastActivityType: "assistant_text_delta"
              },
              timeoutTrigger: {
                failureClass: "model_idle_timeout",
                thresholdMs: 30_000,
                callId: null,
                toolName: null,
                commandText: null,
                lastActivityAt: "2026-04-14T18:00:35.000Z",
                lastActivityType: "assistant_text_delta"
              }
            }
          })
        )
    });
    startSessionMock.mockImplementation(fakeHarness.startSession);

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
        kind: "delivered",
        moduleResult: expect.objectContaining({
          moduleId: "implement.spec",
          requestedState: "done"
        })
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_terminal_result_detected",
        issueIdentifier: issue.identifier
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_run_completed",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          outcome: "completed",
          completionKind: "delivered"
        })
      })
    );
    expect(runtimeLogs.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_timeout_classified"
      })
    );
    expect(runtimeLogs.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_run_paused"
      })
    );
    expect(fakeHarness.controller.closeRequested).toBe(true);
  });

  it("delivers capability-managed completion after command work instead of pausing as stalled", async () => {
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
    const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
      transcript: createTranscriptDrivenFakeHarnessBuilder()
        .update(
          buildHarnessCommandCompletedUpdate({
            command:
              "git commit -m \"Add compact current-step summary strip to workflow observability\"",
            aggregatedOutput:
              "[codex/intellegent-router 1234567] Add compact current-step summary strip to workflow observability",
            exitCode: 0
          })
        )
        .update(
          buildHarnessAgentMessageCompletedUpdate({
            text: buildImplementationModuleResultMessage({
              summary: "Committed the requested changes and completed implementation."
            })
          })
        )
        .resolve(buildHarnessCompletedTurnResult())
    });
    startSessionMock.mockImplementation(fakeHarness.startSession);

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
        kind: "delivered",
        moduleResult: expect.objectContaining({
          moduleId: "implement.spec",
          requestedState: "done"
        })
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_terminal_result_detected",
        issueIdentifier: issue.identifier
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_run_completed",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          outcome: "completed",
          completionKind: "delivered"
        })
      })
    );
    expect(runtimeLogs.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_timeout_classified"
      })
    );
    expect(runtimeLogs.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_run_paused"
      })
    );
    expect(fakeHarness.controller.runTurnCalls).toHaveLength(1);
  });

  it("maps explicit awaiting_input turn results into runtime completion without throwing", async () => {
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

    const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
      transcript: createTranscriptDrivenFakeHarnessBuilder().resolve(
        buildHarnessAwaitingInputTurnResult({
          reason: "Need the production API host before continuing.",
          prompt: "Provide the production API host.",
          detail: {
            finalAssistantMessage,
            moduleResult: buildImplementationModuleResult({
              outcome: "awaiting_input",
              summary: "Need the production API host before continuing.",
              requestedState: "awaiting_input",
              nextInputPrompt: "Provide the production API host."
            }),
            stopReason: null,
            providerStopReason: null,
            lastActivityAt: null,
            lastActivityType: null
          }
        })
      )
    });
    startSessionMock.mockImplementation(fakeHarness.startSession);

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
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_turn_started",
        issueIdentifier: issue.identifier
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_terminal_result_returned",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          terminalResultKind: "awaiting_input",
          reason: "Need the production API host before continuing.",
          prompt: "Provide the production API host."
        })
      })
    );
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_run_paused",
        issueIdentifier: issue.identifier,
        payload: expect.objectContaining({
          outcome: "paused",
          completionKind: "awaiting_input",
          moduleId: "implement.spec",
          moduleOutcome: "awaiting_input",
          requestedState: "awaiting_input"
        })
      })
    );
    expect(fakeHarness.controller.runTurnCalls).toHaveLength(1);
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

    const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
      transcript: createTranscriptDrivenFakeHarnessBuilder().resolve(
        buildHarnessFailedTurnResult({
          reason: "Pi SDK runner idled for 30000ms without visible activity.",
          failureClass: "model_idle_timeout",
          detail: {
            kind: "terminal_result",
            result: {
              finalAssistantMessage: null,
              moduleResult: null,
              stopReason: null,
              providerStopReason: null,
              lastActivityAt: "2026-04-14T18:00:35.000Z",
              lastActivityType: "assistant_text_delta"
            },
            timeoutTrigger: {
              failureClass: "model_idle_timeout",
              thresholdMs: 30_000,
              callId: null,
              toolName: null,
              commandText: null,
              lastActivityAt: "2026-04-14T18:00:35.000Z",
              lastActivityType: "assistant_text_delta"
            }
          }
        })
      )
    });
    startSessionMock.mockImplementation(fakeHarness.startSession);

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
        eventType: "runtime_timeout_classified",
        payload: expect.objectContaining({
          timeoutClass: "model_idle_timeout",
          failureClass: "model_idle_timeout",
          thresholdMs: 30_000,
          lastActivityType: "assistant_text_delta"
        })
      })
    );
    expect(fakeHarness.controller.runTurnCalls).toHaveLength(1);
  });

  it.each([
    {
      failureClass: "run_timeout" as const,
      eventType: "runtime_timeout_classified",
      reason: "Pi SDK runner exceeded the 30000ms turn timeout.",
      detail: {
        kind: "terminal_result" as const,
        result: {
          finalAssistantMessage: null,
          moduleResult: null,
          stopReason: null,
          providerStopReason: null,
          lastActivityAt: "2026-04-14T18:00:35.000Z",
          lastActivityType: "assistant_reasoning_delta"
        },
        timeoutTrigger: {
          failureClass: "run_timeout" as const,
          thresholdMs: 30_000,
          callId: null,
          toolName: null,
          commandText: null,
          lastActivityAt: "2026-04-14T18:00:35.000Z",
          lastActivityType: "assistant_reasoning_delta"
        }
      }
    },
    {
      failureClass: "tool_timeout" as const,
      eventType: "runtime_timeout_classified",
      reason: "Command execution exceeded the configured timeout.",
      detail: {
        kind: "terminal_result" as const,
        result: {
          finalAssistantMessage: null,
          moduleResult: null,
          stopReason: null,
          providerStopReason: null,
          lastActivityAt: "2026-04-14T18:00:40.000Z",
          lastActivityType: "command_failed"
        },
        timeoutTrigger: {
          failureClass: "tool_timeout" as const,
          thresholdMs: 30_000,
          callId: "call-1",
          toolName: "shell",
          commandText: "pnpm test",
          lastActivityAt: "2026-04-14T18:00:40.000Z",
          lastActivityType: "command_failed"
        }
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

      const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
        transcript: createTranscriptDrivenFakeHarnessBuilder().resolve(
          buildHarnessFailedTurnResult({
            reason,
            failureClass,
            detail
          })
        )
      });
      startSessionMock.mockImplementation(fakeHarness.startSession);

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
          eventType: "runtime_terminal_result_returned",
          payload: expect.objectContaining({
            terminalResultKind: "failed",
            reason,
            failureClass
          })
        })
      );
      expect(runtimeLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType,
          payload: expect.objectContaining({
            failureClass,
            timeoutClass: failureClass
          })
        })
      );
      expect(runtimeLogs.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "runtime_run_paused",
          payload: expect.objectContaining({
            outcome: "paused",
            completionKind: "failure"
          })
        })
      );
      expect(fakeHarness.controller.runTurnCalls).toHaveLength(1);
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

    const fakeHarness = createTranscriptDrivenFakeHarnessStartSession({
      transcript: createTranscriptDrivenFakeHarnessBuilder().throw(
        new HarnessSessionError(
          "pi_sdk_runner_transport_timeout",
          "Timed out waiting for Pi SDK bridge output after 5000ms.",
          {
            kind: "transport_timeout",
            transportTimeoutMs: 5_000,
            diagnostics: {
              recentStdoutLines: ["waiting for bridge output"],
              recentStderrLines: []
            }
          }
        )
      )
    });
    startSessionMock.mockImplementation(fakeHarness.startSession);

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
        eventType: "runtime_timeout_classified",
        payload: expect.objectContaining({
          failureStage: null,
          failureOrigin: null,
          thresholdMs: 5_000,
          failureClass: "transport_timeout",
          timeoutClass: "transport_timeout"
        })
      })
    );
    expect(runtimeLogs.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runtime_startup_failed"
      })
    );
    expect(fakeHarness.controller.runTurnCalls).toHaveLength(1);
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
