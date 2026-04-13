import type {
  WorkflowCapabilityDefinition,
  WorkflowCapabilityId,
  WorkflowCompletionMode,
  WorkflowEvidenceId,
  WorkflowMergePolicy,
  WorkflowModelProfileDefinition,
  WorkflowModelProfileId,
  WorkflowResolvedRoutingPolicy,
  WorkflowReviewStrictness,
  WorkflowRoutingPolicyOverrides,
  WorkflowRoutingPolicyResolutionInput,
  WorkflowClarificationMode
} from "./types/index.js";

const completionModeRank: Record<WorkflowCompletionMode, number> = {
  auto: 0,
  manual: 1
};

const clarificationModeRank: Record<WorkflowClarificationMode, number> = {
  best_effort: 0,
  required: 1
};

const reviewStrictnessRank: Record<WorkflowReviewStrictness, number> = {
  standard: 0,
  strict: 1,
  adversarial: 2
};

const mergePolicyRank: Record<WorkflowMergePolicy, number> = {
  auto_merge: 0,
  manual: 1
};

export function resolveWorkflowRoutingPolicy<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(
  input: WorkflowRoutingPolicyResolutionInput<
    CapabilityId,
    EvidenceId,
    ProfileId
  >
): WorkflowResolvedRoutingPolicy<CapabilityId, EvidenceId, ProfileId> {
  const capabilityDefinitions = input.capabilityDefinitions;
  if (capabilityDefinitions.length === 0) {
    throw new TypeError(
      "Routing policy resolution requires at least one capability definition."
    );
  }

  const modelProfiles = input.modelProfiles;
  if (modelProfiles.length === 0) {
    throw new TypeError(
      "Routing policy resolution requires at least one model profile definition."
    );
  }

  const capabilityDefinitionMap = createCapabilityDefinitionMap(capabilityDefinitions);
  const knownProfileIds = createModelProfileIdSet(modelProfiles);
  const userDefaults = input.userDefaults ?? null;
  const ticketDirectives = input.ticketDirectives ?? null;
  const presetPolicy = input.presetPolicy;

  const requiredCapabilityIds = mergeUniqueList<CapabilityId>([
    presetPolicy.requiredCapabilityIds,
    userDefaults?.requiredCapabilityIds,
    ticketDirectives?.requiredCapabilityIds
  ]);
  const forbiddenCapabilityIds = mergeUniqueList<CapabilityId>([
    presetPolicy.forbiddenCapabilityIds,
    userDefaults?.forbiddenCapabilityIds,
    ticketDirectives?.forbiddenCapabilityIds
  ]);
  const preferredCapabilityIds = mergePreferredCapabilityIds({
    presetPolicy,
    userDefaults,
    ticketDirectives,
    requiredCapabilityIds,
    forbiddenCapabilityIds
  });
  const requiredEvidenceIds = mergeUniqueList<EvidenceId>([
    presetPolicy.requiredEvidenceIds,
    userDefaults?.requiredEvidenceIds,
    ticketDirectives?.requiredEvidenceIds
  ]);
  const allowedModelProfileIds = resolveAllowedModelProfileIds({
    presetPolicy,
    userDefaults,
    ticketDirectives,
    knownProfileIds
  });

  validateKnownCapabilityIds({
    label: "required capability",
    ids: requiredCapabilityIds,
    capabilityDefinitionMap
  });
  validateKnownCapabilityIds({
    label: "preferred capability",
    ids: preferredCapabilityIds,
    capabilityDefinitionMap
  });
  validateKnownCapabilityIds({
    label: "forbidden capability",
    ids: forbiddenCapabilityIds,
    capabilityDefinitionMap
  });

  const requiredAndForbidden = requiredCapabilityIds.filter((capabilityId) =>
    forbiddenCapabilityIds.includes(capabilityId)
  );
  if (requiredAndForbidden.length > 0) {
    throw new TypeError(
      `Resolved routing policy cannot mark the same capability as both required and forbidden: ${requiredAndForbidden
        .map((capabilityId) => JSON.stringify(capabilityId))
        .join(", ")}.`
    );
  }

  for (const capabilityId of requiredCapabilityIds) {
    const capability = capabilityDefinitionMap.get(capabilityId);
    if (!capability) {
      continue;
    }

    const supportedAllowedProfiles = capability.supportedModelProfileIds.filter(
      (profileId) => allowedModelProfileIds.includes(profileId)
    );
    if (supportedAllowedProfiles.length === 0) {
      throw new TypeError(
        `Resolved routing policy requires capability ${JSON.stringify(capabilityId)} but none of its supported model profiles are allowed.`
      );
    }
  }

  for (const evidenceId of requiredEvidenceIds) {
    const supportingCapabilities = capabilityDefinitions.filter((definition) =>
      definition.producesEvidenceIds.includes(evidenceId)
    );
    if (supportingCapabilities.length === 0) {
      throw new TypeError(
        `Resolved routing policy requires evidence ${JSON.stringify(evidenceId)} but no registered capability produces it.`
      );
    }

    const admissibleSupportingCapabilities = supportingCapabilities.filter(
      (definition) =>
        !forbiddenCapabilityIds.includes(definition.id) &&
        definition.supportedModelProfileIds.some((profileId) =>
          allowedModelProfileIds.includes(profileId)
        )
    );
    if (admissibleSupportingCapabilities.length === 0) {
      throw new TypeError(
        `Resolved routing policy requires evidence ${JSON.stringify(evidenceId)} but no admissible capability can produce it.`
      );
    }
  }

  return {
    requiredCapabilityIds,
    preferredCapabilityIds,
    forbiddenCapabilityIds,
    requiredEvidenceIds,
    allowedModelProfileIds,
    completionPolicy: {
      mode: resolveStrictestCompletionMode([
        presetPolicy.completionPolicy.mode,
        userDefaults?.completionPolicy?.mode,
        ticketDirectives?.completionPolicy?.mode
      ])
    },
    clarificationPolicy: {
      mode: resolveStrictestClarificationMode([
        presetPolicy.clarificationPolicy.mode,
        userDefaults?.clarificationPolicy?.mode,
        ticketDirectives?.clarificationPolicy?.mode
      ])
    },
    reviewStrictness: resolveStrictestReviewStrictness([
      presetPolicy.reviewStrictness,
      userDefaults?.reviewStrictness,
      ticketDirectives?.reviewStrictness
    ]),
    maxRetryCount: resolveStrictestRetryCeiling([
      presetPolicy.maxRetryCount,
      userDefaults?.maxRetryCount,
      ticketDirectives?.maxRetryCount
    ]),
    mergePolicy: resolveStrictestMergePolicy([
      presetPolicy.mergePolicy,
      userDefaults?.mergePolicy,
      ticketDirectives?.mergePolicy
    ])
  };
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
  const definitionsById = new Map<
    CapabilityId,
    WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
  >();

  for (const definition of capabilityDefinitions) {
    definitionsById.set(definition.id, definition);
  }

  return definitionsById;
}

