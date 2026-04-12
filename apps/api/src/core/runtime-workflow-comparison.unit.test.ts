import { describe, expect, it, vi } from "vitest";
import type { RouteWorkflowBindingScope } from "@symphony/db";
import type {
  RouteWorkflowReplayState,
  SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type { RouteWorkflowRecord } from "@symphony/db";
import { createSymphonyCurrentFlowTrackerStateObservedSignal } from "@symphony/router";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { compareRuntimeWorkflowByIssueIdentifier } from "./runtime-workflow-comparison.js";

describe("runtime workflow comparison", () => {
  it("loads replay by scoped issue when a hosted workspace scope is configured", async () => {
    const loadReplayStateByIssueIdentifier = vi.fn();
    const loadReplayStateByScopedIssueSpy = vi.fn().mockResolvedValue(buildReplayState());
    const loadReplayStateByScopedIssue: SymphonyRouteWorkflowPort["loadReplayStateByScopedIssue"] =
      async <Node extends string>(input: {
        issueIdentifier: string;
        bindingScope: RouteWorkflowBindingScope;
      }): Promise<RouteWorkflowReplayState<Node>> => {
        await loadReplayStateByScopedIssueSpy(input);
        return buildReplayState<Node>();
      };

    const comparison = await compareRuntimeWorkflowByIssueIdentifier({
      issueIdentifier: "SYM-420",
      routeWorkflows: createRouteWorkflowPortDouble({
        loadReplayStateByIssueIdentifier,
        loadReplayStateByScopedIssue
      }),
      trackerConfig: buildSymphonyRuntimePolicy().tracker,
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      },
      presetIds: ["current-flow"]
    });

    expect(loadReplayStateByScopedIssueSpy).toHaveBeenCalledWith({
      issueIdentifier: "SYM-420",
      bindingScope: {
        organizationId: "org-1",
        linearWorkspaceIdentityId: "ws-1"
      }
    });
    expect(loadReplayStateByIssueIdentifier).not.toHaveBeenCalled();
    expect(comparison?.replay.workflow.issueIdentifier).toBe("SYM-420");
    expect(comparison?.comparedPresetIds).toEqual(["current-flow"]);
  });

  it("keeps unscoped replay loading when no hosted workspace scope is configured", async () => {
    const loadReplayStateByIssueIdentifierSpy = vi
      .fn()
      .mockResolvedValue(buildReplayState());
    const loadReplayStateByIssueIdentifier: SymphonyRouteWorkflowPort["loadReplayStateByIssueIdentifier"] =
      async <Node extends string>(
        issueIdentifier: string
      ): Promise<RouteWorkflowReplayState<Node>> => {
        await loadReplayStateByIssueIdentifierSpy(issueIdentifier);
        return buildReplayState<Node>();
      };
    const loadReplayStateByScopedIssueSpy = vi.fn();
    const loadReplayStateByScopedIssue: SymphonyRouteWorkflowPort["loadReplayStateByScopedIssue"] =
      async (input) => await loadReplayStateByScopedIssueSpy(input);

    await compareRuntimeWorkflowByIssueIdentifier({
      issueIdentifier: "SYM-421",
      routeWorkflows: createRouteWorkflowPortDouble({
        loadReplayStateByIssueIdentifier,
        loadReplayStateByScopedIssue
      }),
      trackerConfig: buildSymphonyRuntimePolicy().tracker,
      presetIds: ["current-flow"]
    });

    expect(loadReplayStateByIssueIdentifierSpy).toHaveBeenCalledWith("SYM-421");
    expect(loadReplayStateByScopedIssueSpy).not.toHaveBeenCalled();
  });
});

function buildReplayState<Node extends string = string>(): RouteWorkflowReplayState<Node> {
  return {
    workflow: {
      workflowId: "workflow-420",
      trackerIssueId: "tracker-420",
      repositoryKey: "repo-secondary",
      issueIdentifier: "SYM-420",
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
  loadReplayStateByIssueIdentifier: SymphonyRouteWorkflowPort["loadReplayStateByIssueIdentifier"];
  loadReplayStateByScopedIssue: SymphonyRouteWorkflowPort["loadReplayStateByScopedIssue"];
}): SymphonyRouteWorkflowPort {
  return {
    ensureWorkflowForIssue: vi.fn(),
    loadHydrationStateByWorkflowId: vi.fn(),
    loadHydrationStateByIssueIdentifier: vi.fn(),
    loadHydrationStateByScopedIssue: vi.fn(),
    loadReplayStateByWorkflowId: vi.fn(),
    loadReplayStateByIssueIdentifier: input.loadReplayStateByIssueIdentifier,
    loadReplayStateByScopedIssue: input.loadReplayStateByScopedIssue,
    rehydrateProjectionByWorkflowId: vi.fn(),
    rehydrateProjectionByIssueIdentifier: vi.fn(),
    rehydrateProjectionByScopedIssue: vi.fn(),
    resumeSessionByWorkflowId: vi.fn(),
    resumeSessionByIssueIdentifier: vi.fn(),
    resumeSessionByScopedIssue: vi.fn(),
    recordRouteResult: vi.fn(),
    appendCommandSettlement: vi.fn()
  };
}
