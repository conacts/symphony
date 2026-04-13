import { buildWorkflowCapabilityCandidates } from "./capability-candidate-builder.js";
import { createWorkflowCapabilityRegistry } from "./capability-registry.js";
import { createDeterministicWorkflowCapabilityRouteStrategy } from "./capability-route-strategy.js";
import { evaluateWorkflowCompletionGate } from "./completion-gate.js";
import { createWorkflowModelProfileRegistry } from "./model-profile-registry.js";
import { projectWorkflowCapabilityProjection } from "./capability-projection.js";
import { resolveWorkflowRoutingPolicy } from "./routing-policy-resolver.js";
import type {
  WorkflowCapabilityId,
  WorkflowCapabilityPlan,
  WorkflowCapabilityPlanner,
  WorkflowCapabilityPlannerConfiguration,
  WorkflowCapabilityPlannerInput,
  WorkflowEvidenceId,
  WorkflowModelProfileId,
  WorkflowRoutingPolicyOverrides
} from "./types/index.js";

export function createWorkflowCapabilityPlanner<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(
  input: WorkflowCapabilityPlannerConfiguration<
    CapabilityId,
    EvidenceId,
    ProfileId
  >
): WorkflowCapabilityPlanner<CapabilityId, EvidenceId, ProfileId> {
  const modelProfileRegistry = createWorkflowModelProfileRegistry(input.modelProfiles);
  createWorkflowCapabilityRegistry({
    definitions: input.capabilityDefinitions,
    modelProfileRegistry
  });
  const routeStrategy =
    input.routeStrategy ??
    createDeterministicWorkflowCapabilityRouteStrategy<
      CapabilityId,
      EvidenceId,
      ProfileId
    >();

  return {
    plan(
      planInput: WorkflowCapabilityPlannerInput<
        CapabilityId,
        EvidenceId,
        ProfileId
      >
    ): WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId> {
      const resolvedPolicy = resolveWorkflowRoutingPolicy<
        CapabilityId,
        EvidenceId,
        ProfileId
      >({
        capabilityDefinitions: input.capabilityDefinitions,
        modelProfiles: input.modelProfiles,
        presetPolicy: input.presetPolicy,
        userDefaults: planInput.userDefaults ?? null,
        ticketDirectives: createContractPolicyOverrides(planInput.contract)
      });
      const projection = projectWorkflowCapabilityProjection<
        CapabilityId,
        EvidenceId,
        ProfileId
      >({
        workflowId: planInput.contract.workflowId,
        history: planInput.history
      });

      if (projection.pendingClarification !== null) {
        return {
          kind: "awaiting_input",
          clarification: projection.pendingClarification
        };
      }

      if (projection.blockedReason !== null) {
        return {
          kind: "blocked",
          reason: projection.blockedReason
        };
      }

      const completionGate = evaluateWorkflowCompletionGate<
        CapabilityId,
        EvidenceId,
        ProfileId
      >({
        resolvedPolicy,
        projection
      });
      if (
        completionGate.result === "ready_for_manual_completion" ||
        completionGate.result === "ready_for_auto_completion"
      ) {
        return {
          kind: completionGate.result,
          evaluation: completionGate
        };
      }

      const candidates = buildWorkflowCapabilityCandidates<
        CapabilityId,
        EvidenceId,
        ProfileId
      >({
        capabilityDefinitions: input.capabilityDefinitions,
        resolvedPolicy,
        projection
      });
      const selection = routeStrategy.select({
        candidates,
        resolvedPolicy,
        decisionId: planInput.decisionId,
        decidedAt: planInput.decidedAt
      });

      if (selection === null) {
        throw new TypeError(
          `Capability planner could not produce next work for workflow ${JSON.stringify(planInput.contract.workflowId)}.`
        );
      }

      return {
        kind: "execute",
        candidate: selection.candidate,
        decision: selection.decision
      };
    }
  };
}

function createContractPolicyOverrides<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  contract: WorkflowCapabilityPlannerInput<
    CapabilityId,
    EvidenceId,
    ProfileId
  >["contract"]
): WorkflowRoutingPolicyOverrides<CapabilityId, EvidenceId, ProfileId> {
  return {
    requiredCapabilityIds: contract.routingDirectives.requiredCapabilityIds,
    preferredCapabilityIds: contract.routingDirectives.preferredCapabilityIds,
    forbiddenCapabilityIds: contract.routingDirectives.forbiddenCapabilityIds,
    requiredEvidenceIds: contract.routingDirectives.requiredEvidenceIds,
    allowedModelProfileIds: contract.routingDirectives.allowedModelProfileIds,
    completionPolicy: contract.routingDirectives.completionPolicy,
    clarificationPolicy: contract.routingDirectives.clarificationPolicy,
    reviewStrictness: contract.routingDirectives.reviewStrictness,
    maxRetryCount: contract.routingDirectives.maxRetryCount,
    mergePolicy: contract.mergePolicy
  };
}
