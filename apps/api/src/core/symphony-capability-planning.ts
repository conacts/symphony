import type {
  RouteWorkflowCapabilityPlannerCommandRecord,
  RouteWorkflowCapabilityPlannerDecisionRecord,
  RouteWorkflowExecutionContractRecord,
  RouteWorkflowStore
} from "@symphony/db";
import {
  createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection,
  createSymphonyCapabilityExecutionCommand,
  createSymphonyCapabilityPreset,
  createSymphonyIntelligentFlowDefaultModuleRegistry,
  createWorkflowCapabilityPlanner,
  prepareSymphonyIntelligentFlowPlanning,
  selectSymphonyIntelligentFlowCapabilityRoute,
  type SymphonyIntelligentFlowModuleRegistry,
  type SymphonyIntelligentFlowModuleDefinition,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyIntelligentFlowLifecycleState,
  type SymphonyWorkflowTicketExecutionContract,
  type WorkflowCapabilityPlan,
  type WorkflowHistory
} from "@symphony/router";
import { normalizeWorkflowToken } from "./runtime-route-workflow-command-utils.js";
import type {
  SymphonyIntelligentFlowSelector
} from "./symphony-intelligent-flow-selector.js";

type SymphonyCapabilityPlannerDecisionRecord = RouteWorkflowCapabilityPlannerDecisionRecord<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

type SymphonyCapabilityPlannerCommandRecord = RouteWorkflowCapabilityPlannerCommandRecord<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId
>;

export type SymphonyCapabilityPlanningResult = {
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  decision: SymphonyCapabilityPlannerDecisionRecord;
  command: SymphonyCapabilityPlannerCommandRecord | null;
  reused: boolean;
};

export type SymphonyCapabilityPlanningService = {
  planByWorkflowId(input: {
    workflowId: string;
    recordedAt: string;
    policyId?: SymphonyCapabilityPresetPolicyId;
  }): Promise<SymphonyCapabilityPlanningResult>;
};

export function createSymphonyCapabilityPlanningService(input: {
  routeWorkflowStore: RouteWorkflowStore;
  intelligentFlowSelector?: SymphonyIntelligentFlowSelector | null;
  intelligentFlowModuleRegistry?:
    | SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>
    | null;
  createIntelligentFlowCapabilityPreset?: typeof createSymphonyCapabilityPreset;
}): SymphonyCapabilityPlanningService {
  return {
    async planByWorkflowId(planInput) {
      const workflowId = requireNonEmptyText(planInput.workflowId, "workflowId");
      const recordedAt = requireNonEmptyText(planInput.recordedAt, "recordedAt");
      const policyId = planInput.policyId ?? "default";
      const hydrationState =
        await input.routeWorkflowStore.loadWorkflowHydrationState(workflowId);
      if (!hydrationState) {
        throw new TypeError(
          `Capability planner cannot load route workflow ${workflowId}.`
        );
      }

      const history = await input.routeWorkflowStore.listHistory(workflowId);
      const historyEventSequence = history.at(-1)?.eventSequence ?? 0;
      const contract =
        await input.routeWorkflowStore.getExecutionContract<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >(workflowId);
      if (!contract) {
        throw new TypeError(
          `Capability planner requires a persisted execution contract for workflow ${workflowId}.`
        );
      }

      const existingDecision =
        await input.routeWorkflowStore.getCapabilityPlannerDecisionForState<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >({
          workflowId,
          historyEventSequence,
          contractUpdatedAt: contract.updatedAt,
          policyId
        });
      if (existingDecision) {
        const command = await loadCommandForDecision({
          routeWorkflowStore: input.routeWorkflowStore,
          decision: existingDecision
        });

        return {
          contract,
          plan: existingDecision.plan,
          decision: existingDecision,
          command,
          reused: true
        };
      }

      const historyEvents = history.map((entry) => entry.event);
      const decisionId = buildPlannerDecisionId({
        workflowId,
        historyEventSequence,
        contractUpdatedAt: contract.updatedAt,
        policyId
      });
      const intelligentFlowPlanning =
        hydrationState.workflow.routerPresetId === "intelligent-flow"
          ? await resolveIntelligentFlowPlanning({
              contract,
              history: historyEvents,
              lifecycleState: resolveIntelligentFlowPlanningLifecycleState({
                workflowId,
                currentNode: hydrationState.snapshot?.projection.currentNode ?? null
              }),
              decisionId,
              decidedAt: recordedAt,
              policyId,
              intelligentFlowSelector: input.intelligentFlowSelector ?? null,
              intelligentFlowModuleRegistry:
                input.intelligentFlowModuleRegistry ??
                createSymphonyIntelligentFlowDefaultModuleRegistry(),
              createCapabilityPreset:
                input.createIntelligentFlowCapabilityPreset ??
                createSymphonyCapabilityPreset
            })
          : null;
      const preset = createSymphonyCapabilityPreset({
        policyId
      });
      const planner = createWorkflowCapabilityPlanner({
        capabilityDefinitions: preset.capabilities,
        modelProfiles: preset.modelProfiles,
        presetPolicy: preset.defaultPolicy
      });
      const plan =
        intelligentFlowPlanning?.plan ??
        planner.plan({
          contract,
          history: historyEvents,
          decisionId,
          decidedAt: recordedAt
        });
      const command = buildPlannerCommand({
        decisionId,
        workflowId,
        historyEventSequence,
        policyId,
        contract,
        plan
      });
      const persisted = await input.routeWorkflowStore.saveCapabilityPlannerDecision({
        workflowId,
        decisionId,
        policyId,
        contract,
        historyEventSequence,
        lifecycleProjectionSequence:
          hydrationState.snapshot?.projection.sequence ?? 0,
        lifecycleCurrentNode: hydrationState.snapshot?.projection.currentNode ?? null,
        plan,
        intelligentFlowRouterDecision:
          intelligentFlowPlanning?.routerDecision ?? null,
        command,
        recordedAt
      });

      return {
        contract,
        plan,
        decision: persisted.decision,
        command: persisted.command,
        reused: false
      };
    }
  };
}

