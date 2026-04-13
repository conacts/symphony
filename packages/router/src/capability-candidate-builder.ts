import type {
  WorkflowCapabilityAttempt,
  WorkflowCapabilityCandidate,
  WorkflowCapabilityDefinition,
  WorkflowCapabilityEpochEvidence,
  WorkflowCapabilityEpochStatus,
  WorkflowCapabilityId,
  WorkflowCapabilityProjection,
  WorkflowEvidenceId,
  WorkflowModelProfileId,
  WorkflowResolvedRoutingPolicy
} from "./types/index.js";

const IMPLEMENT_SPEC_CAPABILITY_ID = "implement.spec";
const CODE_REVIEW_CAPABILITY_ID = "critic.code_review";
const ADVERSARIAL_TESTS_CAPABILITY_ID = "critic.adversarial_tests";
const BROWSER_TEST_CAPABILITY_ID = "critic.browser_test";

const capabilityPriorityById: Record<string, number> = {
  [IMPLEMENT_SPEC_CAPABILITY_ID]: 300,
  [CODE_REVIEW_CAPABILITY_ID]: 200,
  [ADVERSARIAL_TESTS_CAPABILITY_ID]: 100,
  [BROWSER_TEST_CAPABILITY_ID]: 0
};

export function buildWorkflowCapabilityCandidates<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(input: {
  capabilityDefinitions: WorkflowCapabilityDefinition<
    CapabilityId,
    EvidenceId,
    ProfileId
  >[];
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  projection: WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId>;
}): WorkflowCapabilityCandidate<CapabilityId, ProfileId>[] {
  if (input.capabilityDefinitions.length === 0) {
    throw new TypeError(
      "Capability candidate building requires at least one capability definition."
    );
  }

  if (
    input.projection.pendingClarification !== null ||
    input.projection.blockedReason !== null ||
    input.projection.phase === "waiting_input" ||
    input.projection.phase === "blocked" ||
    input.projection.phase === "complete"
  ) {
    return [];
  }

  const definitionsById = createCapabilityDefinitionMap(input.capabilityDefinitions);
  const currentCapabilityStatus = getCapabilityStatusForEpoch({
    statuses: input.projection.capabilityStatusesByEpoch,
    workEpoch: input.projection.workEpoch
  });
  const currentEvidenceStatus = getEvidenceStatusForEpoch({
    evidenceByEpoch: input.projection.evidenceByEpoch,
    workEpoch: input.projection.workEpoch
  });
  const latestAttemptsByCapabilityId = createLatestAttemptMap(
    input.projection.latestAttempts
  );
  const latestCurrentEpochAttemptsByCapabilityId = createLatestAttemptMap(
    currentCapabilityStatus?.attempts ?? []
  );
  const missingRequiredEvidenceIds = resolveMissingRequiredEvidenceIds({
    requiredEvidenceIds: input.resolvedPolicy.requiredEvidenceIds,
    currentEvidenceStatus
  });

  switch (input.projection.phase) {
    case "queued":
    case "implementing":
      return buildImplementationCandidates({
        definitionsById,
        resolvedPolicy: input.resolvedPolicy,
        projection: input.projection,
        latestAttemptsByCapabilityId
      });
    case "verifying":
      return buildVerifyingCandidates({
        definitionsById,
        resolvedPolicy: input.resolvedPolicy,
        projection: input.projection,
        latestCurrentEpochAttemptsByCapabilityId,
        missingRequiredEvidenceIds
      });
  }
}

