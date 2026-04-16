import { describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityPreset,
  createSymphonyCapabilityStartedSignal,
  createSymphonyTicketExecutionContract,
  prepareSymphonyIntelligentFlowPlanning
} from "@symphony/router";
import {
  createOpenAiCompatibleSymphonyIntelligentFlowSelector,
  createSymphonyIntelligentFlowSelectorFromEnvironment,
  createSymphonyIntelligentFlowSelectionPrompt
} from "./symphony-intelligent-flow-selector.js";

describe("Symphony intelligent-flow selector", () => {
  it("builds a structured prompt from the executable candidate set", () => {
    const context = createPreparedSelectionContext();

    const prompt = createSymphonyIntelligentFlowSelectionPrompt({
      context
    });

    expect(prompt.executableModuleIds).toEqual([
      "critic.code_review",
      "critic.adversarial_tests"
    ]);
    expect(prompt.user).toContain('"objective": "Choose the next intelligent-flow module."');
    expect(prompt.system).toContain("selectedModuleId");
    expect(prompt.user).not.toContain('"merge.execute"');
  });

  it("parses a valid openai-compatible selector response", async () => {
    const context = createPreparedSelectionContext();
    const selector = createOpenAiCompatibleSymphonyIntelligentFlowSelector({
      model: "test-router-selector",
      apiKeyEnvKey: "OPENAI_API_KEY",
      secretSource: {
        OPENAI_API_KEY: "test-key"
      },
      baseUrl: "https://api.openai.com/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedModuleId: "critic.adversarial_tests",
                    reason: "Missing adversarial evidence should be produced now.",
                    confidence: 0.81,
                    deferToDeterministicFallback: false
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    });

    const result = await selector.select({
      context
    });

    expect(result.response).toEqual({
      selectedModuleId: "critic.adversarial_tests",
      reason: "Missing adversarial evidence should be produced now.",
      confidence: 0.81,
      deferToDeterministicFallback: false
    });
  });

  it("rejects malformed selector JSON content", async () => {
    const context = createPreparedSelectionContext();
    const selector = createOpenAiCompatibleSymphonyIntelligentFlowSelector({
      model: "test-router-selector",
      apiKeyEnvKey: "OPENAI_API_KEY",
      secretSource: {
        OPENAI_API_KEY: "test-key"
      },
      baseUrl: "https://api.openai.com/v1",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "{not-json"
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    });

    await expect(
      selector.select({
        context
      })
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("uses the runtime fallback model and openrouter credentials for slash models", async () => {
    const context = createPreparedSelectionContext();
    let capturedRequest:
      | {
          url: string;
          authorization: string | null;
          body: Record<string, unknown>;
        }
      | null = null;

    const selector = createSymphonyIntelligentFlowSelectorFromEnvironment({
      configSource: {},
      secretSource: {
        OPENAI_API_KEY: "openai-test-key",
        OPENROUTER_API_KEY: "openrouter-test-key"
      },
      fallbackModel: "xiaomi/mimo-v2-pro",
      fetchImpl: async (url, init) => {
        capturedRequest = {
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
        };

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    selectedModuleId: "critic.code_review",
                    reason:
                      "Use the premium selector model to choose the next verification step.",
                    confidence: 0.74,
                    deferToDeterministicFallback: false
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }
    });

    expect(selector).not.toBeNull();

    const result = await selector!.select({
      context
    });

    expect(result.model).toBe("xiaomi/mimo-v2-pro");
    expect(result.providerBaseUrl).toBe("https://openrouter.ai/api/v1");
    expect(result.response.selectedModuleId).toBe("critic.code_review");
    expect(capturedRequest).toMatchObject({
      url: "https://openrouter.ai/api/v1/chat/completions",
      authorization: "Bearer openrouter-test-key",
      body: {
        model: "xiaomi/mimo-v2-pro"
      }
    });
  });
});

function createPreparedSelectionContext() {
  const contract = createContract();
  const prepared = prepareSymphonyIntelligentFlowPlanning({
    contract,
    history: buildImplementationCompletionHistory({
      workflowId: contract.workflowId,
      issueIdentifier: contract.issueIdentifier
    }),
    lifecycleState: "active",
    policyId: "backend_strict"
  });

  if (prepared.kind !== "selection") {
    throw new TypeError("Expected intelligent-flow planning to produce a selection context.");
  }

  return prepared.context;
}

function createContract() {
  const preset = createSymphonyCapabilityPreset({
    policyId: "backend_strict"
  });
  const routingDirectives = preset.defaultPolicy;

  return createSymphonyTicketExecutionContract({
    contractId: "contract_selector_test",
    workflowId: "workflow_selector_test",
    issueIdentifier: "SYM-SELECTOR-1",
    repositoryKey: "openai/symphony",
    summary: "Select the next module.",
    objective: "Choose the next intelligent-flow module.",
    doneDefinition: "The router chooses one executable module from the admissible set.",
    routingDirectives,
    createdAt: "2026-04-13T23:45:00.000Z",
    updatedAt: "2026-04-13T23:45:00.000Z"
  });
}

function buildImplementationCompletionHistory(input: {
  workflowId: string;
  issueIdentifier: string;
}) {
  const startedAt = "2026-04-13T23:45:30.000Z";
  const completedAt = "2026-04-13T23:45:31.000Z";

  return [
    {
      kind: "signal_recorded" as const,
      recordedAt: startedAt,
      signal: createSymphonyCapabilityStartedSignal({
        id: "signal_started_selector_implement_spec",
        occurredAt: startedAt,
        source: "runtime",
        workflowId: input.workflowId,
        executionId: "exec_selector_implement_spec_1",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1,
        attempt: 1,
        summary: "Started implement.spec.",
        causationId: null,
        correlationId: input.issueIdentifier
      })
    },
    {
      kind: "signal_recorded" as const,
      recordedAt: completedAt,
      signal: createSymphonyCapabilityCompletedSignal({
        id: "signal_completed_selector_implement_spec",
        occurredAt: completedAt,
        source: "runtime",
        workflowId: input.workflowId,
        executionId: "exec_selector_implement_spec_1",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1,
        attempt: 1,
        summary: "Completed implement.spec.",
        evidenceProduced: [
          {
            evidenceId: "change_set",
            summary: "Implementation diff recorded.",
            artifacts: []
          }
        ],
        causationId: null,
        correlationId: input.issueIdentifier
      })
    }
  ];
}
