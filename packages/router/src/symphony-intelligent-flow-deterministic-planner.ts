import { projectWorkflowCapabilityProjection } from "./capability-projection.js";
import { evaluateWorkflowCompletionGate } from "./completion-gate.js";
import { resolveWorkflowRoutingPolicy } from "./routing-policy-resolver.js";
import {
  buildSymphonyIntelligentFlowAdmissibilitySnapshot,
  type SymphonyIntelligentFlowCapabilityProjection,
  type SymphonyIntelligentFlowResolvedRoutingPolicy
} from "./symphony-intelligent-flow-admissibility.js";
import {
  type SymphonyCapabilityPresetPolicyId,
  createSymphonyCapabilityPreset
} from "./symphony-capability-preset.js";
import type {
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId,
  SymphonyWorkflowTicketExecutionContract
} from "./symphony-capability-contract.js";
import {
  createSymphonyIntelligentFlowDefaultModuleRegistry,
  type SymphonyIntelligentFlowModuleRegistry
} from "./symphony-intelligent-flow-module-registry.js";
import type {
  SymphonyIntelligentFlowAdmissibilitySnapshot,
  SymphonyIntelligentFlowLifecycleState,
  SymphonyIntelligentFlowModuleDefinition,
  SymphonyIntelligentFlowModuleId
} from "./symphony-intelligent-flow-contract.js";
import type {
  WorkflowCapabilityCandidate,
  WorkflowCapabilityDecision,
  WorkflowCapabilityAttempt,
  WorkflowCapabilityPlan,
  WorkflowCapabilityPhase,
  WorkflowHistory,
  WorkflowRoutingPolicyOverrides
} from "./types/index.js";

const capabilityBackedModuleIds = new Set<SymphonyCapabilityId>([
  "implement.spec",
  "critic.code_review",
  "critic.adversarial_tests",
  "critic.browser_test"
]);

type CapabilityBackedModuleDefinition = SymphonyIntelligentFlowModuleDefinition & {
  id: SymphonyCapabilityId;
};

export type SymphonyIntelligentFlowDeterministicCapabilityRouteSelection = {
  candidateSet: SymphonyIntelligentFlowAdmissibilitySnapshot;
  candidate: WorkflowCapabilityCandidate<
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  >;
  decision: WorkflowCapabilityDecision<
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  >;
  module: CapabilityBackedModuleDefinition;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
};

