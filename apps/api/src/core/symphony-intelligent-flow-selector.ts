import {
  readSymphonyIntelligentFlowSelectionResponse,
  type SymphonyCapabilityId,
  type SymphonyIntelligentFlowPlanningSelectionContext,
  type SymphonyIntelligentFlowSelectionResponse
} from "@symphony/router";

const defaultSelectorTimeoutMs = 15_000;
const openAiBaseUrl = "https://api.openai.com/v1";
const openRouterBaseUrl = "https://openrouter.ai/api/v1";

export type SymphonyIntelligentFlowSelectorResult = {
  response: SymphonyIntelligentFlowSelectionResponse;
  model: string;
  providerBaseUrl: string;
  rawResponse: unknown;
};

export type SymphonyIntelligentFlowSelector = {
  select(input: {
    context: SymphonyIntelligentFlowPlanningSelectionContext;
  }): Promise<SymphonyIntelligentFlowSelectorResult>;
};

export function createSymphonyIntelligentFlowSelectorFromEnvironment(input: {
  configSource: Record<string, string | undefined>;
  secretSource: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): SymphonyIntelligentFlowSelector | null {
  const model = readOptionalText(
    input.configSource.SYMPHONY_INTELLIGENT_FLOW_SELECTOR_MODEL
  );
  if (model === null) {
    return null;
  }

  const configuredApiKeyEnvKey = readOptionalText(
    input.configSource.SYMPHONY_INTELLIGENT_FLOW_SELECTOR_API_KEY_ENV_KEY
  );
  const apiKeyEnvKey =
    configuredApiKeyEnvKey ?? inferSelectorApiKeyEnvKey(input.secretSource);

  if (apiKeyEnvKey === null) {
    return createFailingSymphonyIntelligentFlowSelector(
      "Symphony intelligent-flow selector requires SYMPHONY_INTELLIGENT_FLOW_SELECTOR_API_KEY_ENV_KEY or an available OPENAI_API_KEY/OPENROUTER_API_KEY."
    );
  }

  const baseUrl =
    readOptionalText(input.configSource.SYMPHONY_INTELLIGENT_FLOW_SELECTOR_BASE_URL) ??
    inferSelectorBaseUrl(apiKeyEnvKey);
  const timeoutMs = parsePositiveInteger(
    input.configSource.SYMPHONY_INTELLIGENT_FLOW_SELECTOR_TIMEOUT_MS
  );

  return createOpenAiCompatibleSymphonyIntelligentFlowSelector({
    model,
    apiKeyEnvKey,
    secretSource: input.secretSource,
    baseUrl,
    timeoutMs: timeoutMs ?? defaultSelectorTimeoutMs,
    fetchImpl: input.fetchImpl
  });
}

export function createOpenAiCompatibleSymphonyIntelligentFlowSelector(input: {
  model: string;
  apiKeyEnvKey: string;
  secretSource: Record<string, string | undefined>;
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): SymphonyIntelligentFlowSelector {
  const model = requireNonEmptyText(input.model, "model");
  const apiKeyEnvKey = requireNonEmptyText(input.apiKeyEnvKey, "apiKeyEnvKey");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const timeoutMs = input.timeoutMs ?? defaultSelectorTimeoutMs;
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    async select({ context }) {
      const apiKey = requireNonEmptyText(
        input.secretSource[apiKeyEnvKey] ?? "",
        apiKeyEnvKey
      );
      const prompt = createSymphonyIntelligentFlowSelectionPrompt({
        context
      });
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: {
            type: "json_object"
          },
          messages: [
            {
              role: "system",
              content: prompt.system
            },
            {
              role: "user",
              content: prompt.user
            }
          ]
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new TypeError(
          `Symphony intelligent-flow selector request failed with ${response.status} ${response.statusText}.`
        );
      }

      const rawResponse = (await response.json()) as Record<string, unknown>;
      const content = extractChatCompletionContent(rawResponse);
      const selection = readSymphonyIntelligentFlowSelectionResponse(
        parseStructuredJsonContent(content)
      );

      return {
        response: selection,
        model,
        providerBaseUrl: baseUrl,
        rawResponse
      };
    }
  };
}