function buildImplementationCandidates<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  definitionsById: Map<
    CapabilityId,
    WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
  >;
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  projection: WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId>;
  latestAttemptsByCapabilityId: Map<
    CapabilityId,
    WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
  >;
}): WorkflowCapabilityCandidate<CapabilityId, ProfileId>[] {
  const capabilityId = IMPLEMENT_SPEC_CAPABILITY_ID as CapabilityId;
  const latestAttempt = input.latestAttemptsByCapabilityId.get(capabilityId) ?? null;
  const workEpoch = resolveImplementationWorkEpoch({
    latestAttempt,
    currentWorkEpoch: input.projection.workEpoch
  });

  if (latestAttempt?.workEpoch === workEpoch && isCapabilityAttemptActive(latestAttempt)) {
    return [];
  }

  const capability = requireAdmissibleCapabilityDefinition({
    definitionsById: input.definitionsById,
    resolvedPolicy: input.resolvedPolicy,
    capabilityId,
    required: true
  });

  return [
    {
      capabilityId,
      phase: capability.definition.phase,
      workEpoch,
      priority: capabilityPriorityById[IMPLEMENT_SPEC_CAPABILITY_ID],
      required: true,
      preferred: input.resolvedPolicy.preferredCapabilityIds.includes(capabilityId),
      allowedModelProfileIds: capability.allowedModelProfileIds,
      reason: buildImplementationReason({
        projection: input.projection,
        latestAttempt
      })
    }
  ];
}

function buildVerifyingCandidates<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  definitionsById: Map<
    CapabilityId,
    WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
  >;
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  projection: WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId>;
  latestCurrentEpochAttemptsByCapabilityId: Map<
    CapabilityId,
    WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
  >;
  missingRequiredEvidenceIds: EvidenceId[];
}): WorkflowCapabilityCandidate<CapabilityId, ProfileId>[] {
  const implementationCapabilityId = IMPLEMENT_SPEC_CAPABILITY_ID as CapabilityId;
  const latestImplementationAttempt =
    input.latestCurrentEpochAttemptsByCapabilityId.get(implementationCapabilityId) ?? null;
  if (latestImplementationAttempt?.status !== "completed") {
    throw new TypeError(
      `Capability candidate building cannot enter verification for work epoch ${input.projection.workEpoch} before ${JSON.stringify(IMPLEMENT_SPEC_CAPABILITY_ID)} completes.`
    );
  }

  const verificationStages: CapabilityId[] = [
    CODE_REVIEW_CAPABILITY_ID as CapabilityId,
    ADVERSARIAL_TESTS_CAPABILITY_ID as CapabilityId,
    BROWSER_TEST_CAPABILITY_ID as CapabilityId
  ];

  for (const capabilityId of verificationStages) {
    const stageRequirement = resolveVerificationStageRequirement({
      definitionsById: input.definitionsById,
      resolvedPolicy: input.resolvedPolicy,
      capabilityId,
      missingRequiredEvidenceIds: input.missingRequiredEvidenceIds
    });
    if (!stageRequirement.required) {
      continue;
    }

    const capability = requireAdmissibleCapabilityDefinition({
      definitionsById: input.definitionsById,
      resolvedPolicy: input.resolvedPolicy,
      capabilityId,
      required: true
    });
    const latestAttempt =
      input.latestCurrentEpochAttemptsByCapabilityId.get(capabilityId) ?? null;

    if (
      latestAttempt?.status === "completed" &&
      !stageRequirement.requiredBecauseMissingEvidence
    ) {
      continue;
    }

    if (latestAttempt && isCapabilityAttemptActive(latestAttempt)) {
      return [];
    }

    return [
      {
        capabilityId,
        phase: capability.definition.phase,
        workEpoch: input.projection.workEpoch,
        priority: capabilityPriorityById[capability.definition.id],
        required: true,
        preferred: input.resolvedPolicy.preferredCapabilityIds.includes(capabilityId),
        allowedModelProfileIds: capability.allowedModelProfileIds,
        reason: buildVerificationReason({
          capabilityId,
          workEpoch: input.projection.workEpoch,
          latestAttempt,
          missingRequiredEvidenceIds: stageRequirement.missingEvidenceIds,
          stageRequirement
        })
      }
    ];
  }

  return [];
}

function createCapabilityDefinitionMap<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  capabilityDefinitions: WorkflowCapabilityDefinition<
    CapabilityId,
    EvidenceId,
    ProfileId
  >[]
): Map<
  CapabilityId,
  WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
> {
  return new Map(
    capabilityDefinitions.map((definition) => [definition.id, definition])
  );
}