function resolveIntelligentFlowPlanningLifecycleState(input: {
  workflowId: string;
  currentNode: string | null;
}): SymphonyIntelligentFlowLifecycleState {
  if (input.currentNode === null) {
    throw new TypeError(
      `Intelligent-flow capability planning requires a lifecycle node for workflow ${input.workflowId}.`
    );
  }

  switch (input.currentNode) {
    case "queued":
    case "claimed":
    case "active":
    case "awaiting_input":
    case "blocked":
    case "paused":
    case "failed":
    case "done":
      return input.currentNode;
    default:
      throw new TypeError(
        `Intelligent-flow capability planning cannot use lifecycle node ${JSON.stringify(input.currentNode)} for workflow ${input.workflowId}.`
      );
  }
}

async function resolveIntelligentFlowPlanning(input: {
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  history: WorkflowHistory;
  lifecycleState: SymphonyIntelligentFlowLifecycleState;
  decisionId: string;
  decidedAt: string;
  policyId: SymphonyCapabilityPresetPolicyId;
  intelligentFlowSelector: SymphonyIntelligentFlowSelector | null;
  intelligentFlowModuleRegistry: SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition>;
  createCapabilityPreset: typeof createSymphonyCapabilityPreset;
}): Promise<{
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  routerDecision:
    | SymphonyCapabilityPlannerDecisionRecord["intelligentFlowRouterDecision"]
    | null;
}> {
  const prepared = prepareSymphonyIntelligentFlowPlanning({
    contract: input.contract,
    history: input.history,
    lifecycleState: input.lifecycleState,
    policyId: input.policyId,
    moduleRegistry: input.intelligentFlowModuleRegistry,
    createCapabilityPreset: input.createCapabilityPreset
  });
  if (prepared.kind === "terminal") {
    return {
      plan: prepared.plan,
      routerDecision: prepared.routerDecision
    };
  }

  const deterministicSelection = selectSymphonyIntelligentFlowCapabilityRoute({
    context: prepared.context,
    decisionId: input.decisionId,
    decidedAt: input.decidedAt
  });
  if (input.intelligentFlowSelector === null) {
    return {
      plan: {
        kind: "execute",
        candidate: deterministicSelection.candidate,
        decision: deterministicSelection.decision
      },
      routerDecision:
        createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection({
          context: prepared.context,
          selection: deterministicSelection,
          selectionMode: "deterministic",
          selectionSummary: deterministicSelection.candidate.reason,
          selectionRationale: deterministicSelection.decision.rationale,
          confidence: null,
          fallbackReason: null
        })
    };
  }

  try {
    const selectorResult = await input.intelligentFlowSelector.select({
      context: prepared.context
    });
    if (selectorResult.response.deferToDeterministicFallback) {
      return buildIntelligentFlowFallbackResult({
        context: prepared.context,
        decisionId: input.decisionId,
        decidedAt: input.decidedAt,
        deterministicSelection,
        fallbackReason: `Selector deferred to deterministic fallback: ${selectorResult.response.reason}`
      });
    }

    const selected = selectSymphonyIntelligentFlowCapabilityRoute({
      context: prepared.context,
      decisionId: input.decisionId,
      decidedAt: input.decidedAt,
      selectedModuleId: requireExecutableCapabilityModuleId(
        selectorResult.response.selectedModuleId
      )
    });
    const selectedRationale = [
      `Intelligent-flow selector model ${JSON.stringify(
        selectorResult.model
      )} chose ${JSON.stringify(
        selectorResult.response.selectedModuleId
      )} via ${JSON.stringify(selectorResult.providerBaseUrl)}.`,
      selectorResult.response.reason,
      selected.decision.rationale
    ].join(" ");
    const llmSelected = overrideSelectionRationale(selected, selectedRationale);

    return {
      plan: {
        kind: "execute",
        candidate: llmSelected.candidate,
        decision: llmSelected.decision
      },
      routerDecision:
        createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection({
          context: prepared.context,
          selection: llmSelected,
          selectionMode: "llm_selected",
          selectionSummary: selectorResult.response.reason,
          selectionRationale: llmSelected.decision.rationale,
          confidence: selectorResult.response.confidence,
          fallbackReason: null
        })
    };
  } catch (error) {
    return buildIntelligentFlowFallbackResult({
      context: prepared.context,
      decisionId: input.decisionId,
      decidedAt: input.decidedAt,
      deterministicSelection,
      fallbackReason: `Selector response was rejected: ${toErrorMessage(error)}`
    });
  }
}

