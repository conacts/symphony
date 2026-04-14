import type {
  RouteWorkflowCapabilityPlannerCommandRecord,
  RouteWorkflowCapabilityPlannerDecisionRecord,
  RouteWorkflowExecutionContractRecord,
  RouteWorkflowStore
} from "@symphony/db";
import {
  createSymphonyCapabilityExecutionCommand,
  planSymphonyIntelligentFlowDeterministically,
  createSymphonyCapabilityPreset,
  createWorkflowCapabilityPlanner,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyIntelligentFlowLifecycleState,
  type SymphonyWorkflowTicketExecutionContract,
  type WorkflowCapabilityPlan
} from "@symphony/router";
import { normalizeWorkflowToken } from "./runtime-route-workflow-command-utils.js";

type SymphonyCapabilityPlannerDecisionRecord = RouteWorkflowCapabilityPlannerDecisionRecord<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

type SymphonyCapabilityPlannerCommandRecord = RouteWorkflowCapabilityPlannerCommandRecord<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId
>;

export type SymphonyCapabilityPlanningResult = {
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  decision: SymphonyCapabilityPlannerDecisionRecord;
  command: SymphonyCapabilityPlannerCommandRecord | null;
  reused: boolean;
};

export type SymphonyCapabilityPlanningService = {
  planByWorkflowId(input: {
    workflowId: string;
    recordedAt: string;
    policyId?: SymphonyCapabilityPresetPolicyId;
  }): Promise<SymphonyCapabilityPlanningResult>;
};

export function createSymphonyCapabilityPlanningService(input: {
  routeWorkflowStore: RouteWorkflowStore;
}): SymphonyCapabilityPlanningService {
  return {
    async planByWorkflowId(planInput) {
      const workflowId = requireNonEmptyText(planInput.workflowId, "workflowId");
      const recordedAt = requireNonEmptyText(planInput.recordedAt, "recordedAt");
      const policyId = planInput.policyId ?? "default";
      const hydrationState =
        await input.routeWorkflowStore.loadWorkflowHydrationState(workflowId);
      if (!hydrationState) {
        throw new TypeError(
          `Capability planner cannot load route workflow ${workflowId}.`
        );
      }

      const history = await input.routeWorkflowStore.listHistory(workflowId);
      const historyEventSequence = history.at(-1)?.eventSequence ?? 0;
      const contract =
        await input.routeWorkflowStore.getExecutionContract<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >(workflowId);
      if (!contract) {
        throw new TypeError(
          `Capability planner requires a persisted execution contract for workflow ${workflowId}.`
        );
      }

      const existingDecision =
        await input.routeWorkflowStore.getCapabilityPlannerDecisionForState<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >({
          workflowId,
          historyEventSequence,
          contractUpdatedAt: contract.updatedAt,
          policyId
        });
      if (existingDecision) {
        const command = await loadCommandForDecision({
          routeWorkflowStore: input.routeWorkflowStore,
          decision: existingDecision
        });

        return {
          contract,
          plan: existingDecision.plan,
          decision: existingDecision,
          command,
          reused: true
        };
      }

      const preset = createSymphonyCapabilityPreset({
        policyId
      });
      const planner = createWorkflowCapabilityPlanner({
        capabilityDefinitions: preset.capabilities,
        modelProfiles: preset.modelProfiles,
        presetPolicy: preset.defaultPolicy
      });
      const decisionId = buildPlannerDecisionId({
        workflowId,
        historyEventSequence,
        contractUpdatedAt: contract.updatedAt,
        policyId
      });
      const plan =
        hydrationState.workflow.routerPresetId === "intelligent-flow"
          ? planSymphonyIntelligentFlowDeterministically({
              contract,
              history: history.map((entry) => entry.event),
              lifecycleState: resolveIntelligentFlowPlanningLifecycleState({
                workflowId,
                currentNode: hydrationState.snapshot?.projection.currentNode ?? null
              }),
              decisionId,
              decidedAt: recordedAt,
              policyId
            })
          : planner.plan({
              contract,
              history: history.map((entry) => entry.event),
              decisionId,
              decidedAt: recordedAt
            });
      const command = buildPlannerCommand({
        decisionId,
        workflowId,
        historyEventSequence,
        policyId,
        contract,
        plan
      });
      const persisted = await input.routeWorkflowStore.saveCapabilityPlannerDecision({
        workflowId,
        decisionId,
        policyId,
        contract,
        historyEventSequence,
        lifecycleProjectionSequence:
          hydrationState.snapshot?.projection.sequence ?? 0,
        lifecycleCurrentNode: hydrationState.snapshot?.projection.currentNode ?? null,
        plan,
        command,
        recordedAt
      });

      return {
        contract,
        plan,
        decision: persisted.decision,
        command: persisted.command,
        reused: false
      };
    }
  };
}

