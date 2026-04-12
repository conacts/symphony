import { describe, expect, it, vi } from "vitest";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import { createRuntimeOrchestratorPort } from "./runtime-orchestrator-port.js";

describe("runtime orchestrator port", () => {
  it("runs the pre-poll hook before the runtime poll cycle", async () => {
    const calls: string[] = [];
    const snapshot = buildSymphonyOrchestratorSnapshot({
      claimedIssueIds: ["issue-123"]
    });
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => true),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => {
        calls.push("run");
        return snapshot;
      })
    };
    const beforePollCycle = vi.fn(async () => {
      calls.push("before");
    });

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: {
        record: vi.fn(async () => {})
      } as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates,
      beforePollCycle
    });

    await port.runPollCycle();

    expect(calls).toEqual(["before", "run"]);
    expect(beforePollCycle).toHaveBeenCalledWith(snapshot);
  });

  it("coalesces concurrent poll calls through a single pre-poll hook", async () => {
    const snapshot = buildSymphonyOrchestratorSnapshot();
    let resolvePoll!: (value: typeof snapshot) => void;
    const pendingPoll = new Promise<typeof snapshot>((resolve) => {
      resolvePoll = resolve;
    });
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => true),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => await pendingPoll)
    };
    const beforePollCycle = vi.fn(async () => {});

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: {
        record: vi.fn(async () => {})
      } as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates,
      beforePollCycle
    });

    const first = port.runPollCycle();
    const second = port.runPollCycle();
    resolvePoll(snapshot);

    await Promise.all([first, second]);

    expect(beforePollCycle).toHaveBeenCalledTimes(1);
    expect(runtime.runPollCycle).toHaveBeenCalledTimes(1);
  });

  it("dispatches routed issues directly through the runtime", async () => {
    const issue = buildSymphonyTrackerIssue();
    const snapshot = buildSymphonyOrchestratorSnapshot();
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => true),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => snapshot)
    };

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: {
        record: vi.fn(async () => {})
      } as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates
    });

    await port.dispatchRoutedIssue({
      workflowId: "workflow-123",
      commandId: "command-123",
      trackerIssue: issue,
      runMode: "rework",
      recordedAt: "2026-04-10T18:00:00.000Z"
    });

    expect(runtime.dispatchIssue).toHaveBeenCalledWith(issue, 1, null, "rework");
  });

  it("skips routed dispatch when the issue is already claimed", async () => {
    const issue = buildSymphonyTrackerIssue();
    const snapshot = buildSymphonyOrchestratorSnapshot({
      claimedIssueIds: [issue.id]
    });
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => true),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => snapshot)
    };
    const runtimeLogs = {
      record: vi.fn(async () => {})
    };

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: runtimeLogs as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates
    });

    await port.dispatchRoutedIssue({
      workflowId: "workflow-123",
      commandId: "command-123",
      trackerIssue: issue,
      runMode: "implementation",
      recordedAt: "2026-04-10T18:01:00.000Z"
    });

    expect(runtime.dispatchIssue).not.toHaveBeenCalled();
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "routed_dispatch_skipped_claimed",
        issueIdentifier: issue.identifier
      })
    );
  });

  it("clears the in-flight latch after a before-poll failure so the next poll can run", async () => {
    const snapshot = buildSymphonyOrchestratorSnapshot();
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => true),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => snapshot)
    };
    const beforePollCycle = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("before poll failed"))
      .mockResolvedValueOnce();

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: {
        record: vi.fn(async () => {})
      } as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates,
      beforePollCycle
    });

    await expect(port.runPollCycle()).rejects.toThrow("before poll failed");
    expect(port.isPollCycleInFlight()).toBe(false);

    await expect(port.runPollCycle()).resolves.toBe(snapshot);
    expect(beforePollCycle).toHaveBeenCalledTimes(2);
    expect(runtime.runPollCycle).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight latch after workflow tracker-state preload failure", async () => {
    const snapshot = buildSymphonyOrchestratorSnapshot();
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => true),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => snapshot)
    };
    const loadStates = vi
      .fn<
        (
          currentSnapshot: ReturnType<typeof buildSymphonyOrchestratorSnapshot>
        ) => Promise<Map<string, string>>
      >()
      .mockRejectedValueOnce(new Error("preload failed"))
      .mockResolvedValue(new Map());

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: {
        record: vi.fn(async () => {})
      } as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates: loadStates
    });

    await expect(port.runPollCycle()).rejects.toThrow("preload failed");
    expect(port.isPollCycleInFlight()).toBe(false);

    await expect(port.runPollCycle()).resolves.toBe(snapshot);
    expect(runtime.runPollCycle).toHaveBeenCalledTimes(1);
  });

  it("skips routed dispatch when the orchestrator reports no dispatch capacity", async () => {
    const issue = buildSymphonyTrackerIssue();
    const snapshot = buildSymphonyOrchestratorSnapshot({
      running: [
        {
          issue: buildSymphonyTrackerIssue({
            id: "issue-running",
            identifier: "COL-2"
          }),
          runId: "run-1",
          runMode: "implementation",
          startedAt: "2026-04-10T18:00:00.000Z"
        }
      ],
      maxConcurrentAgents: 1
    });
    const runtimeLogs = {
      record: vi.fn(async () => {})
    };
    const runtime = {
      snapshot: vi.fn(() => snapshot),
      shouldDispatchIssue: vi.fn(() => false),
      dispatchIssue: vi.fn(async () => {}),
      runPollCycle: vi.fn(async () => snapshot)
    };

    const port = createRuntimeOrchestratorPort({
      runtime,
      logger: createSilentSymphonyLogger("@symphony/api.runtime-orchestrator-port.test"),
      runtimeLogs: runtimeLogs as never,
      realtime: createSymphonyRealtimeHub(),
      loadRunningWorkflowTrackerStates
    });

    await port.dispatchRoutedIssue({
      workflowId: "workflow-123",
      commandId: "command-123",
      trackerIssue: issue,
      runMode: "implementation",
      recordedAt: "2026-04-10T18:02:00.000Z"
    });

    expect(runtime.dispatchIssue).not.toHaveBeenCalled();
    expect(runtime.shouldDispatchIssue).toHaveBeenCalledWith(issue);
    expect(runtimeLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "routed_dispatch_skipped_ineligible",
        issueIdentifier: issue.identifier
      })
    );
  });
});

async function loadRunningWorkflowTrackerStates(
  snapshot: ReturnType<typeof buildSymphonyOrchestratorSnapshot>
): Promise<Map<string, string>> {
  return new Map(
    snapshot.running.map((entry) => [entry.issue.identifier, entry.issue.state])
  );
}
