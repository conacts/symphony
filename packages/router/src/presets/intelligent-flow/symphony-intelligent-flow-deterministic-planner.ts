import { projectWorkflowCapabilityProjection } from "../../capability/capability-projection.js";
import { evaluateWorkflowCompletionGate } from "../../capability/completion-gate.js";
import { resolveWorkflowRoutingPolicy } from "../../capability/routing-policy-resolver.js";
import {
  buildSymphonyIntelligentFlowAdmissibilitySnapshot,
  type SymphonyIntelligentFlowCapabilityProjection,
  type SymphonyIntelligentFlowResolvedRoutingPolicy
} from "./symphony-intelligent-flow-admissibility.js";
import {
  type SymphonyCapabilityPresetPolicyId,
  createSymphonyCapabilityPreset
} from "../../capability/symphony-capability-preset.js";
import type {
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId,
  SymphonyWorkflowTicketExecutionContract
} from "../../capability/symphony-capability-contract.js";
import {
  createSymphonyIntelligentFlowRouterDecision,
  type SymphonyIntelligentFlowRouterDecision
} from "./symphony-intelligent-flow-contract.js";
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
} from "../../types/index.js";

const capabilityBackedModuleIds = new Set<SymphonyCapabilityId>([
  "implement.spec",
  "critic.code_review",
  "critic.adversarial_tests",
  "critic.browser_test"
]);

type CapabilityBackedModuleDefinition = SymphonyIntelligentFlowModuleDefinition & {
  id: SymphonyCapabilityId;
};

