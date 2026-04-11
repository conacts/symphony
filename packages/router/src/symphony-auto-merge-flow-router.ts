import {
  createWorkflowRouter,
  createWorkflowRouterAsync
} from "./router-builder.js";
import type { WorkflowRouterDefinition } from "./router-definition.js";
import { WorkflowEdge } from "./router-edge.js";
import type { WorkflowRouterPreset } from "./router-preset-registry.js";
import {
  createSymphonyCurrentFlowRouterDefinition,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy
} from "./symphony-current-flow-router.js";
import {
  createSymphonyCurrentFlowDispatchCommand,
  createSymphonyCurrentFlowTrackerTransitionCommand,
  readSymphonyCurrentFlowDeliveryReportedSignal
} from "./symphony-current-flow-contract.js";
import type { WorkflowSignal } from "./types/index.js";
import type { WorkflowRouterOptions } from "./workflow-router.js";

export type SymphonyAutoMergeFlowNode = SymphonyCurrentFlowNode;
export type SymphonyAutoMergeFlowData = SymphonyCurrentFlowData;
export type SymphonyAutoMergeFlowPolicy = SymphonyCurrentFlowPolicy;

const symphonyAutoMergeFlowPolicy = Object.freeze({}) as SymphonyAutoMergeFlowPolicy;

export function createSymphonyAutoMergeFlowRouterDefinition(): WorkflowRouterDefinition<
  SymphonyAutoMergeFlowNode,
  SymphonyAutoMergeFlowData,
  SymphonyAutoMergeFlowPolicy
> {
  const baseDefinition = createSymphonyCurrentFlowRouterDefinition();

  return {
    ...baseDefinition,
    name: "symphony-auto-merge-flow",
    version: "1",
    edges: baseDefinition.edges.map((edge) => {
      switch (edge.id) {
        case "implementation_delivery_reported_to_review":
          return createAutoMergeDeliveryEdge("implementation");
        case "rework_delivery_reported_to_review":
          return createAutoMergeDeliveryEdge("rework");
        default:
          return edge;
      }
    })
  };
}

export function createSymphonyAutoMergeFlowRouter(
  options: WorkflowRouterOptions = {}
) {
  return createWorkflowRouter(
    createSymphonyAutoMergeFlowRouterDefinition(),
    options
  );
}

export async function createSymphonyAutoMergeFlowRouterAsync(
  options: WorkflowRouterOptions = {}
) {
  return await createWorkflowRouterAsync(
    createSymphonyAutoMergeFlowRouterDefinition(),
    options
  );
}

export function createSymphonyAutoMergeFlowRouterPreset(): WorkflowRouterPreset<
  SymphonyAutoMergeFlowNode,
  SymphonyAutoMergeFlowData,
  SymphonyAutoMergeFlowPolicy
> {
  return {
    async createRouter(input = {}) {
      return await createSymphonyAutoMergeFlowRouterAsync(input);
    },
    createPolicy() {
      return symphonyAutoMergeFlowPolicy;
    }
  };
}

function createAutoMergeDeliveryEdge(
  from: Extract<SymphonyAutoMergeFlowNode, "implementation" | "rework">
): WorkflowEdge<
  SymphonyAutoMergeFlowNode,
  SymphonyAutoMergeFlowData,
  SymphonyAutoMergeFlowPolicy
> {
  return new WorkflowEdge({
    id: `${from}_delivery_reported_to_approved_merge`,
    from,
    to: "approved_merge",
    reasonCode:
      from === "implementation"
        ? "delivery_reported_auto_approved"
        : "rework_delivery_reported_auto_approved",
    guard: ({ signal }) => isCompletedDeliveryReported(signal),
    commands: ({ signal }) => [
      createTrackerTransitionCommand(signal, "Approved"),
      createDispatchCommand(signal, "approved_merge")
    ]
  });
}

function isCompletedDeliveryReported(signal: WorkflowSignal): boolean {
  return readSymphonyCurrentFlowDeliveryReportedSignal(signal)?.payload.status === "completed";
}

function createDispatchCommand(
  signal: WorkflowSignal,
  runMode: "approved_merge"
) {
  return createSymphonyCurrentFlowDispatchCommand({
    id: createCommandId(signal, `dispatch_${runMode}`),
    dedupeKey: null,
    runMode
  });
}

function createTrackerTransitionCommand(
  signal: WorkflowSignal,
  targetState: "Approved"
) {
  return createSymphonyCurrentFlowTrackerTransitionCommand({
    id: createCommandId(signal, `tracker_${normalizeToken(targetState)}`),
    dedupeKey: null,
    state: targetState
  });
}

function createCommandId(signal: WorkflowSignal, suffix: string): string {
  const signalId = signal.id?.trim();
  if (!signalId) {
    throw new TypeError("Workflow signal id is required when building commands.");
  }

  return `command_${signalId}_${suffix}`;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/g, "_");
}