function getCapabilityStatusForEpoch<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  statuses: WorkflowCapabilityEpochStatus<CapabilityId, EvidenceId, ProfileId>[];
  workEpoch: number;
}): WorkflowCapabilityEpochStatus<CapabilityId, EvidenceId, ProfileId> | null {
  const matchingStatuses = input.statuses.filter(
    (status) => status.workEpoch === input.workEpoch
  );
  if (matchingStatuses.length > 1) {
    throw new TypeError(
      `Capability candidate building found multiple capability status entries for work epoch ${input.workEpoch}.`
    );
  }

  return matchingStatuses[0] ?? null;
}

function getEvidenceStatusForEpoch<EvidenceId extends WorkflowEvidenceId>(input: {
  evidenceByEpoch: WorkflowCapabilityEpochEvidence<EvidenceId>[];
  workEpoch: number;
}): WorkflowCapabilityEpochEvidence<EvidenceId> | null {
  const matchingEntries = input.evidenceByEpoch.filter(
    (entry) => entry.workEpoch === input.workEpoch
  );
  if (matchingEntries.length > 1) {
    throw new TypeError(
      `Capability candidate building found multiple evidence entries for work epoch ${input.workEpoch}.`
    );
  }

  return matchingEntries[0] ?? null;
}

function resolveMissingRequiredEvidenceIds<EvidenceId extends WorkflowEvidenceId>(input: {
  requiredEvidenceIds: EvidenceId[];
  currentEvidenceStatus: WorkflowCapabilityEpochEvidence<EvidenceId> | null;
}): EvidenceId[] {
  const currentEvidenceIds = new Set(
    input.currentEvidenceStatus?.evidence.map((record) => record.evidenceId) ?? []
  );

  return input.requiredEvidenceIds.filter(
    (evidenceId) => !currentEvidenceIds.has(evidenceId)
  );
}

function createLatestAttemptMap<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  attempts: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>[]
): Map<
  CapabilityId,
  WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
> {
  const latestAttemptsByCapabilityId = new Map<
    CapabilityId,
    WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
  >();

  for (const attempt of attempts) {
    const current = latestAttemptsByCapabilityId.get(attempt.capabilityId);
    if (!current) {
      latestAttemptsByCapabilityId.set(attempt.capabilityId, attempt);
      continue;
    }

    if (attempt.attempt === current.attempt && attempt.workEpoch === current.workEpoch) {
      throw new TypeError(
        `Capability candidate building recorded duplicate attempt ${attempt.attempt} for capability ${JSON.stringify(attempt.capabilityId)} in work epoch ${attempt.workEpoch}.`
      );
    }

    if (
      attempt.workEpoch > current.workEpoch ||
      (attempt.workEpoch === current.workEpoch && attempt.attempt > current.attempt)
    ) {
      latestAttemptsByCapabilityId.set(attempt.capabilityId, attempt);
    }
  }

  return latestAttemptsByCapabilityId;
}

function resolveImplementationWorkEpoch<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  latestAttempt: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId> | null;
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

function resolveVerificationStageRequirement<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  definitionsById: Map<
    CapabilityId,
    WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
  >;
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  capabilityId: CapabilityId;
  missingRequiredEvidenceIds: EvidenceId[];
}): {
  required: boolean;
  requiredBecauseMissingEvidence: boolean;
  missingEvidenceIds: EvidenceId[];
} {
  if (input.capabilityId === (CODE_REVIEW_CAPABILITY_ID as CapabilityId)) {
    return {
      required: true,
      requiredBecauseMissingEvidence: false,
      missingEvidenceIds: []
    };
  }

  const definition = input.definitionsById.get(input.capabilityId);
  if (!definition) {
    throw new TypeError(
      `Capability candidate building cannot resolve unregistered verification capability ${JSON.stringify(input.capabilityId)}.`
    );
  }

  const missingEvidenceIds = input.missingRequiredEvidenceIds.filter((evidenceId) =>
    definition.producesEvidenceIds.includes(evidenceId)
  );
  const requiredBecausePolicy =
    input.resolvedPolicy.requiredCapabilityIds.includes(input.capabilityId) ||
    (input.capabilityId === (ADVERSARIAL_TESTS_CAPABILITY_ID as CapabilityId) &&
      input.resolvedPolicy.reviewStrictness === "adversarial");

  return {
    required: requiredBecausePolicy || missingEvidenceIds.length > 0,
    requiredBecauseMissingEvidence: missingEvidenceIds.length > 0,
    missingEvidenceIds
  };
}

