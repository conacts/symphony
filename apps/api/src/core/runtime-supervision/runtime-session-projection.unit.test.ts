import { describe, expect, it, vi } from "vitest";
import type { HarnessSession } from "@symphony/agent-harnesses";
import { buildSymphonyRuntimePolicy, buildSymphonyTrackerIssue } from "@symphony/test-support";
import { createSilentSymphonyLogger } from "@symphony/logger";
import {
  buildHarnessAgentMessageCompletedUpdate,
  buildImplementationModuleResultMessage
} from "../../test-support/transcript-driven-fake-harness.js";
import { createRuntimeTurnProjection } from "./runtime-session-projection.js";

describe("runtime turn projection", () => {
  it("synthesizes a canonical session.started event once for a persisted turn", async () => {
    const runStore = {
      recordEvent: vi.fn(async () => {}),
      upsertRunContext: vi.fn(async () => {}),
      updateTurn: vi.fn(async () => {})
    };
    const projection = createRuntimeTurnProjection({
      issue: buildSymphonyTrackerIssue(),
      runId: "run-1",
      attempt: 1,
      runMode: "implementation",
      persistedTurnId: "turn-1",
      session: createHarnessSession(),
      runtimePolicy: buildSymphonyRuntimePolicy(),
      runtimeContextBase: {
        harnessKind: "pi",
        processId: "1234",
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: null,
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: null,
        providerEnvKey: null,
        launchTarget: {
          kind: "container"
        }
      },
      runStore: runStore as never,
      agentAnalytics: {
        recordEvent: vi.fn(async () => {}),
        recordCommandResourceProfile: vi.fn(async () => {})
      } as never,
      workerSessionContract: {
        recordObservation: vi.fn(async () => {})
      } as never,
      callbacks: {
        onUpdate: vi.fn(async () => {}),
        onComplete: vi.fn(async () => {})
      },
      commandResourceMonitor: null,
      logger: createSilentSymphonyLogger("@symphony/api.test")
    });

    await projection.recordSyntheticSessionStartedIfNeeded();

    expect(runStore.recordEvent).toHaveBeenCalledWith(
      "run-1",
      "turn-1",
      expect.objectContaining({
        eventType: "session.started",
        payload: expect.objectContaining({
          type: "session.started",
          thread_id: "thread-1",
          turn_id: "turn-1"
        })
      })
    );
    expect(runStore.upsertRunContext).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        threadId: "thread-1",
        processId: "1234"
      })
    );
    expect(projection.state.recordedCanonicalSessionStart).toBe(true);
  });

  it("projects runtime updates, persists canonical events, and returns detected completions", async () => {
    const callbacks = {
      onUpdate: vi.fn(async () => {}),
      onComplete: vi.fn(async () => {})
    };
    const workerSessionContract = {
      recordObservation: vi.fn(async () => {})
    };
    const runStore = {
      recordEvent: vi.fn(async () => {}),
      upsertRunContext: vi.fn(async () => {}),
      updateTurn: vi.fn(async () => {})
    };
    const agentAnalytics = {
      recordEvent: vi.fn(async () => {}),
      recordCommandResourceProfile: vi.fn(async () => {})
    };
    const projection = createRuntimeTurnProjection({
      issue: buildSymphonyTrackerIssue(),
      runId: "run-1",
      attempt: 1,
      runMode: "implementation",
      persistedTurnId: "turn-1",
      session: createHarnessSession(),
      runtimePolicy: buildSymphonyRuntimePolicy(),
      runtimeContextBase: {
        harnessKind: "pi",
        processId: "1234",
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: null,
        providerId: "openrouter",
        providerName: "OpenRouter",
        authMode: null,
        providerEnvKey: null,
        launchTarget: {
          kind: "container"
        }
      },
      runStore: runStore as never,
      agentAnalytics: agentAnalytics as never,
      workerSessionContract: workerSessionContract as never,
      callbacks,
      commandResourceMonitor: null,
      logger: createSilentSymphonyLogger("@symphony/api.test")
    });

    const result = await projection.handleUpdate(
      buildHarnessAgentMessageCompletedUpdate({
        text: buildImplementationModuleResultMessage()
      })
    );

    expect(result.detectedCompletion).toEqual(
      expect.objectContaining({
        kind: "delivered",
        moduleResult: expect.objectContaining({
          moduleId: "implement.spec",
          requestedState: "done"
        })
      })
    );
    expect(projection.state.latestCompletionCandidate).toEqual(
      expect.objectContaining({
        kind: "module_result"
      })
    );
    expect(callbacks.onUpdate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: "item.completed"
      })
    );
    expect(workerSessionContract.recordObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "item.completed"
      })
    );
    expect(runStore.recordEvent).toHaveBeenCalledWith(
      "run-1",
      "turn-1",
      expect.objectContaining({
        eventType: "item.completed"
      })
    );
    expect(agentAnalytics.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        turnId: "turn-1"
      })
    );
  });
});

function createHarnessSession(): HarnessSession {
  return {
    client: {
      close() {},
      async runTurn() {
        throw new TypeError("runTurn should not be called in projection tests.");
      }
    },
    threadId: "thread-1",
    workspacePath: "/workspace",
    hostLaunchPath: "/tmp/symphony-runtime",
    hostWorkspacePath: "/tmp/symphony-runtime",
    launchTarget: {
      kind: "container",
      hostLaunchPath: "/tmp/symphony-runtime",
      hostWorkspacePath: "/tmp/symphony-runtime",
      runtimeWorkspacePath: "/workspace",
      containerId: "container-1",
      containerName: "symphony-workspace-1",
      shell: "bash",
      user: "1000:1000"
    },
    issue: buildSymphonyTrackerIssue(),
    processId: "1234",
    autoApproveRequests: true,
    approvalPolicy: "never",
    model: "xiaomi/mimo-v2-pro",
    reasoningEffort: "high",
    profile: null,
    providerId: "openrouter",
    providerName: "OpenRouter"
  };
}