function buildIntelligentFlowFallbackResult(input: {
  context: Parameters<
    typeof createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection
  >[0]["context"];
  decisionId: string;
  decidedAt: string;
  deterministicSelection: ReturnType<
    typeof selectSymphonyIntelligentFlowCapabilityRoute
  >;
  fallbackReason: string;
}): {
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  routerDecision: SymphonyCapabilityPlannerDecisionRecord["intelligentFlowRouterDecision"];
} {
  const fallbackReason = requireNonEmptyText(
    input.fallbackReason,
    "fallbackReason"
  );
  const selection = overrideSelectionRationale(
    selectSymphonyIntelligentFlowCapabilityRoute({
      context: input.context,
      decisionId: input.decisionId,
      decidedAt: input.decidedAt,
      selectedModuleId: input.deterministicSelection.decision.capabilityId
    }),
    [
      "Intelligent-flow selector fell back to the deterministic default.",
      fallbackReason,
      input.deterministicSelection.decision.rationale
    ].join(" ")
  );

  return {
    plan: {
      kind: "execute",
      candidate: selection.candidate,
      decision: selection.decision
    },
    routerDecision:
      createSymphonyIntelligentFlowRouterDecisionForCapabilityRouteSelection({
        context: input.context,
        selection,
        selectionMode: "fallback_default",
        selectionSummary: selection.candidate.reason,
        selectionRationale: selection.decision.rationale,
        confidence: null,
        fallbackReason
      })
  };
}

function overrideSelectionRationale(
  selection: ReturnType<typeof selectSymphonyIntelligentFlowCapabilityRoute>,
  rationale: string
) {
  return {
    ...selection,
    decision: {
      ...selection.decision,
      rationale: requireNonEmptyText(rationale, "selectionRationale")
    }
  };
}

