import type { RouteWorkflowStore } from "@symphony/db";
import type {
  SymphonyRuntimeClarificationAnswerResult,
  SymphonyRuntimeIssueCapabilityState
} from "@symphony/contracts";
import {
  createSymphonyWorkflowClarificationAnsweredSignal,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId
} from "@symphony/router";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import type {
  SymphonyCapabilityPlanningResult,
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";

export type SymphonyCapabilityOperatorService = {
  inspectByIssueIdentifier(input: {
    issueIdentifier: string;
    recordedAt: string;
    policyId?: SymphonyCapabilityPresetPolicyId;
  }): Promise<SymphonyRuntimeIssueCapabilityState | null>;
  answerPendingClarificationByWorkflowId(input: {
    workflowId: string;
    recordedAt: string;
    requestId: string;
    answers: Record<string, string>;
    policyId?: SymphonyCapabilityPresetPolicyId;
  }): Promise<SymphonyRuntimeClarificationAnswerResult>;
};

export function createSymphonyCapabilityOperatorService(input: {
  routeWorkflowStore: RouteWorkflowStore;
  routeWorkflows: SymphonyRouteWorkflowPort;
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  capabilityPlanning: SymphonyCapabilityPlanningService;
}): SymphonyCapabilityOperatorService {
  return {
    async inspectByIssueIdentifier(inspectInput) {
      const issueIdentifier = requireNonEmptyText(
        inspectInput.issueIdentifier,
        "issueIdentifier"
      );
      const recordedAt = requireNonEmptyText(inspectInput.recordedAt, "recordedAt");
      const policyId = inspectInput.policyId ?? "default";
      const loaded = await input.sessionLoader.loadHydrationByIssueIdentifier({
        issueIdentifier
      });
      if (!loaded) {
        return null;
      }

      const workflowId = loaded.hydrationState.workflow.workflowId;
      const lifecycleNode =
        loaded.hydrationState.snapshot?.projection.currentNode ?? null;
      if (!isCapabilityInspectableLifecycleNode(lifecycleNode)) {
        return null;
      }

      const contract =
        await input.routeWorkflowStore.getExecutionContract<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >(workflowId);
      if (!contract) {
        return null;
      }

      const planning = await input.capabilityPlanning.planByWorkflowId({
        workflowId,
        recordedAt,
        policyId
      });

      return serializeCapabilityState({
        issueIdentifier: contract.issueIdentifier,
        policyId,
        planning
      });
    },

    async answerPendingClarificationByWorkflowId(answerInput) {
      const workflowId = requireNonEmptyText(answerInput.workflowId, "workflowId");
      const recordedAt = requireNonEmptyText(answerInput.recordedAt, "recordedAt");
      const requestId = requireNonEmptyText(answerInput.requestId, "requestId");
      const policyId = answerInput.policyId ?? "default";
      const contract =
        await input.routeWorkflowStore.getExecutionContract<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >(workflowId);
      if (!contract) {
        throw new TypeError(
          `Capability operator cannot load execution contract for workflow ${workflowId}.`
        );
      }

      const resumed = await input.sessionLoader.resumeByWorkflowId({
        workflowId
      });
      if (!resumed) {
        throw new TypeError(
          `Capability operator cannot resume route workflow ${workflowId}.`
        );
      }

      const signal = createSymphonyWorkflowClarificationAnsweredSignal({
        id: buildClarificationAnsweredSignalId({
          workflowId,
          requestId,
          recordedAt
        }),
        occurredAt: recordedAt,
        source: "operator",
        workflowId,
        requestId,
        answeredAt: recordedAt,
        answers: answerInput.answers,
        causationId: null,
        correlationId: contract.issueIdentifier
      });
      const result = await resumed.resumed.session.receiveAsync(signal);

      await input.routeWorkflows.recordRouteResult({
        workflowId,
        policy: resumed.routing.policy,
        result
      });

      const planning = await input.capabilityPlanning.planByWorkflowId({
        workflowId,
        recordedAt: incrementIsoTimestamp(recordedAt, 1),
        policyId
      });

      return {
        issueIdentifier: contract.issueIdentifier,
        workflowId,
        requestId,
        answeredAt: recordedAt,
        capability: serializeCapabilityState({
          issueIdentifier: contract.issueIdentifier,
          policyId,
          planning
        })
      };
    }
  };
}

function serializeCapabilityState(input: {
  issueIdentifier: string;
  policyId: SymphonyCapabilityPresetPolicyId;
  planning: SymphonyCapabilityPlanningResult;
}): SymphonyRuntimeIssueCapabilityState {
  const baseState = {
    workflowId: input.planning.contract.workflowId,
    contractId: input.planning.contract.contractId,
    policyId: input.policyId,
    decidedAt: input.planning.decision.recordedAt
  };

  switch (input.planning.plan.kind) {
    case "execute":
      return {
        ...baseState,
        planKind: "execute",
        summary: `Next capability execution is ${input.planning.plan.decision.capabilityId}.`,
        capabilityId: input.planning.plan.decision.capabilityId,
        modelProfileId: input.planning.plan.decision.modelProfileId,
        workEpoch: input.planning.plan.decision.workEpoch,
        pendingClarification: null,
        completion: null
      };
    case "awaiting_input":
      return {
        ...baseState,
        planKind: "awaiting_input",
        summary: input.planning.plan.clarification.summary,
        capabilityId: input.planning.plan.clarification.raisedByCapabilityId,
        modelProfileId: null,
        workEpoch: input.planning.plan.clarification.workEpoch,
        pendingClarification: {
          ...input.planning.plan.clarification,
          answerPath: buildClarificationAnswerPath(input.issueIdentifier)
        },
        completion: null
      };
    case "blocked":
      return {
        ...baseState,
        planKind: "blocked",
        summary: input.planning.plan.reason,
        capabilityId: null,
        modelProfileId: null,
        workEpoch: null,
        pendingClarification: null,
        completion: null
      };
    case "ready_for_completion":
      return {
        ...baseState,
        planKind: "ready_for_completion",
        summary: "Workflow is ready for completion.",
        capabilityId: null,
        modelProfileId: null,
        workEpoch: input.planning.plan.evaluation.workEpoch,
        pendingClarification: null,
        completion: {
          ...input.planning.plan.evaluation,
          result: "ready_for_completion"
        }
      };
  }
}

function buildClarificationAnswerPath(issueIdentifier: string): string {
  return `/api/v1/${issueIdentifier}/clarification-answer`;
}

function buildClarificationAnsweredSignalId(input: {
  workflowId: string;
  requestId: string;
  recordedAt: string;
}): string {
  return [
    "signal",
    "clarification_answered",
    normalizeToken(input.workflowId),
    normalizeToken(input.requestId),
    normalizeToken(input.recordedAt)
  ].join("_");
}

function incrementIsoTimestamp(value: string, milliseconds: number): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid ISO timestamp ${JSON.stringify(value)}.`);
  }

  return new Date(timestamp + milliseconds).toISOString();
}

function normalizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_");
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function isCapabilityInspectableLifecycleNode(
  lifecycleNode: string | null
): lifecycleNode is
  | "bootstrapping"
  | "implementation"
  | "review"
  | "queued"
  | "claimed"
  | "active"
  | "awaiting_input"
  | "blocked" {
  switch (lifecycleNode) {
    case "bootstrapping":
    case "implementation":
    case "review":
    case "queued":
    case "claimed":
    case "active":
    case "awaiting_input":
    case "blocked":
      return true;
    default:
      return false;
  }
}
