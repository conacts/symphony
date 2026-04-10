import { describe, expect, it, vi } from "vitest";
import { buildSymphonyOrchestratorSnapshot } from "@symphony/test-support";
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
      beforePollCycle
    });

    const first = port.runPollCycle();
    const second = port.runPollCycle();
    resolvePoll(snapshot);

    await Promise.all([first, second]);

    expect(beforePollCycle).toHaveBeenCalledTimes(1);
    expect(runtime.runPollCycle).toHaveBeenCalledTimes(1);
  });
});