function createModelProfileIdSet<ProfileId extends WorkflowModelProfileId>(
  modelProfiles: WorkflowModelProfileDefinition<ProfileId>[]
): Set<ProfileId> {
  return new Set(modelProfiles.map((profile) => profile.id));
}

function mergePreferredCapabilityIds<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  presetPolicy: WorkflowResolvedRoutingPolicy<CapabilityId, EvidenceId, ProfileId>;
  userDefaults: WorkflowRoutingPolicyOverrides<
    CapabilityId,
    EvidenceId,
    ProfileId
  > | null;
  ticketDirectives: WorkflowRoutingPolicyOverrides<
    CapabilityId,
    EvidenceId,
    ProfileId
  > | null;
  requiredCapabilityIds: CapabilityId[];
  forbiddenCapabilityIds: CapabilityId[];
}): CapabilityId[] {
  const requiredCapabilitySet = new Set(input.requiredCapabilityIds);
  const forbiddenCapabilitySet = new Set(input.forbiddenCapabilityIds);

  return mergeUniqueList<CapabilityId>([
    input.ticketDirectives?.preferredCapabilityIds,
    input.userDefaults?.preferredCapabilityIds,
    input.presetPolicy.preferredCapabilityIds
  ]).filter(
    (capabilityId) =>
      !requiredCapabilitySet.has(capabilityId) &&
      !forbiddenCapabilitySet.has(capabilityId)
  );
}