export function planSymphonyIntelligentFlowDeterministically(input: {
  contract: SymphonyWorkflowTicketExecutionContract;
  history: WorkflowHistory;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  decisionId: string;
  decidedAt: string;
  policyId?: SymphonyCapabilityPresetPolicyId;
  moduleRegistry?: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
}): WorkflowCapabilityPlan<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
  const preset = createSymphonyCapabilityPreset({
    policyId: input.policyId
  });
  const resolvedPolicy = resolveWorkflowRoutingPolicy({
    capabilityDefinitions: preset.capabilities,
    modelProfiles: preset.modelProfiles,
    presetPolicy: preset.defaultPolicy,
    ticketDirectives: createContractPolicyOverrides(input.contract)
  }) as SymphonyIntelligentFlowResolvedRoutingPolicy;
  const projection = projectWorkflowCapabilityProjection<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >({
    workflowId: input.contract.workflowId,
    history: input.history
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

  const completionGate = evaluateWorkflowCompletionGate({
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

  const selection = selectSymphonyIntelligentFlowDeterministicCapabilityRoute({
    resolvedPolicy,
    projection,
    lifecycleState: normalizePlanningLifecycleState(input.lifecycleState),
    decisionId: input.decisionId,
    decidedAt: input.decidedAt,
    moduleRegistry:
      input.moduleRegistry ??
      createSymphonyIntelligentFlowDefaultModuleRegistry()
  });

  return {
    kind: "execute",
    candidate: selection.candidate,
    decision: selection.decision
  };
}

export function selectSymphonyIntelligentFlowDeterministicCapabilityRoute(input: {
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  decisionId: string;
  decidedAt: string;
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
}): SymphonyIntelligentFlowDeterministicCapabilityRouteSelection {
  const candidateSet = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
    lifecycleState: input.lifecycleState,
    resolvedPolicy: input.resolvedPolicy,
    projection: input.projection,
    moduleRegistry: input.moduleRegistry
  });
  const selectedAdmissibleCandidate = candidateSet.admissible.find((candidate) =>
    isCapabilityBackedModuleId(candidate.moduleId)
  );

  if (!selectedAdmissibleCandidate) {
    throw new TypeError(
      `Intelligent-flow planner could not produce an executable capability module for workflow ${JSON.stringify(
        input.projection.workflowId
      )}.`
    );
  }

  const module = requireCapabilityBackedModuleDefinition({
    moduleRegistry: input.moduleRegistry,
    moduleId: selectedAdmissibleCandidate.moduleId
  });
  const allowedModelProfileIds = resolveAllowedModelProfileIds({
    module,
    resolvedPolicy: input.resolvedPolicy
  });
  if (allowedModelProfileIds.length === 0) {
    throw new TypeError(
      `Intelligent-flow planner selected ${JSON.stringify(module.id)} without an admissible model profile.`
    );
  }

  const candidate: WorkflowCapabilityCandidate<
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  > = {
    capabilityId: module.id,
    phase: toCapabilityPhase(module.phase),
    workEpoch: resolveSelectedWorkEpoch({
      projection: input.projection,
      moduleId: module.id
    }),
    priority: Math.max(1, candidateSet.admissible.length - selectedAdmissibleCandidate.rank),
    required: selectedAdmissibleCandidate.reasonCode !== "preferred_by_contract",
    preferred: selectedAdmissibleCandidate.reasonCode === "preferred_by_contract",
    allowedModelProfileIds,
    reason: buildCandidateReason({
      selectedAdmissibleCandidateSummary: selectedAdmissibleCandidate.summary,
      candidateWorkEpoch: resolveSelectedWorkEpoch({
        projection: input.projection,
        moduleId: module.id
      }),
      projection: input.projection,
      moduleId: module.id
    })
  };
  const modelProfileId = allowedModelProfileIds[0];
  if (!modelProfileId) {
    throw new TypeError(
      `Intelligent-flow planner could not select a model profile for ${JSON.stringify(module.id)}.`
    );
  }

  const decision: WorkflowCapabilityDecision<
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  > = {
    decisionId: requireNonEmptyText(input.decisionId, "decisionId"),
    capabilityId: module.id,
    modelProfileId,
    workEpoch: candidate.workEpoch,
    rationale: buildDeterministicRationale({
      moduleId: module.id,
      rank: selectedAdmissibleCandidate.rank,
      reason: candidate.reason,
      modelProfileId
    }),
    decidedAt: requireNonEmptyText(input.decidedAt, "decidedAt")
  };

  return {
    candidateSet,
    candidate,
    decision,
    module,
    projection: input.projection,
    resolvedPolicy: input.resolvedPolicy
  };
}

function createContractPolicyOverrides(
  contract: SymphonyWorkflowTicketExecutionContract
): WorkflowRoutingPolicyOverrides<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
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

function normalizePlanningLifecycleState(
  lifecycleState: SymphonyIntelligentFlowLifecycleState
): SymphonyIntelligentFlowLifecycleState {
  // The shell selects executable work while still in `claimed`, before the external
  // run emits `run_started`. Treat that pre-run state as execution-ready.
  return lifecycleState === "claimed" ? "active" : lifecycleState;
}

function resolveSelectedWorkEpoch(input: {
  projection: SymphonyIntelligentFlowCapabilityProjection;
  moduleId: SymphonyCapabilityId;
}): number {
  if (input.moduleId !== "implement.spec") {
    return input.projection.workEpoch;
  }

  const latestImplementationAttempt =
    input.projection.latestAttempts.find(
      (attempt) => attempt.capabilityId === "implement.spec"
    ) ?? null;

  return resolveImplementationWorkEpoch({
    latestAttempt: latestImplementationAttempt,
    currentWorkEpoch: input.projection.workEpoch
  });
}

function resolveImplementationWorkEpoch(input: {
  latestAttempt: WorkflowCapabilityAttempt<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  > | null;
  currentWorkEpoch: number;
}): number {
  const nextWorkEpoch = input.currentWorkEpoch + 1;
  if (!input.latestAttempt) {
    return nextWorkEpoch;
  }

  return input.latestAttempt.workEpoch >= nextWorkEpoch
    ? input.latestAttempt.workEpoch
    : nextWorkEpoch;
}

function requireCapabilityBackedModuleDefinition(input: {
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
  moduleId: SymphonyIntelligentFlowModuleId;
}): CapabilityBackedModuleDefinition {
  if (!isCapabilityBackedModuleId(input.moduleId)) {
    throw new TypeError(
      `Intelligent-flow planner selected non-capability module ${JSON.stringify(input.moduleId)} before slice 6 persistence is in place.`
    );
  }

  return input.moduleRegistry.getModuleDefinition(input.moduleId) as CapabilityBackedModuleDefinition;
}

function resolveAllowedModelProfileIds(input: {
  module: Pick<
    CapabilityBackedModuleDefinition,
    "executionKind" | "supportedModelProfileIds" | "id"
  >;
  resolvedPolicy: Pick<
    SymphonyIntelligentFlowResolvedRoutingPolicy,
    "allowedModelProfileIds"
  >;
}): SymphonyCapabilityModelProfileId[] {
  if (input.module.executionKind !== "agent") {
    throw new TypeError(
      `Intelligent-flow planner cannot map system module ${JSON.stringify(input.module.id)} to capability execution.`
    );
  }

  return input.module.supportedModelProfileIds.filter((profileId) =>
    input.resolvedPolicy.allowedModelProfileIds.includes(profileId)
  );
}

function buildCandidateReason(input: {
  selectedAdmissibleCandidateSummary: string;
  candidateWorkEpoch: number;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  moduleId: SymphonyCapabilityId;
}): string {
  if (
    input.moduleId === "implement.spec" &&
    input.candidateWorkEpoch !== input.projection.workEpoch
  ) {
    return `implement.spec must produce the initial change set for work epoch ${input.candidateWorkEpoch}.`;
  }

  return input.selectedAdmissibleCandidateSummary;
}

function toCapabilityPhase(
  phase: CapabilityBackedModuleDefinition["phase"]
): WorkflowCapabilityPhase {
  switch (phase) {
    case "implementing":
      return "implementing";
    case "verifying":
      return "verifying";
    case "merging":
    case "reporting":
      throw new TypeError(
        `Intelligent-flow planner cannot map ${JSON.stringify(phase)} into a capability execution phase.`
      );
  }
}

function isCapabilityBackedModuleId(
  moduleId: SymphonyIntelligentFlowModuleId
): moduleId is SymphonyCapabilityId {
  return capabilityBackedModuleIds.has(moduleId as SymphonyCapabilityId);
}

function buildDeterministicRationale(input: {
  moduleId: SymphonyCapabilityId;
  rank: number;
  reason: string;
  modelProfileId: SymphonyCapabilityModelProfileId;
}): string {
  return `Selected intelligent-flow module ${JSON.stringify(
    input.moduleId
  )} at admissibility rank ${input.rank} with model profile ${JSON.stringify(
    input.modelProfileId
  )}. ${input.reason}`;
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`Intelligent-flow deterministic planner ${field} is required.`);
  }

  return normalized;
}
