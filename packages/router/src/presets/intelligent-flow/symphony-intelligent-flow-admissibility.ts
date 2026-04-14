import type { SymphonyIntelligentFlowModuleRegistry } from "./symphony-intelligent-flow-module-registry.js";
import {
  readSymphonyIntelligentFlowAdmissibilitySnapshot,
  type SymphonyIntelligentFlowAdmissibilitySnapshot,
  type SymphonyIntelligentFlowAdmissibleCandidate,
  type SymphonyIntelligentFlowAdmissibleReasonCode,
  type SymphonyIntelligentFlowEvidenceId,
  type SymphonyIntelligentFlowLifecycleState,
  type SymphonyIntelligentFlowModuleDefinition,
  type SymphonyIntelligentFlowModuleId,
  type SymphonyIntelligentFlowRejectedCandidate,
  type SymphonyIntelligentFlowRejectedReasonCode
} from "./symphony-intelligent-flow-contract.js";
import type {
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId
} from "../../capability/symphony-capability-contract.js";
import type {
  WorkflowCapabilityProjection,
  WorkflowResolvedRoutingPolicy
} from "../../types/index.js";

const IMPLEMENT_SPEC_MODULE_ID = "implement.spec";
const CODE_REVIEW_MODULE_ID = "critic.code_review";
const ADVERSARIAL_TESTS_MODULE_ID = "critic.adversarial_tests";
const BROWSER_TEST_MODULE_ID = "critic.browser_test";
const BLOCKED_REPORT_MODULE_ID = "blocked.report";

const capabilityBackedModuleIds = new Set<SymphonyIntelligentFlowModuleId>([
  IMPLEMENT_SPEC_MODULE_ID,
  CODE_REVIEW_MODULE_ID,
  ADVERSARIAL_TESTS_MODULE_ID,
  BROWSER_TEST_MODULE_ID
]);

const activeAttemptStatuses = new Set<SymphonyIntelligentFlowModuleAttemptStatus>([
  "planned",
  "started"
]);

const retryableAttemptStatuses = new Set<SymphonyIntelligentFlowModuleAttemptStatus>([
  "failed",
  "blocked",
  "paused"
]);

const admissibleReasonPriority: Record<
  SymphonyIntelligentFlowAdmissibleReasonCode,
  number
> = {
  recovery_retry: 0,
  required_by_contract: 10,
  verification_follow_up: 20,
  preferred_by_contract: 30,
  completion_follow_up: 40
};

const modulePriority: Record<SymphonyIntelligentFlowModuleId, number> = {
  [BLOCKED_REPORT_MODULE_ID]: 0,
  [IMPLEMENT_SPEC_MODULE_ID]: 10,
  [CODE_REVIEW_MODULE_ID]: 20,
  [ADVERSARIAL_TESTS_MODULE_ID]: 30,
  [BROWSER_TEST_MODULE_ID]: 40
};

export type SymphonyIntelligentFlowResolvedRoutingPolicy =
  WorkflowResolvedRoutingPolicy<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;

export type SymphonyIntelligentFlowCapabilityProjection =
  WorkflowCapabilityProjection<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;

export type SymphonyIntelligentFlowModuleAttemptStatus =
  | "planned"
  | "started"
  | "clarification_requested"
  | "completed"
  | "changes_requested"
  | "failed"
  | "blocked"
  | "paused";

export type SymphonyIntelligentFlowModuleAttempt = {
  moduleId: SymphonyIntelligentFlowModuleId;
  workEpoch: number;
  attempt: number;
  status: SymphonyIntelligentFlowModuleAttemptStatus;
  retryable: boolean | null;
};