type SymphonyIntelligentFlowDeterministicPlannerInput = {
  contract: SymphonyWorkflowTicketExecutionContract;
  history: WorkflowHistory;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  decisionId: string;
  decidedAt: string;
  policyId?: SymphonyCapabilityPresetPolicyId;
  moduleRegistry?: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
  createCapabilityPreset?: typeof createSymphonyCapabilityPreset;
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

export type SymphonyIntelligentFlowCapabilitySelectionContext = {
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
  candidateSet: SymphonyIntelligentFlowAdmissibilitySnapshot;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
};

export type SymphonyIntelligentFlowPlanningSelectionContext =
  SymphonyIntelligentFlowCapabilitySelectionContext & {
    contract: SymphonyWorkflowTicketExecutionContract;
    policyId: SymphonyCapabilityPresetPolicyId;
  };

export type SymphonyIntelligentFlowPlanningPreparationResult =
  | {
      kind: "terminal";
      plan: WorkflowCapabilityPlan<
        SymphonyCapabilityId,
        SymphonyCapabilityEvidenceId,
        SymphonyCapabilityModelProfileId
      >;
      routerDecision: null;
    }
  | {
      kind: "selection";
      context: SymphonyIntelligentFlowPlanningSelectionContext;
    };

export type SymphonyIntelligentFlowDeterministicPlanningResult = {
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  routerDecision: SymphonyIntelligentFlowRouterDecision | null;
};

export function resolveSymphonyIntelligentFlowDeterministicPlan(
  input: SymphonyIntelligentFlowDeterministicPlannerInput
): SymphonyIntelligentFlowDeterministicPlanningResult {
  const prepared = prepareSymphonyIntelligentFlowPlanning(input);
  if (prepared.kind === "terminal") {
    return {
      plan: prepared.plan,
      routerDecision: prepared.routerDecision
    };
  }

  const selection = selectSymphonyIntelligentFlowCapabilityRoute({
    context: prepared.context,
    decisionId: input.decisionId,
    decidedAt: input.decidedAt
  });

  return {
    plan: {
      kind: "execute",
      candidate: selection.candidate,
      decision: selection.decision
    },
    routerDecision:
      createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection({
        context: prepared.context,
        selection,
        selectionMode: "deterministic",
        selectionSummary: selection.candidate.reason,
        selectionRationale: selection.decision.rationale,
        confidence: null,
        fallbackReason: null
      })
  };
}

export function prepareSymphonyIntelligentFlowPlanning(
  input: Omit<SymphonyIntelligentFlowDeterministicPlannerInput, "decisionId" | "decidedAt">
): SymphonyIntelligentFlowPlanningPreparationResult {
  const normalizedLifecycleState = normalizePlanningLifecycleState(input.lifecycleState);
  const moduleRegistry =
    input.moduleRegistry ?? createSymphonyIntelligentFlowDefaultModuleRegistry();
  const createCapabilityPreset =
    input.createCapabilityPreset ?? createSymphonyCapabilityPreset;
  const preset = createCapabilityPreset({
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
  const effectiveProjection = createPlanningProjection({
    lifecycleState: normalizedLifecycleState,
    projection
  });

  if (effectiveProjection.pendingClarification !== null) {
    return {
      kind: "terminal",
      plan: {
        kind: "awaiting_input",
        clarification: effectiveProjection.pendingClarification
      },
      routerDecision: null
    };
  }

  if (effectiveProjection.blockedReason !== null) {
    return {
      kind: "terminal",
      plan: {
        kind: "blocked",
        reason: effectiveProjection.blockedReason
      },
      routerDecision: null
    };
  }

  const completionGate = evaluateWorkflowCompletionGate({
    resolvedPolicy,
    projection: effectiveProjection
  });
  if (completionGate.result === "ready_for_completion") {
    return {
      kind: "terminal",
      plan: {
        kind: completionGate.result,
        evaluation: completionGate
      },
      routerDecision: null
    };
  }

  return {
    kind: "selection",
    context: {
      contract: input.contract,
      policyId: input.policyId ?? "default",
      lifecycleState: normalizedLifecycleState,
      moduleRegistry,
      candidateSet: buildSymphonyIntelligentFlowAdmissibilitySnapshot({
        lifecycleState: normalizedLifecycleState,
        resolvedPolicy,
        projection: effectiveProjection,
        moduleRegistry
      }),
      projection: effectiveProjection,
      resolvedPolicy
    }
  };
}

export function planSymphonyIntelligentFlowDeterministically(
  input: SymphonyIntelligentFlowDeterministicPlannerInput
): WorkflowCapabilityPlan<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
  return resolveSymphonyIntelligentFlowDeterministicPlan(input).plan;
}

export function selectSymphonyIntelligentFlowDeterministicCapabilityRoute(input: {
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  decisionId: string;
  decidedAt: string;
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
}): SymphonyIntelligentFlowDeterministicCapabilityRouteSelection {
  return selectSymphonyIntelligentFlowCapabilityRoute({
    context: {
      lifecycleState: input.lifecycleState,
      moduleRegistry: input.moduleRegistry,
      candidateSet: buildSymphonyIntelligentFlowAdmissibilitySnapshot({
        lifecycleState: input.lifecycleState,
        resolvedPolicy: input.resolvedPolicy,
        projection: input.projection,
        moduleRegistry: input.moduleRegistry
      }),
      projection: input.projection,
      resolvedPolicy: input.resolvedPolicy
    },
    decisionId: input.decisionId,
    decidedAt: input.decidedAt
  });
}

export function selectSymphonyIntelligentFlowCapabilityRoute(input: {
  context: SymphonyIntelligentFlowCapabilitySelectionContext;
  decisionId: string;
  decidedAt: string;
  selectedModuleId?: SymphonyCapabilityId;
}): SymphonyIntelligentFlowDeterministicCapabilityRouteSelection {
  const selectedAdmissibleCandidate = resolveSelectedAdmissibleCapabilityCandidate({
    candidateSet: input.context.candidateSet,
    projection: input.context.projection,
    selectedModuleId: input.selectedModuleId ?? null
  });
  const module = requireCapabilityBackedModuleDefinition({
    moduleRegistry: input.context.moduleRegistry,
    moduleId: selectedAdmissibleCandidate.moduleId
  });
  const allowedModelProfileIds = resolveAllowedModelProfileIds({
    module,
    resolvedPolicy: input.context.resolvedPolicy
  });
  if (allowedModelProfileIds.length === 0) {
    throw new TypeError(
      `Intelligent-flow planner selected ${JSON.stringify(module.id)} without an admissible model profile.`
    );
  }

  const workEpoch = resolveSelectedWorkEpoch({
    projection: input.context.projection,
    moduleId: module.id
  });
  const candidate: WorkflowCapabilityCandidate<
    SymphonyCapabilityId,
    SymphonyCapabilityModelProfileId
  > = {
    capabilityId: module.id,
    phase: toCapabilityPhase(module.phase),
    workEpoch,
    priority: Math.max(
      1,
      input.context.candidateSet.admissible.length - selectedAdmissibleCandidate.rank
    ),
    required: selectedAdmissibleCandidate.reasonCode !== "preferred_by_contract",
    preferred: selectedAdmissibleCandidate.reasonCode === "preferred_by_contract",
    allowedModelProfileIds,
    reason: buildCandidateReason({
      selectedAdmissibleCandidateSummary: selectedAdmissibleCandidate.summary,
      candidateWorkEpoch: workEpoch,
      projection: input.context.projection,
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
    candidateSet: input.context.candidateSet,
    candidate,
    decision,
    module,
    projection: input.context.projection,
    resolvedPolicy: input.context.resolvedPolicy
  };
}

export function createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection(
  input: {
    context: SymphonyIntelligentFlowPlanningSelectionContext;
    selection: SymphonyIntelligentFlowDeterministicCapabilityRouteSelection;
    selectionMode: SymphonyIntelligentFlowRouterDecision["selectionMode"];
    selectionSummary: string;
    selectionRationale: string;
    confidence: number | null;
    fallbackReason: string | null;
  }
): SymphonyIntelligentFlowRouterDecision {
  return createSymphonyIntelligentFlowRouterDecision({
    decisionId: input.selection.decision.decisionId,
    workflowId: input.context.contract.workflowId,
    policyId: input.context.policyId,
    recordedAt: input.selection.decision.decidedAt,
    candidateSet: input.selection.candidateSet,
    selectedModuleId: input.selection.module.id,
    selectionMode: input.selectionMode,
    selectionSummary: requireNonEmptyText(
      input.selectionSummary,
      "selectionSummary"
    ),
    selectionRationale: requireNonEmptyText(
      input.selectionRationale,
      "selectionRationale"
    ),
    confidence: input.confidence,
    inputProjectionFingerprint: buildProjectionFingerprint({
      lifecycleState: input.context.lifecycleState,
      projection: input.selection.projection,
      resolvedPolicy: input.selection.resolvedPolicy
    }),
    fallbackReason:
      input.fallbackReason === null
        ? null
        : requireNonEmptyText(input.fallbackReason, "fallbackReason")
  });
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
    clarificationPolicy: contract.routingDirectives.clarificationPolicy,
    reviewStrictness: contract.routingDirectives.reviewStrictness,
    maxRetryCount: contract.routingDirectives.maxRetryCount
  };
}

function normalizePlanningLifecycleState(
  lifecycleState: SymphonyIntelligentFlowLifecycleState
): SymphonyIntelligentFlowLifecycleState {
  // The shell selects executable work while still in `claimed`, before the external
  // run emits `run_started`. Treat that pre-run state as execution-ready.
  return lifecycleState === "claimed" ? "active" : lifecycleState;
}

function createPlanningProjection(input: {
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  projection: SymphonyIntelligentFlowCapabilityProjection;
}): SymphonyIntelligentFlowCapabilityProjection {
  if (!shouldIgnoreRouterClarificationDuringPlanning(input)) {
    return input.projection;
  }

  return {
    ...input.projection,
    pendingClarification: null,
    phase: derivePlanningProjectionPhase({
      blockedReason: input.projection.blockedReason,
      latestAttempts: input.projection.latestAttempts
    })
  };
}

function shouldIgnoreRouterClarificationDuringPlanning(input: {
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  projection: SymphonyIntelligentFlowCapabilityProjection;
}): boolean {
  if (input.lifecycleState !== "active") {
    return false;
  }

  return input.projection.pendingClarification?.raisedByCapabilityId === null;
}

function derivePlanningProjectionPhase(input: {
  blockedReason: string | null;
  latestAttempts: SymphonyIntelligentFlowCapabilityProjection["latestAttempts"];
}): WorkflowCapabilityPhase {
  if (input.blockedReason !== null) {
    return "blocked";
  }

  const latestAttempt = input.latestAttempts[0] ?? null;
  if (!latestAttempt) {
    return "queued";
  }

  if (latestAttempt.status === "changes_requested") {
    return "implementing";
  }

  if (latestAttempt.capabilityId === "implement.spec") {
    switch (latestAttempt.status) {
      case "completed":
        return "verifying";
      case "started":
      case "planned":
      case "clarification_requested":
      case "failed":
        return "implementing";
      case "blocked":
        return "blocked";
      default:
        return "implementing";
    }
  }

  switch (latestAttempt.status) {
    case "completed":
    case "started":
    case "planned":
    case "failed":
    case "clarification_requested":
      return "verifying";
    case "blocked":
      return "blocked";
  }
}

function resolveSelectedAdmissibleCapabilityCandidate(input: {
  candidateSet: SymphonyIntelligentFlowAdmissibilitySnapshot;
  projection: Pick<SymphonyIntelligentFlowCapabilityProjection, "workflowId">;
  selectedModuleId: SymphonyCapabilityId | null;
}) {
  if (input.selectedModuleId !== null) {
    const selected = input.candidateSet.admissible.find(
      (candidate) => candidate.moduleId === input.selectedModuleId
    );
    if (!selected) {
      throw new TypeError(
        `Intelligent-flow planner could not select module ${JSON.stringify(input.selectedModuleId)} because it is not admissible for workflow ${JSON.stringify(input.projection.workflowId)}.`
      );
    }

    if (!isCapabilityBackedModuleId(selected.moduleId)) {
      throw new TypeError(
        `Intelligent-flow planner cannot execute non-capability module ${JSON.stringify(selected.moduleId)} for workflow ${JSON.stringify(input.projection.workflowId)}.`
      );
    }

    return selected;
  }

  const selected = input.candidateSet.admissible.find((candidate) =>
    isCapabilityBackedModuleId(candidate.moduleId)
  );
  if (!selected) {
    throw new TypeError(
      `Intelligent-flow planner could not produce an executable capability module for workflow ${JSON.stringify(
        input.projection.workflowId
      )}.`
    );
  }

  return selected;
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

  return input.moduleRegistry.getModuleDefinition(
    input.moduleId
  ) as CapabilityBackedModuleDefinition;
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

function buildProjectionFingerprint(input: {
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
}): string {
  return [
    `workflow=${JSON.stringify(input.projection.workflowId)}`,
    `lifecycle=${JSON.stringify(input.lifecycleState)}`,
    `phase=${JSON.stringify(input.projection.phase)}`,
    `workEpoch=${input.projection.workEpoch}`,
    `pendingClarification=${JSON.stringify(
      input.projection.pendingClarification
        ? {
            requestId: input.projection.pendingClarification.requestId,
            raisedByCapabilityId:
              input.projection.pendingClarification.raisedByCapabilityId,
            workEpoch: input.projection.pendingClarification.workEpoch
          }
        : null
    )}`,
    `blockedReason=${JSON.stringify(input.projection.blockedReason)}`,
    `completion=${JSON.stringify(input.projection.completionReadiness)}`,
    `latestAttempts=${JSON.stringify(
      input.projection.latestAttempts.map((attempt) => ({
        capabilityId: attempt.capabilityId,
        modelProfileId: attempt.modelProfileId,
        workEpoch: attempt.workEpoch,
        attempt: attempt.attempt,
        status: attempt.status,
        retryable: attempt.retryable,
        reasonCode: attempt.reasonCode,
        failureKind: attempt.failureKind,
        evidenceProduced: attempt.evidenceProduced.map(
          (evidence) => evidence.evidenceId
        )
      }))
    )}`,
    `capabilityStatuses=${JSON.stringify(
      input.projection.capabilityStatusesByEpoch.map((epoch) => ({
        workEpoch: epoch.workEpoch,
        stale: epoch.stale,
        attempts: epoch.attempts.map((attempt) => ({
          capabilityId: attempt.capabilityId,
          modelProfileId: attempt.modelProfileId,
          workEpoch: attempt.workEpoch,
          attempt: attempt.attempt,
          status: attempt.status
        }))
      }))
    )}`,
    `evidenceByEpoch=${JSON.stringify(
      input.projection.evidenceByEpoch.map((epoch) => ({
        workEpoch: epoch.workEpoch,
        stale: epoch.stale,
        evidenceIds: epoch.evidence.map((evidence) => evidence.evidenceId)
      }))
    )}`,
    `policy=${JSON.stringify({
      requiredCapabilityIds: input.resolvedPolicy.requiredCapabilityIds,
      preferredCapabilityIds: input.resolvedPolicy.preferredCapabilityIds,
      forbiddenCapabilityIds: input.resolvedPolicy.forbiddenCapabilityIds,
      requiredEvidenceIds: input.resolvedPolicy.requiredEvidenceIds,
      allowedModelProfileIds: input.resolvedPolicy.allowedModelProfileIds,
      clarificationMode: input.resolvedPolicy.clarificationPolicy.mode,
      reviewStrictness: input.resolvedPolicy.reviewStrictness,
      maxRetryCount: input.resolvedPolicy.maxRetryCount
    })}`
  ].join("|");
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`Intelligent-flow deterministic planner ${field} is required.`);
  }

  return normalized;
}
