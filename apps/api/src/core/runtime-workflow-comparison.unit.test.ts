import { describe, expect, it, vi } from "vitest";
import type { RouteWorkflowBindingScope } from "@symphony/db";
import type {
  RouteWorkflowReplayState,
  SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type { RouteWorkflowRecord } from "@symphony/db";
import { createSymphonyCurrentFlowTrackerStateObservedSignal } from "@symphony/router";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { compareRuntimeWorkflowByTrackerIssueKey } from "./runtime-workflow-comparison.js";

describe("runtime workflow comparison", () => {
  it("loads replay by scoped issue when a hosted workspace scope is configured", async () => {
    const loadReplayStateByTrackerIssueKey = vi.fn();
    const loadReplayStateByScopedTrackerIssueKeySpy = vi.fn().mockResolvedValue(buildReplayState());
    const loadReplayStateByScopedTrackerIssueKey: SymphonyRouteWorkflowPort["loadReplayStateByScopedTrackerIssueKey"] =
      async <Node extends string>(input: {
        trackerIssueKey: string;
        bindingScope: RouteWorkflowBindingScope;
      }): Promise<RouteWorkflowReplayState<Node>> => {
        await loadReplayStateByScopedTrackerIssueKeySpy(input);
        return buildReplayState<Node>();
      };

    const comparison = await compareRuntimeWorkflowByTrackerIssueKey({
      trackerIssueKey: "SYM-420",
      routeWorkflows: createRouteWorkflowPortDouble({
        loadReplayStateByTrackerIssueKey,
        loadReplayStateByScopedTrackerIssueKey
      }),
      trackerConfig: buildSymphonyRuntimePolicy().tracker,
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      },
      presetIds: ["current-flow"]
    });

    expect(loadReplayStateByScopedTrackerIssueKeySpy).toHaveBeenCalledWith({
      trackerIssueKey: "SYM-420",
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      }
    });
    expect(loadReplayStateByTrackerIssueKey).not.toHaveBeenCalled();
    expect(comparison?.replay.workflow.trackerIssueKey).toBe("SYM-420");
    expect(comparison?.comparedPresetIds).toEqual(["current-flow"]);
  });

  it("keeps unscoped replay loading when no hosted workspace scope is configured", async () => {
    const loadReplayStateByTrackerIssueKeySpy = vi
      .fn()
      .mockResolvedValue(buildReplayState());
    const loadReplayStateByTrackerIssueKey: SymphonyRouteWorkflowPort["loadReplayStateByTrackerIssueKey"] =
      async <Node extends string>(
        trackerIssueKey: string
      ): Promise<RouteWorkflowReplayState<Node>> => {
        await loadReplayStateByTrackerIssueKeySpy(trackerIssueKey);
        return buildReplayState<Node>();
      };
    const loadReplayStateByScopedTrackerIssueKeySpy = vi.fn();
    const loadReplayStateByScopedTrackerIssueKey: SymphonyRouteWorkflowPort["loadReplayStateByScopedTrackerIssueKey"] =
      async (input) => await loadReplayStateByScopedTrackerIssueKeySpy(input);

    await compareRuntimeWorkflowByTrackerIssueKey({
      trackerIssueKey: "SYM-421",
      routeWorkflows: createRouteWorkflowPortDouble({
        loadReplayStateByTrackerIssueKey,
        loadReplayStateByScopedTrackerIssueKey
      }),
      trackerConfig: buildSymphonyRuntimePolicy().tracker,
      presetIds: ["current-flow"]
    });

    expect(loadReplayStateByTrackerIssueKeySpy).toHaveBeenCalledWith("SYM-421");
    expect(loadReplayStateByScopedTrackerIssueKeySpy).not.toHaveBeenCalled();
  });
});

function buildReplayState<Node extends string = string>(): RouteWorkflowReplayState<Node> {
  return {
    workflow: {
      workflowId: "workflow-420",
      trackerIssueId: "tracker-420",
      repositoryKey: "repo-secondary",
      trackerIssueKey: "SYM-420",
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      },
      routerPresetId: "current-flow",
      routerName: "current-flow",
      routerVersion: "1",
      archivedAt: null,
      insertedAt: "2026-04-12T12:00:00.000Z",
      updatedAt: "2026-04-12T12:00:00.000Z"
    } satisfies RouteWorkflowRecord,
    history: [],
    signals: [
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-12T12:00:10.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: null
      })
    ]
  };
}

function createRouteWorkflowPortDouble(input: {
  loadReplayStateByTrackerIssueKey: SymphonyRouteWorkflowPort["loadReplayStateByTrackerIssueKey"];
  loadReplayStateByScopedTrackerIssueKey: SymphonyRouteWorkflowPort["loadReplayStateByScopedTrackerIssueKey"];
}): SymphonyRouteWorkflowPort {
  return {
    ensureWorkflowForIssue: vi.fn(),
    loadHydrationStateByWorkflowId: vi.fn(),
    loadHydrationStateByTrackerIssueKey: vi.fn(),
    loadHydrationStateByScopedTrackerIssueKey: vi.fn(),
    loadReplayStateByWorkflowId: vi.fn(),
    loadReplayStateByTrackerIssueKey: input.loadReplayStateByTrackerIssueKey,
    loadReplayStateByScopedTrackerIssueKey: input.loadReplayStateByScopedTrackerIssueKey,
    rehydrateProjectionByWorkflowId: vi.fn(),
    rehydrateProjectionByTrackerIssueKey: vi.fn(),
    rehydrateProjectionByScopedTrackerIssueKey: vi.fn(),
    resumeSessionByWorkflowId: vi.fn(),
    resumeSessionByTrackerIssueKey: vi.fn(),
    resumeSessionByScopedTrackerIssueKey: vi.fn(),
    recordRouteResult: vi.fn(),
    appendCommandSettlement: vi.fn()
  };
}