export function buildSymphonyIntelligentFlowAdmissibilitySnapshot(input: {
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
  moduleAttempts?: ReadonlyArray<SymphonyIntelligentFlowModuleAttempt> | null;
}): SymphonyIntelligentFlowAdmissibilitySnapshot {
  const currentEvidenceIds = resolveCurrentEvidenceIds(input.projection);
  const missingRequiredEvidenceIds = input.resolvedPolicy.requiredEvidenceIds.filter(
    (evidenceId) => !currentEvidenceIds.has(evidenceId)
  );
  const latestAttemptsByModuleId = createLatestAttemptMap(
    input.moduleAttempts ?? deriveCapabilityModuleAttempts(input.projection)
  );
  const admissible: SymphonyIntelligentFlowAdmissibleCandidate[] = [];
  const rejected: SymphonyIntelligentFlowRejectedCandidate[] = [];

  for (const definition of input.moduleRegistry.listModuleDefinitions()) {
    const result = evaluateModuleAdmissibility({
      definition,
      lifecycleState: input.lifecycleState,
      resolvedPolicy: input.resolvedPolicy,
      projection: input.projection,
      currentEvidenceIds,
      missingRequiredEvidenceIds,
      latestAttemptsByModuleId,
      moduleRegistry: input.moduleRegistry
    });

    if (result.kind === "admissible") {
      admissible.push({
        moduleId: definition.id,
        rank: -1,
        reasonCode: result.reasonCode,
        summary: result.summary
      });
      continue;
    }

    rejected.push({
      moduleId: definition.id,
      reasonCode: result.reasonCode,
      summary: result.summary
    });
  }

  admissible.sort((left, right) => {
    const reasonDelta =
      admissibleReasonPriority[left.reasonCode] -
      admissibleReasonPriority[right.reasonCode];
    if (reasonDelta !== 0) {
      return reasonDelta;
    }

    return modulePriority[left.moduleId] - modulePriority[right.moduleId];
  });

  const ranked = admissible.map((candidate, index) => ({
    ...candidate,
    rank: index
  }));

  return readSymphonyIntelligentFlowAdmissibilitySnapshot({
    admissible: ranked,
    rejected
  });
}

type ModuleAdmissibilityEvaluation =
  | {
      kind: "admissible";
      reasonCode: SymphonyIntelligentFlowAdmissibleReasonCode;
      summary: string;
    }
  | {
      kind: "rejected";
      reasonCode: SymphonyIntelligentFlowRejectedReasonCode;
      summary: string;
    };

function evaluateModuleAdmissibility(input: {
  definition: SymphonyIntelligentFlowModuleDefinition;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  currentEvidenceIds: Set<SymphonyIntelligentFlowEvidenceId>;
  missingRequiredEvidenceIds: SymphonyCapabilityEvidenceId[];
  latestAttemptsByModuleId: Map<
    SymphonyIntelligentFlowModuleId,
    SymphonyIntelligentFlowModuleAttempt
  >;
  moduleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
}): ModuleAdmissibilityEvaluation {
  const latestAttempt = input.latestAttemptsByModuleId.get(input.definition.id) ?? null;

  if (!input.definition.enabledByDefault) {
    return reject(
      "disabled_by_default",
      `${input.definition.id} is disabled by default.`
    );
  }

  if (
    isCapabilityBackedModuleId(input.definition.id) &&
    input.resolvedPolicy.forbiddenCapabilityIds.includes(input.definition.id)
  ) {
    return reject(
      "forbidden_by_policy",
      `${input.definition.id} is forbidden by the resolved routing policy.`
    );
  }

  if (
    input.projection.pendingClarification !== null &&
    input.definition.requiresNoPendingClarification
  ) {
    return reject(
      "pending_clarification",
      `${input.definition.id} is blocked by pending clarification request ${JSON.stringify(
        input.projection.pendingClarification.requestId
      )}.`
    );
  }

  if (!input.definition.allowedLifecycleStates.includes(input.lifecycleState)) {
    return reject(
      "blocked_by_lifecycle",
      `${input.definition.id} cannot run while the lifecycle shell is ${JSON.stringify(input.lifecycleState)}.`
    );
  }

  if (
    input.projection.blockedReason !== null &&
    input.definition.id !== BLOCKED_REPORT_MODULE_ID &&
    !input.definition.canRunWhenBlocked
  ) {
    return reject(
      "blocked_by_lifecycle",
      `${input.definition.id} cannot run while the workflow is blocked.`
    );
  }

  if (
    !input.moduleRegistry.isModuleRuntimeSupported({
      moduleId: input.definition.id
    })
  ) {
    return reject(
      "unsupported_runtime",
      `${input.definition.id} requires runtime support that is not currently available.`
    );
  }

  if (
    input.definition.executionKind === "agent" &&
    resolveAllowedModelProfiles({
      definition: input.definition,
      resolvedPolicy: input.resolvedPolicy
    }).length === 0
  ) {
    return reject(
      "unsupported_runtime",
      `${input.definition.id} has no allowed model profiles under the resolved routing policy.`
    );
  }

  if (latestAttempt && isModuleAttemptActive(latestAttempt)) {
    return reject(
      "already_satisfied",
      `${input.definition.id} already has an active attempt in progress.`
    );
  }

  if (
    latestAttempt &&
    isRetryBudgetExhausted({
      latestAttempt,
      currentWorkEpoch: input.projection.workEpoch,
      maxRetryCount: input.resolvedPolicy.maxRetryCount
    })
  ) {
    return reject(
      "retry_budget_exhausted",
      latestAttempt.retryable === false
        ? `${input.definition.id} cannot retry because the latest attempt is not retryable.`
        : `${input.definition.id} has exhausted the retry budget for work epoch ${input.projection.workEpoch}.`
    );
  }

  const missingModulePrerequisites = input.definition.requiresEvidenceIds.filter(
    (evidenceId) => !input.currentEvidenceIds.has(evidenceId)
  );
  if (missingModulePrerequisites.length > 0) {
    return reject(
      "missing_required_evidence",
      `${input.definition.id} requires evidence ${missingModulePrerequisites
        .map((evidenceId) => JSON.stringify(evidenceId))
        .join(", ")} before it can run.`
    );
  }

  switch (input.definition.id) {
    case IMPLEMENT_SPEC_MODULE_ID:
      return evaluateImplementationModule({
        latestAttempt,
        latestAttemptsByModuleId: input.latestAttemptsByModuleId,
        projection: input.projection,
        currentEvidenceIds: input.currentEvidenceIds
      });
    case CODE_REVIEW_MODULE_ID:
    case ADVERSARIAL_TESTS_MODULE_ID:
    case BROWSER_TEST_MODULE_ID:
      return evaluateVerifierModule({
        definition: input.definition,
        latestAttempt,
        resolvedPolicy: input.resolvedPolicy,
        missingRequiredEvidenceIds: input.missingRequiredEvidenceIds,
        projection: input.projection,
        currentEvidenceIds: input.currentEvidenceIds
      });
    case BLOCKED_REPORT_MODULE_ID:
      return evaluateBlockedReportModule({
        latestAttempt,
        lifecycleState: input.lifecycleState,
        projection: input.projection
      });
  }
}