export function createSymphonyIntelligentFlowSelectionPrompt(input: {
  context: SymphonyIntelligentFlowPlanningSelectionContext;
}): {
  system: string;
  user: string;
  executableModuleIds: SymphonyCapabilityId[];
} {
  const executableCandidates = buildExecutableCandidates(input.context);
  if (executableCandidates.length === 0) {
    throw new TypeError(
      `Symphony intelligent-flow selector requires at least one executable candidate for workflow ${input.context.contract.workflowId}.`
    );
  }

  const currentEvidence =
    input.context.projection.evidenceByEpoch.find(
      (epoch) => epoch.workEpoch === input.context.projection.workEpoch
    )?.evidence ?? [];
  const payload = {
    workflowId: input.context.contract.workflowId,
    issueIdentifier: input.context.contract.issueIdentifier,
    policyId: input.context.policyId,
    objective: input.context.contract.objective,
    doneDefinition: input.context.contract.doneDefinition,
    lifecycleState: input.context.lifecycleState,
    workflowSummary: {
      workEpoch: input.context.projection.workEpoch,
      phase: input.context.projection.phase,
      blockedReason: input.context.projection.blockedReason,
      pendingClarification:
        input.context.projection.pendingClarification === null
          ? null
          : {
              requestId: input.context.projection.pendingClarification.requestId,
              raisedByCapabilityId:
                input.context.projection.pendingClarification.raisedByCapabilityId,
              questions:
                input.context.projection.pendingClarification.questions.map(
                  (question) => ({
                    id: question.id,
                    prompt: question.prompt,
                    context: question.context
                  })
                ),
              workEpoch: input.context.projection.pendingClarification.workEpoch
            },
      completionReadiness: input.context.projection.completionReadiness
    },
    currentEvidence: currentEvidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      summary: evidence.summary
    })),
    latestAttempts: input.context.projection.latestAttempts.map((attempt) => ({
      capabilityId: attempt.capabilityId,
      workEpoch: attempt.workEpoch,
      attempt: attempt.attempt,
      status: attempt.status,
      retryable: attempt.retryable,
      reasonCode: attempt.reasonCode,
      failureKind: attempt.failureKind
    })),
    executableCandidates: executableCandidates.map((candidate) => ({
      moduleId: candidate.moduleId,
      phase: candidate.phase,
      rank: candidate.rank,
      admissibilityReasonCode: candidate.reasonCode,
      admissibilitySummary: candidate.summary,
      moduleSummary: candidate.moduleSummary,
      moduleDescription: candidate.moduleDescription,
      allowedModelProfileIds: candidate.allowedModelProfileIds
    }))
  };

  return {
    system: [
      "You are the Symphony intelligent-flow router selector.",
      "Choose exactly one executable module from the provided executableCandidates list.",
      "Never invent module ids and never choose a module outside executableCandidates.",
      "If the admissible set is ambiguous or you should yield to the default ordering, set deferToDeterministicFallback to true.",
      "Return JSON only with keys selectedModuleId, reason, confidence, deferToDeterministicFallback."
    ].join(" "),
    user: JSON.stringify(payload, null, 2),
    executableModuleIds: executableCandidates.map((candidate) => candidate.moduleId)
  };
}

function buildExecutableCandidates(
  context: SymphonyIntelligentFlowPlanningSelectionContext
) {
  return context.candidateSet.admissible.flatMap((candidate) => {
    const module = context.moduleRegistry.getModuleDefinition(candidate.moduleId);
    if (module.executionKind !== "agent") {
      return [];
    }

    return [
      {
        moduleId: module.id as SymphonyCapabilityId,
        phase: module.phase,
        rank: candidate.rank,
        reasonCode: candidate.reasonCode,
        summary: candidate.summary,
        moduleSummary: module.summary,
        moduleDescription: module.description,
        allowedModelProfileIds: module.supportedModelProfileIds.filter((profileId) =>
          context.resolvedPolicy.allowedModelProfileIds.includes(profileId)
        )
      }
    ];
  });
}

function createFailingSymphonyIntelligentFlowSelector(
  message: string
): SymphonyIntelligentFlowSelector {
  return {
    async select() {
      throw new TypeError(message);
    }
  };
}

function inferSelectorApiKeyEnvKey(
  secretSource: Record<string, string | undefined>
): string | null {
  if (readOptionalText(secretSource.OPENAI_API_KEY) !== null) {
    return "OPENAI_API_KEY";
  }

  if (readOptionalText(secretSource.OPENROUTER_API_KEY) !== null) {
    return "OPENROUTER_API_KEY";
  }

  return null;
}

function inferSelectorBaseUrl(apiKeyEnvKey: string): string {
  switch (apiKeyEnvKey) {
    case "OPENROUTER_API_KEY":
      return openRouterBaseUrl;
    default:
      return openAiBaseUrl;
  }
}

function extractChatCompletionContent(payload: Record<string, unknown>): unknown {
  const choice = Array.isArray(payload.choices)
    ? (payload.choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const message =
    choice && typeof choice.message === "object" && choice.message !== null
      ? (choice.message as Record<string, unknown>)
      : null;
  if (!message) {
    throw new TypeError(
      "Symphony intelligent-flow selector response is missing choices[0].message."
    );
  }

  return message.content;
}

function parseStructuredJsonContent(content: unknown): unknown {
  if (typeof content === "string") {
    const normalized = content.trim();
    if (!normalized) {
      throw new TypeError(
        "Symphony intelligent-flow selector response content is empty."
      );
    }

    try {
      return JSON.parse(normalized) as unknown;
    } catch (error) {
      throw new TypeError(
        `Symphony intelligent-flow selector response content is not valid JSON: ${String(error)}`,
        {
          cause: error
        }
      );
    }
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("")
      .trim();

    return parseStructuredJsonContent(text);
  }

  if (content && typeof content === "object") {
    return content;
  }

  throw new TypeError(
    "Symphony intelligent-flow selector response content has an unsupported shape."
  );
}

function normalizeBaseUrl(value: string): string {
  return requireNonEmptyText(value, "baseUrl").replace(/\/+$/u, "");
}

function parsePositiveInteger(value: string | undefined): number | null {
  const normalized = readOptionalText(value);
  if (normalized === null) {
    return null;
  }

  if (!/^\d+$/u.test(normalized)) {
    throw new TypeError(
      `Symphony intelligent-flow selector timeout must be a whole-number millisecond value, received ${JSON.stringify(value)}.`
    );
  }

  return Number.parseInt(normalized, 10);
}

function readOptionalText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`Symphony intelligent-flow selector ${field} is required.`);
  }

  return normalized;
}
