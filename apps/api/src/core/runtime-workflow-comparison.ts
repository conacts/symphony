import {
  type WorkflowNodeId,
  type WorkflowRouterComparisonEntry,
  type WorkflowRouter,
  type WorkflowRouterComparisonResult,
  type WorkflowSignal
} from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";
import type {
  RouteWorkflowReplayState,
  SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type { SymphonyRuntimePersistedWorkspaceBindingScope } from "./runtime-bootstrap-contract.js";
import {
  listRuntimeRouterPresetIds,
  requireRuntimeRouterPresetId,
  selectRuntimeRouterPreset,
  type SymphonyRuntimeRouterPresetId
} from "./runtime-workflow-presets.js";

type RuntimeWorkflowComparisonRouter = WorkflowRouter<
  WorkflowNodeId,
  unknown,
  unknown
>;

type RuntimeWorkflowComparisonCandidate = {
  id: SymphonyRuntimeRouterPresetId;
  router: RuntimeWorkflowComparisonRouter;
  policy: unknown;
};

export type SymphonyRuntimeWorkflowComparison = {
  replay: RouteWorkflowReplayState<WorkflowNodeId>;
  comparedPresetIds: SymphonyRuntimeRouterPresetId[];
  comparison: WorkflowRouterComparisonResult<WorkflowNodeId, unknown>;
};

export async function compareRuntimeWorkflowByWorkflowId(input: {
  workflowId: string;
  routeWorkflows: SymphonyRouteWorkflowPort;
  trackerConfig: SymphonyTrackerConfig;
  presetIds?: ReadonlyArray<string>;
  now?: () => Date;
}): Promise<SymphonyRuntimeWorkflowComparison | null> {
  const replay = await input.routeWorkflows.loadReplayStateByWorkflowId(
    input.workflowId
  );
  if (!replay) {
    return null;
  }

  return await compareRuntimeWorkflowReplayState({
    replay,
    trackerConfig: input.trackerConfig,
    presetIds: input.presetIds,
    now: input.now
  });
}

export async function compareRuntimeWorkflowByTrackerIssueKey(input: {
  trackerIssueKey: string;
  routeWorkflows: SymphonyRouteWorkflowPort;
  trackerConfig: SymphonyTrackerConfig;
  bindingScope?: SymphonyRuntimePersistedWorkspaceBindingScope | null;
  presetIds?: ReadonlyArray<string>;
  now?: () => Date;
}): Promise<SymphonyRuntimeWorkflowComparison | null> {
  const replay = input.bindingScope
    ? await input.routeWorkflows.loadReplayStateByScopedTrackerIssueKey({
        trackerIssueKey: input.trackerIssueKey,
        bindingScope: input.bindingScope
      })
    : await input.routeWorkflows.loadReplayStateByTrackerIssueKey(
        input.trackerIssueKey
      );
  if (!replay) {
    return null;
  }

  return await compareRuntimeWorkflowReplayState({
    replay,
    trackerConfig: input.trackerConfig,
    presetIds: input.presetIds,
    now: input.now
  });
}

export async function compareRuntimeWorkflowReplayState(input: {
  replay: RouteWorkflowReplayState<WorkflowNodeId>;
  trackerConfig: SymphonyTrackerConfig;
  presetIds?: ReadonlyArray<string>;
  now?: () => Date;
}): Promise<SymphonyRuntimeWorkflowComparison> {
  const comparedPresetIds = normalizeComparedPresetIds(input.presetIds);
  const candidates = await buildComparisonCandidates({
    trackerConfig: input.trackerConfig,
    presetIds: comparedPresetIds,
    now: input.now
  });

  return {
    replay: input.replay,
    comparedPresetIds,
    comparison: await compareCandidates({
      candidates,
      workflowId: input.replay.workflow.workflowId,
      signals: input.replay.signals
    })
  };
}

function normalizeComparedPresetIds(
  presetIds: ReadonlyArray<string> | undefined
): SymphonyRuntimeRouterPresetId[] {
  const rawPresetIds = presetIds
    ? [...presetIds]
    : listRuntimeRouterPresetIds();
  if (rawPresetIds.length === 0) {
    throw new TypeError(
      "Runtime workflow comparison requires at least one preset id."
    );
  }

  const normalizedPresetIds: SymphonyRuntimeRouterPresetId[] = [];
  const seenPresetIds = new Set<SymphonyRuntimeRouterPresetId>();

  for (const rawPresetId of rawPresetIds) {
    const presetId = requireRuntimeRouterPresetId(rawPresetId);
    if (seenPresetIds.has(presetId)) {
      throw new TypeError(
        `Runtime workflow comparison preset ${JSON.stringify(presetId)} was requested more than once.`
      );
    }

    seenPresetIds.add(presetId);
    normalizedPresetIds.push(presetId);
  }

  return normalizedPresetIds;
}

async function buildComparisonCandidates(input: {
  trackerConfig: SymphonyTrackerConfig;
  presetIds: ReadonlyArray<SymphonyRuntimeRouterPresetId>;
  now?: () => Date;
}): Promise<RuntimeWorkflowComparisonCandidate[]> {
  const candidates: RuntimeWorkflowComparisonCandidate[] = [];

  for (const presetId of input.presetIds) {
    const resolvedPreset = await selectRuntimeRouterPreset({
      trackerConfig: input.trackerConfig,
      presetId,
      now: input.now
    });
    candidates.push({
      id: presetId,
      router: resolvedPreset.router as RuntimeWorkflowComparisonRouter,
      policy: resolvedPreset.policy
    });
  }

  return candidates;
}

async function compareCandidates(input: {
  candidates: ReadonlyArray<RuntimeWorkflowComparisonCandidate>;
  workflowId: string;
  signals: ReadonlyArray<WorkflowSignal>;
}): Promise<WorkflowRouterComparisonResult<WorkflowNodeId, unknown>> {
  const entries: WorkflowRouterComparisonEntry<WorkflowNodeId, unknown>[] = [];

  for (const candidate of input.candidates) {
    entries.push({
      candidateId: candidate.id,
      simulation: await candidate.router.simulateAsync({
        workflowId: input.workflowId,
        signals: input.signals,
        policy: candidate.policy
      })
    });
  }

  return {
    workflowId: input.workflowId,
    signals: [...input.signals],
    entries,
    summary: summarizeComparison(entries)
  };
}

function summarizeComparison(
  entries: ReadonlyArray<WorkflowRouterComparisonEntry<WorkflowNodeId, unknown>>
) {
  const finalNodeByCandidate: Record<string, WorkflowNodeId | null> = {};
  const reasonCodesByCandidate: Record<string, string[]> = {};
  const pendingCommandCountsByCandidate: Record<string, number> = {};

  for (const entry of entries) {
    finalNodeByCandidate[entry.candidateId] = entry.simulation.projection.currentNode;
    reasonCodesByCandidate[entry.candidateId] = entry.simulation.steps.map(
      (step) => step.result.decision.reasonCode
    );
    pendingCommandCountsByCandidate[entry.candidateId] =
      entry.simulation.projection.pendingCommands.length;
  }

  return {
    diverged:
      new Set(
        Object.values(finalNodeByCandidate).map((node) => node ?? "__null__")
      ).size > 1 ||
      new Set(
        Object.values(reasonCodesByCandidate).map((codes) => codes.join("\u0000"))
      ).size > 1 ||
      new Set(Object.values(pendingCommandCountsByCandidate)).size > 1,
    finalNodeByCandidate,
    reasonCodesByCandidate,
    pendingCommandCountsByCandidate
  };
}
