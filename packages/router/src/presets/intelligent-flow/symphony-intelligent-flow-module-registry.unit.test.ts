import { describe, expect, it } from "vitest";
import {
  createSymphonyIntelligentFlowDefaultModuleRegistry,
  createSymphonyIntelligentFlowModuleRegistry,
  SymphonyIntelligentFlowModuleRegistry
} from "./symphony-intelligent-flow-module-registry.js";
import {
  createSymphonyIntelligentFlowModuleDefinition
} from "./symphony-intelligent-flow-contract.js";

describe("Symphony intelligent-flow module registry", () => {
  it("lists registered modules and evidence producers from the default catalog", () => {
    const registry = createSymphonyIntelligentFlowDefaultModuleRegistry();

    expect(registry.listModuleIds()).toEqual([
      "implement.spec",
      "critic.code_review",
      "critic.adversarial_tests",
      "critic.browser_test",
      "blocked.report"
    ]);
    expect(registry.listAvailableModuleIds()).toEqual([
      "implement.spec",
      "critic.code_review",
      "critic.adversarial_tests",
      "blocked.report"
    ]);
    expect(
      registry
        .listEvidenceProducerDefinitions("code_review_report")
        .map((definition) => definition.id)
    ).toEqual(["critic.code_review"]);
  });

  it("fails fast when duplicate module ids are registered", () => {
    const implementModule = createSymphonyIntelligentFlowModuleDefinition({
      id: "implement.spec",
      phase: "implementing",
      summary: "Implement the requested slice.",
      description: "Produces the change set.",
      executionKind: "agent",
      enabledByDefault: true,
      supportedModelProfileIds: ["builder_fast"],
      producesEvidenceIds: ["change_set"],
      requiresEvidenceIds: [],
      requiredRuntimeSupportFlags: [],
      allowedLifecycleStates: ["active"],
      allowedOutcomeKinds: ["completed"],
      requiresNoPendingClarification: true,
      canRunWhenBlocked: false
    });

    expect(
      () =>
        new SymphonyIntelligentFlowModuleRegistry({
          definitions: [implementModule, implementModule]
        })
    ).toThrow(/duplicate intelligent-flow module id/i);
  });

  it("fails fast when a module requires evidence that no module can produce", () => {
    const implementModule = createSymphonyIntelligentFlowModuleDefinition({
      id: "implement.spec",
      phase: "implementing",
      summary: "Implement the requested slice.",
      description: "Produces the change set.",
      executionKind: "agent",
      enabledByDefault: true,
      supportedModelProfileIds: ["builder_fast"],
      producesEvidenceIds: ["change_set"],
      requiresEvidenceIds: [],
      requiredRuntimeSupportFlags: [],
      allowedLifecycleStates: ["active"],
      allowedOutcomeKinds: ["completed"],
      requiresNoPendingClarification: true,
      canRunWhenBlocked: false
    });
    const brokenReportModule = createSymphonyIntelligentFlowModuleDefinition({
      id: "blocked.report",
      phase: "reporting",
      summary: "Record the blocked condition.",
      description: "Requires missing evidence to prove validation works.",
      executionKind: "system",
      enabledByDefault: true,
      supportedModelProfileIds: [],
      producesEvidenceIds: [],
      requiresEvidenceIds: ["browser_test_report"],
      requiredRuntimeSupportFlags: [],
      allowedLifecycleStates: ["active"],
      allowedOutcomeKinds: ["blocked"],
      requiresNoPendingClarification: true,
      canRunWhenBlocked: false
    });

    expect(
      () =>
        createSymphonyIntelligentFlowModuleRegistry({
          definitions: [implementModule, brokenReportModule]
        })
    ).toThrow(/requires evidence .*browser_test_report.*no registered module produces it/i);
  });

  it("excludes disabled modules from the available module set", () => {
    const registry = createSymphonyIntelligentFlowDefaultModuleRegistry();

    expect(registry.listModuleIds()).toContain("critic.browser_test");
    expect(registry.listAvailableModuleIds()).not.toContain("critic.browser_test");
    expect(
      registry
        .listAvailableEvidenceProducerDefinitions("browser_test_report")
        .map((definition) => definition.id)
    ).toEqual([]);
  });

  it("filters available modules by runtime support flags", () => {
    const implementModule = createSymphonyIntelligentFlowModuleDefinition({
      id: "implement.spec",
      phase: "implementing",
      summary: "Implement the requested slice.",
      description: "Produces the change set.",
      executionKind: "agent",
      enabledByDefault: true,
      supportedModelProfileIds: ["builder_fast"],
      producesEvidenceIds: ["change_set"],
      requiresEvidenceIds: [],
      requiredRuntimeSupportFlags: [],
      allowedLifecycleStates: ["active"],
      allowedOutcomeKinds: ["completed"],
      requiresNoPendingClarification: true,
      canRunWhenBlocked: false
    });
    const browserModule = createSymphonyIntelligentFlowModuleDefinition({
      id: "critic.browser_test",
      phase: "verifying",
      summary: "Run browser verification.",
      description: "Produces browser test evidence.",
      executionKind: "agent",
      enabledByDefault: true,
      supportedModelProfileIds: ["critic_browser"],
      producesEvidenceIds: ["browser_test_report"],
      requiresEvidenceIds: ["change_set"],
      requiredRuntimeSupportFlags: ["browser_automation"],
      allowedLifecycleStates: ["active"],
      allowedOutcomeKinds: ["completed"],
      requiresNoPendingClarification: true,
      canRunWhenBlocked: false
    });

    const registry = createSymphonyIntelligentFlowModuleRegistry({
      definitions: [implementModule, browserModule],
      runtimeSupport: {
        browser_automation: false
      }
    });

    expect(registry.isModuleRuntimeSupported({ moduleId: "critic.browser_test" })).toBe(
      false
    );
    expect(registry.listAvailableModuleIds()).toEqual(["implement.spec"]);
    expect(
      registry.listAvailableModuleIds({
        runtimeSupport: {
          browser_automation: true
        }
      })
    ).toEqual(["implement.spec", "critic.browser_test"]);
  });
});