function evaluateImplementationModule(input: {
  latestAttempt: SymphonyIntelligentFlowModuleAttempt | null;
  latestAttemptsByModuleId: Map<
    SymphonyIntelligentFlowModuleId,
    SymphonyIntelligentFlowModuleAttempt
  >;
  projection: SymphonyIntelligentFlowCapabilityProjection;
  currentEvidenceIds: Set<SymphonyIntelligentFlowEvidenceId>;
}): ModuleAdmissibilityEvaluation {
  const changesRequestedAttempt = [...input.latestAttemptsByModuleId.values()].find(
    (attempt) =>
      attempt.moduleId !== IMPLEMENT_SPEC_MODULE_ID &&
      attempt.workEpoch === input.projection.workEpoch &&
      attempt.status === "changes_requested"
  );

  if (isRetryableLatestAttempt(input.latestAttempt, input.projection.workEpoch)) {
    return admit(
      "recovery_retry",
      `${IMPLEMENT_SPEC_MODULE_ID} must retry after the latest attempt did not complete successfully.`
    );
  }

  if (changesRequestedAttempt) {
    return admit(
      "verification_follow_up",
      `${IMPLEMENT_SPEC_MODULE_ID} must address changes requested by ${changesRequestedAttempt.moduleId}.`
    );
  }

  if (!input.currentEvidenceIds.has("change_set")) {
    return admit(
      "required_by_contract",
      `${IMPLEMENT_SPEC_MODULE_ID} must produce the initial change set for work epoch ${input.projection.workEpoch}.`
    );
  }

  return reject(
    "already_satisfied",
    `${IMPLEMENT_SPEC_MODULE_ID} already produced the current change set.`
  );
}