async function loadCommandForDecision(input: {
  routeWorkflowStore: RouteWorkflowStore;
  decision: SymphonyCapabilityPlannerDecisionRecord;
}): Promise<SymphonyCapabilityPlannerCommandRecord | null> {
  if (input.decision.planKind !== "execute") {
    return null;
  }

  const command =
    await input.routeWorkflowStore.getCapabilityPlannerCommandByDecisionId<
      SymphonyWorkflowTicketExecutionContract,
      SymphonyCapabilityId,
      SymphonyCapabilityModelProfileId
    >(input.decision.decisionId);
  if (!command) {
    throw new TypeError(
      `Capability planner decision ${input.decision.decisionId} is missing its emitted command.`
    );
  }

  return command;
}

function buildPlannerCommand(input: {
  decisionId: string;
  workflowId: string;
  historyEventSequence: number;
  policyId: SymphonyCapabilityPresetPolicyId;
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
  plan: WorkflowCapabilityPlan<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
}): SymphonyCapabilityPlannerCommandRecord["command"] | null {
  if (input.plan.kind !== "execute") {
    return null;
  }

  return createSymphonyCapabilityExecutionCommand({
    id: buildPlannerCommandId(input.decisionId),
    dedupeKey: buildPlannerDedupeKey({
      workflowId: input.workflowId,
      historyEventSequence: input.historyEventSequence,
      contractUpdatedAt: input.contract.updatedAt,
      policyId: input.policyId,
      capabilityId: input.plan.decision.capabilityId,
      workEpoch: input.plan.decision.workEpoch
    }),
    workflowId: input.workflowId,
    capabilityId: input.plan.decision.capabilityId,
    modelProfileId: input.plan.decision.modelProfileId,
    contract: toExecutionCommandContract(input.contract),
    executionInput: null
  });
}

function buildPlannerDecisionId(input: {
  workflowId: string;
  historyEventSequence: number;
  contractUpdatedAt: string;
  policyId: SymphonyCapabilityPresetPolicyId;
}): string {
  return [
    "capability_plan",
    normalizeWorkflowToken(input.workflowId),
    String(input.historyEventSequence),
    normalizeWorkflowToken(input.contractUpdatedAt),
    normalizeWorkflowToken(input.policyId)
  ].join("_");
}

function buildPlannerCommandId(decisionId: string): string {
  return `capability_execute_${normalizeWorkflowToken(decisionId)}`;
}

function buildPlannerDedupeKey(input: {
  workflowId: string;
  historyEventSequence: number;
  contractUpdatedAt: string;
  policyId: SymphonyCapabilityPresetPolicyId;
  capabilityId: SymphonyCapabilityId;
  workEpoch: number;
}): string {
  return [
    input.workflowId,
    String(input.historyEventSequence),
    input.contractUpdatedAt,
    input.policyId,
    input.capabilityId,
    String(input.workEpoch)
  ].join(":");
}

function toExecutionCommandContract(
  contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >
): SymphonyWorkflowTicketExecutionContract {
  return {
    contractId: contract.contractId,
    workflowId: contract.workflowId,
    issueIdentifier: contract.issueIdentifier,
    repositoryKey: contract.repositoryKey,
    summary: contract.summary,
    objective: contract.objective,
    doneDefinition: contract.doneDefinition,
    routingDirectives: {
      requiredCapabilityIds: [...contract.routingDirectives.requiredCapabilityIds],
      preferredCapabilityIds: [...contract.routingDirectives.preferredCapabilityIds],
      forbiddenCapabilityIds: [...contract.routingDirectives.forbiddenCapabilityIds],
      requiredEvidenceIds: [...contract.routingDirectives.requiredEvidenceIds],
      allowedModelProfileIds: [...contract.routingDirectives.allowedModelProfileIds],
      clarificationPolicy: {
        mode: contract.routingDirectives.clarificationPolicy.mode
      },
      reviewStrictness: contract.routingDirectives.reviewStrictness,
      maxRetryCount: contract.routingDirectives.maxRetryCount
    },
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function requireExecutableCapabilityModuleId(
  moduleId: string
): SymphonyCapabilityId {
  switch (moduleId) {
    case "implement.spec":
    case "critic.code_review":
    case "critic.adversarial_tests":
    case "critic.browser_test":
      return moduleId;
    default:
      throw new TypeError(
        `Intelligent-flow selector chose non-executable module ${JSON.stringify(moduleId)}.`
      );
  }
}

function requireNonEmptyText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
