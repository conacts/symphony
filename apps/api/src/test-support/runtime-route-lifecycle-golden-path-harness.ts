import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb,
  type RouteWorkflowStore
} from "@symphony/db";
import { createSymphonyCapabilityPreset } from "@symphony/router";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import {
  createMemorySymphonyTracker,
  type MemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import { createExternalRunDispatchAuthority } from "./runtime-dispatch-authority-stub.js";
import {
  createRuntimeRouteLifecycleService,
  type SymphonyRuntimeRouteLifecycleService
} from "../core/runtime-route-lifecycle-service.js";
import { createRouteWorkflowPort, type SymphonyRouteWorkflowPort } from "../core/runtime-route-workflows.js";
import { createDefaultRuntimeWorkflowPresetSelection } from "../core/runtime-workflow-preset-selection.js";
import {
  createRuntimeWorkflowSessionLoader
} from "../core/runtime-workflow-session-loader.js";
import {
  createSymphonyCapabilityOperatorService,
  type SymphonyCapabilityOperatorService
} from "../core/symphony-capability-operator.js";
import {
  createSymphonyCapabilityPlanningService,
  type SymphonyCapabilityPlanningService
} from "../core/symphony-capability-planning.js";
import type { SymphonyRuntimeRouterPresetId } from "../core/runtime-workflow-presets.js";

export type RouteLifecycleGoldenPathHarness = {
  issue: SymphonyTrackerIssue;
  tracker: MemorySymphonyTracker;
  routeWorkflowStore: RouteWorkflowStore;
  routeWorkflows: SymphonyRouteWorkflowPort;
  capabilityPlanning: SymphonyCapabilityPlanningService;
  capabilityOperator: SymphonyCapabilityOperatorService;
  service: SymphonyRuntimeRouteLifecycleService;
  cleanup(): Promise<void>;
};

export async function createRouteLifecycleGoldenPathHarness(input: {
  state: string;
  presetId?: SymphonyRuntimeRouterPresetId;
  createIntelligentFlowCapabilityPreset?: typeof createSymphonyCapabilityPreset;
}): Promise<RouteLifecycleGoldenPathHarness> {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-golden-path-"));
  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const issue = buildSymphonyTrackerIssue({
    state: input.state
  });
  const tracker = createMemorySymphonyTracker([issue]);
  const repositoryKey = "openai/symphony";

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey,
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T10:00:00.000Z"
  });

  const capabilityPlanning = createSymphonyCapabilityPlanningService({
    routeWorkflowStore,
    createIntelligentFlowCapabilityPreset:
      input.createIntelligentFlowCapabilityPreset
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker
  });
  const capabilityOperator = createSymphonyCapabilityOperatorService({
    routeWorkflowStore,
    routeWorkflows,
    sessionLoader,
    capabilityPlanning
  });
  const service = await createRuntimeRouteLifecycleService({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey,
    presetSelection: {
      ...createDefaultRuntimeWorkflowPresetSelection(),
      presetId: input.presetId ?? "intelligent-flow"
    },
    capabilityDispatchAuthority: createExternalRunDispatchAuthority(),
    routeWorkflowStore,
    capabilityPlanning,
    now: () => new Date("2026-04-13T10:00:00.000Z")
  });

  return {
    issue,
    tracker,
    routeWorkflowStore,
    routeWorkflows,
    capabilityPlanning,
    capabilityOperator,
    service,
    async cleanup() {
      database.close();
      await rm(root, {
        recursive: true,
        force: true
      });
    }
  };
}

export async function advanceWorkflowToRunningImplementation(
  harness: RouteLifecycleGoldenPathHarness
): Promise<void> {
  await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt: "2026-04-13T10:00:00.000Z"
  });

  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  if (!bootstrappingIssue) {
    throw new TypeError(
      `Golden-path harness could not reload bootstrapping issue ${harness.issue.identifier}.`
    );
  }

  await harness.service.workflowRoutingAdapter.activateRunStart({
    issue: bootstrappingIssue,
    runId: "run-1",
    runMode: "implementation",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-13T10:00:05.000Z"
  });
}

export async function loadRequiredWorkflowId(
  harness: RouteLifecycleGoldenPathHarness
): Promise<string> {
  const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier(
    harness.issue.identifier
  );
  if (!hydration) {
    throw new TypeError(
      `Golden-path harness could not load workflow hydration for ${harness.issue.identifier}.`
    );
  }

  return hydration.workflow.workflowId;
}

export async function listRecordedWorkflowSignalTypes(
  harness: RouteLifecycleGoldenPathHarness,
  workflowId: string
): Promise<string[]> {
  const history = await harness.routeWorkflowStore.listHistory(workflowId);
  return history.flatMap((entry) =>
    entry.event.kind === "signal_recorded"
      ? [entry.signalType ?? entry.event.signal.type]
      : []
  );
}