function resolveIntelligentFlowPlanningLifecycleState(input: {
  workflowId: string;
  currentNode: string | null;
}): SymphonyIntelligentFlowLifecycleState {
  if (input.currentNode === null) {
    throw new TypeError(
      `Intelligent-flow capability planning requires a lifecycle node for workflow ${input.workflowId}.`
    );
  }

  switch (input.currentNode) {
    case "queued":
    case "claimed":
    case "active":
    case "awaiting_input":
    case "blocked":
    case "paused":
    case "failed":
    case "done":
      return input.currentNode;
    default:
      throw new TypeError(
        `Intelligent-flow capability planning cannot use lifecycle node ${JSON.stringify(input.currentNode)} for workflow ${input.workflowId}.`
      );
  }
}

async function loadCommandForDecision(input: {
  routeWorkflowStore: RouteWorkflowStore;
  decision: SymphonyCapabilityPlannerDecisionRecord;
}): Promise<SymphonyCapabilityPlannerCommandRecord | null> {
  if (input.decision.planKind !== "execute") {
    return null;
  }

  const command =
    await input.routeWorkflowStore.getCapabilityPlannerCommandByDecisionId<
      SymphonyWorkflowTicketExecutionContract,
      SymphonyCapabilityId,
      SymphonyCapabilityModelProfileId
    >(input.decision.decisionId);
  if (!command) {
    throw new TypeError(
      `Capability planner decision ${input.decision.decisionId} is missing its emitted command.`
    );
  }

  return command;
}

function buildPlannerCommand(input: {
  decisionId: string;
  workflowId: string;
  historyEventSequence: number;
  policyId: SymphonyCapabilityPresetPolicyId;
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
}): SymphonyCapabilityPlannerCommandRecord["command"] | null {
  if (input.plan.kind !== "execute") {
    return null;
  }

  return createSymphonyCapabilityExecutionCommand({
    id: buildPlannerCommandId(input.decisionId),
    dedupeKey: buildPlannerDedupeKey({
      workflowId: input.workflowId,
      historyEventSequence: input.historyEventSequence,
      contractUpdatedAt: input.contract.updatedAt,
      policyId: input.policyId,
      capabilityId: input.plan.decision.capabilityId,
      workEpoch: input.plan.decision.workEpoch
    }),
    workflowId: input.workflowId,
    capabilityId: input.plan.decision.capabilityId,
    modelProfileId: input.plan.decision.modelProfileId,
    contract: toExecutionCommandContract(input.contract),
    executionInput: null
  });
}

function buildPlannerDecisionId(input: {
  workflowId: string;
  historyEventSequence: number;
  contractUpdatedAt: string;
  policyId: SymphonyCapabilityPresetPolicyId;
}): string {
  return [
    "capability_plan",
    normalizeWorkflowToken(input.workflowId),
    String(input.historyEventSequence),
    normalizeWorkflowToken(input.contractUpdatedAt),
    normalizeWorkflowToken(input.policyId)
  ].join("_");
}

function buildPlannerCommandId(decisionId: string): string {
  return `capability_execute_${normalizeWorkflowToken(decisionId)}`;
}

function buildPlannerDedupeKey(input: {
  workflowId: string;
  historyEventSequence: number;
  contractUpdatedAt: string;
  policyId: SymphonyCapabilityPresetPolicyId;
  capabilityId: SymphonyCapabilityId;
  workEpoch: number;
}): string {
  return [
    input.workflowId,
    String(input.historyEventSequence),
    input.contractUpdatedAt,
    input.policyId,
    input.capabilityId,
    String(input.workEpoch)
  ].join(":");
}

function toExecutionCommandContract(
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >
): SymphonyWorkflowTicketExecutionContract {
  return {
    contractId: contract.contractId,
    workflowId: contract.workflowId,
    issueIdentifier: contract.issueIdentifier,
    repositoryKey: contract.repositoryKey,
    summary: contract.summary,
    objective: contract.objective,
    doneDefinition: contract.doneDefinition,
    mergePolicy: contract.mergePolicy,
    routingDirectives: {
      requiredCapabilityIds: [...contract.routingDirectives.requiredCapabilityIds],
      preferredCapabilityIds: [...contract.routingDirectives.preferredCapabilityIds],
      forbiddenCapabilityIds: [...contract.routingDirectives.forbiddenCapabilityIds],
      requiredEvidenceIds: [...contract.routingDirectives.requiredEvidenceIds],
      allowedModelProfileIds: [...contract.routingDirectives.allowedModelProfileIds],
      completionPolicy: {
        mode: contract.routingDirectives.completionPolicy.mode
      },
      clarificationPolicy: {
        mode: contract.routingDirectives.clarificationPolicy.mode
      },
      reviewStrictness: contract.routingDirectives.reviewStrictness,
      maxRetryCount: contract.routingDirectives.maxRetryCount
    },
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt
  };
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
