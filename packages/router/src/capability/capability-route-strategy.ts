import type {
  WorkflowCapabilityCandidate,
  WorkflowCapabilityDecision,
  WorkflowCapabilityId,
  WorkflowCapabilityRouteSelection,
  WorkflowCapabilityRouteStrategy,
  WorkflowEvidenceId,
  WorkflowModelProfileId,
  WorkflowResolvedRoutingPolicy
} from "../types/index.js";

export function createDeterministicWorkflowCapabilityRouteStrategy<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(): WorkflowCapabilityRouteStrategy<CapabilityId, EvidenceId, ProfileId> {
  return {
    kind: "deterministic",
    select(input) {
      return selectDeterministicWorkflowCapabilityRoute(input);
    }
  };
}

export function selectDeterministicWorkflowCapabilityRoute<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(input: {
  candidates: WorkflowCapabilityCandidate<CapabilityId, ProfileId>[];
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  decisionId: string;
  decidedAt: string;
}): WorkflowCapabilityRouteSelection<CapabilityId, ProfileId> | null {
  if (input.candidates.length === 0) {
    return null;
  }

  const decisionId = requireNonEmptyString(input.decisionId, "decisionId");
  const decidedAt = requireNonEmptyString(input.decidedAt, "decidedAt");
  validateCandidates({
    candidates: input.candidates,
    resolvedPolicy: input.resolvedPolicy
  });

  const selectedCandidate = [...input.candidates].sort(compareCandidates)[0];
  if (!selectedCandidate) {
    return null;
  }

  const modelProfileId = selectPreferredModelProfileId({
    candidate: selectedCandidate,
    resolvedPolicy: input.resolvedPolicy
  });
  const decision: WorkflowCapabilityDecision<CapabilityId, ProfileId> = {
    decisionId,
    capabilityId: selectedCandidate.capabilityId,
    modelProfileId,
    workEpoch: selectedCandidate.workEpoch,
    rationale: buildDecisionRationale({
      candidate: selectedCandidate,
      modelProfileId
    }),
    decidedAt
  };

  return {
    candidate: selectedCandidate,
    decision
  };
}

function validateCandidates<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  candidates: WorkflowCapabilityCandidate<CapabilityId, ProfileId>[];
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
}) {
  const seenCandidateIdentities = new Set<string>();

  for (const candidate of input.candidates) {
    const candidateIdentity = `${candidate.capabilityId}:${candidate.workEpoch}`;
    if (seenCandidateIdentities.has(candidateIdentity)) {
      throw new TypeError(
        `Capability route strategy received duplicate candidate ${JSON.stringify(candidate.capabilityId)} for work epoch ${candidate.workEpoch}.`
      );
    }
    seenCandidateIdentities.add(candidateIdentity);

    if (input.resolvedPolicy.forbiddenCapabilityIds.includes(candidate.capabilityId)) {
      throw new TypeError(
        `Capability route strategy cannot choose forbidden capability ${JSON.stringify(candidate.capabilityId)}.`
      );
    }

    if (candidate.allowedModelProfileIds.length === 0) {
      throw new TypeError(
        `Capability route strategy requires at least one allowed model profile for capability ${JSON.stringify(candidate.capabilityId)}.`
      );
    }

    for (const profileId of candidate.allowedModelProfileIds) {
      if (!input.resolvedPolicy.allowedModelProfileIds.includes(profileId)) {
        throw new TypeError(
          `Capability route strategy cannot choose unsupported model profile ${JSON.stringify(profileId)} for capability ${JSON.stringify(candidate.capabilityId)}.`
        );
      }
    }
  }
}

function compareCandidates<
  CapabilityId extends WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId,
>(
  left: WorkflowCapabilityCandidate<CapabilityId, ProfileId>,
  right: WorkflowCapabilityCandidate<CapabilityId, ProfileId>
): number {
  if (left.required !== right.required) {
    return Number(right.required) - Number(left.required);
  }

  if (left.preferred !== right.preferred) {
    return Number(right.preferred) - Number(left.preferred);
  }

  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  if (left.capabilityId !== right.capabilityId) {
    return String(left.capabilityId).localeCompare(String(right.capabilityId));
  }

  if (left.workEpoch !== right.workEpoch) {
    return left.workEpoch - right.workEpoch;
  }

  return left.allowedModelProfileIds
    .map(String)
    .join(",")
    .localeCompare(right.allowedModelProfileIds.map(String).join(","));
}

function selectPreferredModelProfileId<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  candidate: WorkflowCapabilityCandidate<CapabilityId, ProfileId>;
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
}): ProfileId {
  for (const profileId of input.candidate.allowedModelProfileIds) {
    if (input.resolvedPolicy.allowedModelProfileIds.includes(profileId)) {
      return profileId;
    }
  }

  throw new TypeError(
    `Capability route strategy cannot choose unsupported model profile for capability ${JSON.stringify(input.candidate.capabilityId)}.`
  );
}

function buildDecisionRationale<
  CapabilityId extends WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  candidate: WorkflowCapabilityCandidate<CapabilityId, ProfileId>;
  modelProfileId: ProfileId;
}): string {
  const requirementLabel = input.candidate.required
    ? "required"
    : input.candidate.preferred
      ? "preferred"
      : "admissible";

  return `Selected ${requirementLabel} capability ${JSON.stringify(input.candidate.capabilityId)} for work epoch ${input.candidate.workEpoch} with model profile ${JSON.stringify(input.modelProfileId)} via deterministic route strategy.`;
}

function requireNonEmptyString(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Capability route strategy ${label} is required.`);
  }

  return trimmed;
}
