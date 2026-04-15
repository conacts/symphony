import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessSession, HarnessSessionClient } from "@symphony/agent-harnesses";
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
            message: {
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