function evaluateVerifierModule(input: {
  definition: SymphonyIntelligentFlowModuleDefinition;
  latestAttempt: SymphonyIntelligentFlowModuleAttempt | null;
  resolvedPolicy: SymphonyIntelligentFlowResolvedRoutingPolicy;
  missingRequiredEvidenceIds: SymphonyCapabilityEvidenceId[];
  projection: SymphonyIntelligentFlowCapabilityProjection;
  currentEvidenceIds: Set<SymphonyIntelligentFlowEvidenceId>;
}): ModuleAdmissibilityEvaluation {
  const producedEvidenceIds = new Set<SymphonyIntelligentFlowEvidenceId>(
    input.definition.producesEvidenceIds
  );
  const missingEvidenceProduced = input.missingRequiredEvidenceIds.filter((evidenceId) =>
    producedEvidenceIds.has(evidenceId)
  );
  const requiredByPolicy =
    input.resolvedPolicy.requiredCapabilityIds.includes(
      input.definition.id as SymphonyCapabilityId
    ) ||
    (input.definition.id === ADVERSARIAL_TESTS_MODULE_ID &&
      input.resolvedPolicy.reviewStrictness === "adversarial");
  const preferredByPolicy = input.resolvedPolicy.preferredCapabilityIds.includes(
    input.definition.id as SymphonyCapabilityId
  );

  if (isRetryableLatestAttempt(input.latestAttempt, input.projection.workEpoch)) {
    return admit(
      "recovery_retry",
      `${input.definition.id} must retry after the latest attempt did not complete successfully.`
    );
  }

  if (
    input.latestAttempt?.workEpoch === input.projection.workEpoch &&
    input.latestAttempt.status === "completed"
  ) {
    return reject(
      "already_satisfied",
      `${input.definition.id} already completed for work epoch ${input.projection.workEpoch}.`
    );
  }

  if (missingEvidenceProduced.length > 0) {
    return admit(
      "required_by_contract",
      `${input.definition.id} must produce missing evidence ${missingEvidenceProduced
        .map((evidenceId) => JSON.stringify(evidenceId))
        .join(", ")}.`
    );
  }

  if (requiredByPolicy) {
    return admit(
      input.definition.id === CODE_REVIEW_MODULE_ID
        ? "verification_follow_up"
        : "required_by_contract",
      input.definition.id === CODE_REVIEW_MODULE_ID
        ? `${input.definition.id} is the next verification step after implementation.`
        : `${input.definition.id} is required by the resolved routing policy.`
    );
  }

  if (preferredByPolicy) {
    return admit(
      "preferred_by_contract",
      `${input.definition.id} is preferred by the resolved routing policy.`
    );
  }

  if (input.currentEvidenceIds.has("change_set")) {
    return reject(
      "already_satisfied",
      `${input.definition.id} is not required by the current policy or evidence state.`
    );
  }

  return reject(
    "missing_required_evidence",
    `${input.definition.id} requires implementation evidence before it can run.`
  );
}

function evaluateBlockedReportModule(input: {
  latestAttempt: SymphonyIntelligentFlowModuleAttempt | null;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  projection: SymphonyIntelligentFlowCapabilityProjection;
}): ModuleAdmissibilityEvaluation {
  if (input.lifecycleState === "blocked") {
    return reject(
      "blocked_by_lifecycle",
      `${BLOCKED_REPORT_MODULE_ID} is not emitted after the lifecycle shell has already entered blocked.`
    );
  }

  if (isRetryableLatestAttempt(input.latestAttempt, input.projection.workEpoch)) {
    return admit(
      "recovery_retry",
      `${BLOCKED_REPORT_MODULE_ID} must retry after the latest reporting attempt did not complete successfully.`
    );
  }

  if (input.projection.blockedReason === null) {
    return reject(
      "already_satisfied",
      `${BLOCKED_REPORT_MODULE_ID} is only needed when a blocked reason is present.`
    );
  }

  if (
    input.latestAttempt?.workEpoch === input.projection.workEpoch &&
    input.latestAttempt.status === "completed"
  ) {
    return reject(
      "already_satisfied",
      `${BLOCKED_REPORT_MODULE_ID} already recorded the blocked condition for this work epoch.`
    );
  }

  return admit(
    "completion_follow_up",
    `${BLOCKED_REPORT_MODULE_ID} should record the blocked outcome ${JSON.stringify(input.projection.blockedReason)}.`
  );
}

function resolveAllowedModelProfiles(input: {
  definition: Pick<
    SymphonyIntelligentFlowModuleDefinition,
    "supportedModelProfileIds" | "executionKind"
  >;
  resolvedPolicy: Pick<
    SymphonyIntelligentFlowResolvedRoutingPolicy,
    "allowedModelProfileIds"
  >;
}): SymphonyCapabilityModelProfileId[] {
  if (input.definition.executionKind !== "agent") {
    return [];
  }

  return input.definition.supportedModelProfileIds.filter((profileId) =>
    input.resolvedPolicy.allowedModelProfileIds.includes(profileId)
  );
}

function deriveCapabilityModuleAttempts(
  projection: SymphonyIntelligentFlowCapabilityProjection
): SymphonyIntelligentFlowModuleAttempt[] {
  return projection.latestAttempts
    .filter((attempt): attempt is typeof attempt & {
      capabilityId: SymphonyIntelligentFlowModuleId;
    } => capabilityBackedModuleIds.has(attempt.capabilityId as SymphonyIntelligentFlowModuleId))
    .map((attempt) => ({
      moduleId: attempt.capabilityId as SymphonyIntelligentFlowModuleId,
      workEpoch: attempt.workEpoch,
      attempt: attempt.attempt,
      status: attempt.status,
      retryable: attempt.retryable
    }));
}