function requireAdmissibleCapabilityDefinition<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  definitionsById: Map<
    CapabilityId,
    WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
  >;
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  capabilityId: CapabilityId;
  required: boolean;
}): {
  definition: WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>;
  allowedModelProfileIds: ProfileId[];
} {
  const definition = input.definitionsById.get(input.capabilityId);
  if (!definition) {
    throw new TypeError(
      `Capability candidate building cannot resolve capability ${JSON.stringify(input.capabilityId)}.`
    );
  }

  if (input.resolvedPolicy.forbiddenCapabilityIds.includes(input.capabilityId)) {
    throw new TypeError(
      `Capability candidate building requires capability ${JSON.stringify(input.capabilityId)} but the resolved policy forbids it.`
    );
  }

  if (!definition.enabledByDefault) {
    throw new TypeError(
      `Capability candidate building requires capability ${JSON.stringify(input.capabilityId)} but it is disabled by default.`
    );
  }

  const allowedModelProfileIds = definition.supportedModelProfileIds.filter((profileId) =>
    input.resolvedPolicy.allowedModelProfileIds.includes(profileId)
  );
  if (input.required && allowedModelProfileIds.length === 0) {
    throw new TypeError(
      `Capability candidate building requires capability ${JSON.stringify(input.capabilityId)} but none of its supported model profiles are allowed.`
    );
  }

  return {
    definition,
    allowedModelProfileIds
  };
}

function isCapabilityAttemptActive<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  attempt: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
): boolean {
  return (
    attempt.status === "planned" ||
    attempt.status === "started" ||
    attempt.status === "clarification_requested"
  );
}

function buildImplementationReason<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  projection: WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId>;
  latestAttempt: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId> | null;
}): string {
  const latestChangesRequestedAttempt = input.projection.latestAttempts.find(
    (attempt) =>
      attempt.capabilityId !== (IMPLEMENT_SPEC_CAPABILITY_ID as CapabilityId) &&
      attempt.status === "changes_requested"
  );
  if (latestChangesRequestedAttempt) {
    return `Implementation must address changes requested by ${JSON.stringify(latestChangesRequestedAttempt.capabilityId)}.`;
  }

  if (input.latestAttempt?.status === "failed") {
    return `Implementation must retry work epoch ${input.latestAttempt.workEpoch} after a failed attempt.`;
  }

  return `Implementation is the next admissible capability for work epoch ${input.projection.workEpoch + 1}.`;
}

function buildVerificationReason<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  capabilityId: CapabilityId;
  workEpoch: number;
  latestAttempt: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId> | null;
  missingRequiredEvidenceIds: EvidenceId[];
  stageRequirement: {
    required: boolean;
    requiredBecauseMissingEvidence: boolean;
  };
}): string {
  if (input.latestAttempt?.status === "failed") {
    return `${input.capabilityId} must retry for work epoch ${input.workEpoch} after a failed attempt.`;
  }

  if (input.stageRequirement.requiredBecauseMissingEvidence) {
    return `${input.capabilityId} must produce missing evidence ${input.missingRequiredEvidenceIds
      .map((evidenceId) => JSON.stringify(evidenceId))
      .join(", ")} for work epoch ${input.workEpoch}.`;
  }

  if (input.capabilityId === (CODE_REVIEW_CAPABILITY_ID as CapabilityId)) {
    return `Code review is the first admissible verification capability for work epoch ${input.workEpoch}.`;
  }

  return `${input.capabilityId} is required by routing policy for work epoch ${input.workEpoch}.`;
}