function resolveAllowedModelProfileIds<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  presetPolicy: WorkflowResolvedRoutingPolicy<CapabilityId, EvidenceId, ProfileId>;
  userDefaults: WorkflowRoutingPolicyOverrides<
    CapabilityId,
    EvidenceId,
    ProfileId
  > | null;
  ticketDirectives: WorkflowRoutingPolicyOverrides<
    CapabilityId,
    EvidenceId,
    ProfileId
  > | null;
  knownProfileIds: Set<ProfileId>;
}): ProfileId[] {
  const profileSources = [
    input.presetPolicy.allowedModelProfileIds,
    input.userDefaults?.allowedModelProfileIds,
    input.ticketDirectives?.allowedModelProfileIds
  ].filter((profiles): profiles is ProfileId[] => profiles !== undefined);

  for (const profileIds of profileSources) {
    for (const profileId of profileIds) {
      if (!input.knownProfileIds.has(profileId)) {
        throw new TypeError(
          `Resolved routing policy references unknown model profile ${JSON.stringify(profileId)}.`
        );
      }
    }
  }

  const [baseProfileIds, ...remainingProfileSources] = profileSources;
  const allowedModelProfileIds = [...baseProfileIds];

  const intersectedProfileIds = allowedModelProfileIds.filter((profileId) =>
    remainingProfileSources.every((profileIds) => profileIds.includes(profileId))
  );

  if (intersectedProfileIds.length === 0) {
    throw new TypeError(
      "Resolved routing policy produced an empty allowed model profile intersection."
    );
  }

  return intersectedProfileIds;
}

function validateKnownCapabilityIds<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  label: string;
  ids: CapabilityId[];
  capabilityDefinitionMap: Map<
    CapabilityId,
    WorkflowCapabilityDefinition<CapabilityId, EvidenceId, ProfileId>
  >;
}): void {
  for (const capabilityId of input.ids) {
    if (!input.capabilityDefinitionMap.has(capabilityId)) {
      throw new TypeError(
        `Resolved routing policy references unknown ${input.label} ${JSON.stringify(capabilityId)}.`
      );
    }
  }
}

function mergeUniqueList<Value>(sources: Array<Value[] | null | undefined>): Value[] {
  const mergedValues: Value[] = [];

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const value of source) {
      if (mergedValues.includes(value)) {
        continue;
      }

      mergedValues.push(value);
    }
  }

  return mergedValues;
}

function resolveStrictestCompletionMode(
  modes: Array<WorkflowCompletionMode | null | undefined>
): WorkflowCompletionMode {
  return resolveStrictestValue(modes, completionModeRank);
}

function resolveStrictestClarificationMode(
  modes: Array<WorkflowClarificationMode | null | undefined>
): WorkflowClarificationMode {
  return resolveStrictestValue(modes, clarificationModeRank);
}

function resolveStrictestReviewStrictness(
  values: Array<WorkflowReviewStrictness | null | undefined>
): WorkflowReviewStrictness {
  return resolveStrictestValue(values, reviewStrictnessRank);
}

function resolveStrictestMergePolicy(
  values: Array<WorkflowMergePolicy | null | undefined>
): WorkflowMergePolicy {
  return resolveStrictestValue(values, mergePolicyRank);
}

function resolveStrictestRetryCeiling(
  retryCounts: Array<number | null | undefined>
): number {
  const definedRetryCounts = retryCounts.filter(
    (value): value is number => value !== null && value !== undefined
  );
  if (definedRetryCounts.length === 0) {
    throw new TypeError("Resolved routing policy requires at least one retry ceiling.");
  }

  return Math.min(...definedRetryCounts);
}

function resolveStrictestValue<Value extends string>(
  values: Array<Value | null | undefined>,
  rankByValue: Record<Value, number>
): Value {
  const definedValues = values.filter(
    (value): value is Value => value !== null && value !== undefined
  );
  if (definedValues.length === 0) {
    throw new TypeError("Resolved routing policy requires at least one policy value.");
  }

  let strictestValue = definedValues[0];
  let strictestRank = rankByValue[strictestValue];

  for (const value of definedValues.slice(1)) {
    const rank = rankByValue[value];
    if (rank > strictestRank) {
      strictestValue = value;
      strictestRank = rank;
    }
  }

  return strictestValue;
}