function resolveCurrentEvidenceIds(
  projection: SymphonyIntelligentFlowCapabilityProjection
): Set<SymphonyIntelligentFlowEvidenceId> {
  const currentEntries = projection.evidenceByEpoch.filter(
    (entry) => entry.workEpoch === projection.workEpoch
  );
  if (currentEntries.length > 1) {
    throw new TypeError(
      `Intelligent-flow admissibility found multiple evidence entries for work epoch ${projection.workEpoch}.`
    );
  }

  const currentEntry = currentEntries[0] ?? null;
  if (currentEntry?.stale) {
    throw new TypeError(
      `Intelligent-flow admissibility marked current evidence epoch ${projection.workEpoch} as stale.`
    );
  }

  for (const entry of projection.evidenceByEpoch) {
    if (entry.workEpoch < projection.workEpoch && !entry.stale) {
      throw new TypeError(
        `Intelligent-flow admissibility marked stale evidence epoch ${entry.workEpoch} as non-stale.`
      );
    }
  }

  return new Set(
    currentEntry?.evidence.map((record) => record.evidenceId) ?? []
  );
}

function createLatestAttemptMap(
  attempts: ReadonlyArray<SymphonyIntelligentFlowModuleAttempt>
): Map<SymphonyIntelligentFlowModuleId, SymphonyIntelligentFlowModuleAttempt> {
  const latestAttemptsByModuleId = new Map<
    SymphonyIntelligentFlowModuleId,
    SymphonyIntelligentFlowModuleAttempt
  >();

  for (const attempt of attempts) {
    const current = latestAttemptsByModuleId.get(attempt.moduleId);
    if (!current) {
      latestAttemptsByModuleId.set(attempt.moduleId, attempt);
      continue;
    }

    if (attempt.attempt === current.attempt && attempt.workEpoch === current.workEpoch) {
      throw new TypeError(
        `Intelligent-flow admissibility recorded duplicate attempt ${attempt.attempt} for module ${JSON.stringify(attempt.moduleId)} in work epoch ${attempt.workEpoch}.`
      );
    }

    if (
      attempt.workEpoch > current.workEpoch ||
      (attempt.workEpoch === current.workEpoch && attempt.attempt > current.attempt)
    ) {
      latestAttemptsByModuleId.set(attempt.moduleId, attempt);
    }
  }

  return latestAttemptsByModuleId;
}

function isCapabilityBackedModuleId(
  moduleId: SymphonyIntelligentFlowModuleId
): moduleId is Extract<SymphonyIntelligentFlowModuleId, SymphonyCapabilityId> {
  return capabilityBackedModuleIds.has(moduleId);
}

function isModuleAttemptActive(
  attempt: SymphonyIntelligentFlowModuleAttempt
): boolean {
  return activeAttemptStatuses.has(attempt.status);
}

function isRetryableLatestAttempt(
  attempt: SymphonyIntelligentFlowModuleAttempt | null,
  currentWorkEpoch: number
): boolean {
  return (
    attempt !== null &&
    attempt.workEpoch === currentWorkEpoch &&
    retryableAttemptStatuses.has(attempt.status) &&
    attempt.retryable !== false
  );
}

function isRetryBudgetExhausted(input: {
  latestAttempt: SymphonyIntelligentFlowModuleAttempt;
  currentWorkEpoch: number;
  maxRetryCount: number;
}): boolean {
  if (input.latestAttempt.workEpoch !== input.currentWorkEpoch) {
    return false;
  }

  if (!retryableAttemptStatuses.has(input.latestAttempt.status)) {
    return false;
  }

  if (input.latestAttempt.retryable === false) {
    return true;
  }

  const consumedRetries = input.latestAttempt.attempt - 1;
  return consumedRetries >= input.maxRetryCount;
}

function admit(
  reasonCode: SymphonyIntelligentFlowAdmissibleReasonCode,
  summary: string
): ModuleAdmissibilityEvaluation {
  return {
    kind: "admissible",
    reasonCode,
    summary
  };
}

function reject(
  reasonCode: SymphonyIntelligentFlowRejectedReasonCode,
  summary: string
): ModuleAdmissibilityEvaluation {
  return {
    kind: "rejected",
    reasonCode,
    summary
  };
}
