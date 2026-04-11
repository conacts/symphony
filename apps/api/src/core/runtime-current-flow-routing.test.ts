import { describe, expect, it } from "vitest";
import {
  buildSymphonyReworkHandoff,
  buildSymphonyRuntimePolicy
} from "@symphony/test-support";
import {
  getDefaultRuntimeRouterPresetId,
  listRuntimeRouterPresetIds,
  selectRuntimeRouterPreset
} from "./runtime-workflow-presets.js";
import {
  createSymphonyCurrentFlowDispatchCommand,
  createSymphonyCurrentFlowTrackerTransitionCommand
} from "@symphony/router";

describe("runtime router preset selection", () => {
  it("lists and resolves the registered current-flow preset", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    expect(listRuntimeRouterPresetIds()).toEqual(["current-flow"]);
    expect(getDefaultRuntimeRouterPresetId()).toBe("current-flow");

    const routing = await selectRuntimeRouterPreset({
      trackerConfig: runtimePolicy.tracker,
      presetId: "current-flow",
      now: () => new Date("2026-04-10T00:00:00.000Z")
    });

    expect(routing.presetId).toBe("current-flow");
    expect(routing.module.presetId).toBe("current-flow");
    expect(routing.router.definition().name).toBe("symphony-current-flow");
    expect(routing.router.definition().version).toBe("1");
    expect(routing.policy).toEqual({});
    expect(
      routing.module.runtimeAdapter.readTrackerTransitionState(
        createSymphonyCurrentFlowTrackerTransitionCommand({
          id: "command_tracker_bootstrapping",
          dedupeKey: null,
          state: "Bootstrapping"
        })
      )
    ).toBe("Bootstrapping");
    expect(
      routing.module.runtimeAdapter.readDispatchRunMode(
        createSymphonyCurrentFlowDispatchCommand({
          id: "command_dispatch_implementation",
          dedupeKey: null,
          runMode: "implementation"
        })
      )
    ).toBe("implementation");
  });

  it("fails fast when a preset id is not registered", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    await expect(
      selectRuntimeRouterPreset({
        trackerConfig: runtimePolicy.tracker,
        presetId: "missing"
      })
    ).rejects.toThrow(/Unknown workflow router preset/);
  });

  it("fails fast when the selected preset tracker contract is invalid", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    await expect(
      selectRuntimeRouterPreset({
        trackerConfig: {
          ...runtimePolicy.tracker,
          claimTransitionToState: "In Progress"
        },
        presetId: "current-flow"
      })
    ).rejects.toThrow(
      /Current-flow routing requires tracker\.claimTransitionToState/
    );
  });

  it("reads persisted lifecycle values through the preset adapter", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const routing = await selectRuntimeRouterPreset({
      trackerConfig: runtimePolicy.tracker,
      presetId: "current-flow",
      now: () => new Date("2026-04-10T00:00:00.000Z")
    });
    const handoff = buildSymphonyReworkHandoff({
      triggerKind: "changes_requested_review",
      recordedAt: "2026-04-10T00:05:00.000Z"
    });

    expect(
      routing.module.runtimeAdapter.readTrackerStateFromProjection({
        workflowId: "workflow-1",
        data: {
          trackerState: "Approved",
          lastDispatchMode: "approved_merge",
          lastRunMode: null,
          latestReworkHandoff: handoff,
          latestMergeResult: {
            runId: "run-1",
            status: "merged",
            summary: "Merged successfully",
            prUrl: "https://github.com/openai/symphony/pull/1",
            mergeCommitSha: "abc123",
            blockingReason: null,
            testsSummary: "green",
            recordedAt: "2026-04-10T00:06:00.000Z"
          }
        }
      })
    ).toBe("Approved");
    expect(
      routing.module.runtimeAdapter.readActiveRunModeFromProjection({
        workflowId: "workflow-1",
        data: {
          trackerState: "Approved",
          lastDispatchMode: "approved_merge",
          lastRunMode: null,
          latestReworkHandoff: handoff,
          latestMergeResult: null
        }
      })
    ).toBe("approved_merge");
    expect(
      routing.module.runtimeAdapter.readLatestReworkHandoffFromProjection({
        workflowId: "workflow-1",
        data: {
          trackerState: "In Review",
          lastDispatchMode: "implementation",
          lastRunMode: null,
          latestReworkHandoff: handoff,
          latestMergeResult: null
        }
      })
    ).toEqual(handoff);
    expect(
      routing.module.runtimeAdapter.readLatestMergeResultFromProjection({
        workflowId: "workflow-1",
        runId: "run-1",
        data: {
          trackerState: "Approved",
          lastDispatchMode: "approved_merge",
          lastRunMode: "approved_merge",
          latestReworkHandoff: null,
          latestMergeResult: {
            runId: "run-1",
            status: "merged",
            summary: "Merged successfully",
            prUrl: "https://github.com/openai/symphony/pull/1",
            mergeCommitSha: "abc123",
            blockingReason: null,
            testsSummary: "green",
            recordedAt: "2026-04-10T00:06:00.000Z"
          }
        }
      })
    ).toEqual({
      status: "merged",
      summary: "Merged successfully",
      prUrl: "https://github.com/openai/symphony/pull/1",
      mergeCommitSha: "abc123",
      blockingReason: null,
      testsSummary: "green"
    });
  });
});
