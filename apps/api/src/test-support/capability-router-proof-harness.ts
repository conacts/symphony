import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb,
  type RouteWorkflowExecutionContractRecord,
  type RouteWorkflowStore
} from "@symphony/db";
import {
  createSymphonyCurrentFlowRouterAsync,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  projectWorkflowCapabilityProjection,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyWorkflowCapabilityExecutionCommand,
  type SymphonyWorkflowTicketExecutionContract,
  type WorkflowCapabilityExecutionEngine,
  type WorkflowCapabilityExecutionResult,
  type WorkflowCapabilityProjection
} from "@symphony/router";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { createRouteWorkflowPort, type SymphonyRouteWorkflowPort } from "../core/runtime-route-workflows.js";
import {
  createRuntimeWorkflowSessionLoader
} from "../core/runtime-workflow-session-loader.js";
import {
  createSymphonyCapabilityContractIntake
} from "../core/symphony-capability-contract-intake.js";
import {
  createSymphonyCapabilityExecutionService,
  type SymphonyCapabilityExecutionAdvanceResult
} from "../core/symphony-capability-execution.js";
import {
  createSymphonyCapabilityPlanningService,
  type SymphonyCapabilityPlanningResult
} from "../core/symphony-capability-planning.js";

export type CapabilityScenarioOutcome =
  | "completed"
  | "changes_requested"
  | "clarification_requested"
  | "failed";

export type CapabilityScenarioOutcomeKey =
  `${SymphonyCapabilityId}:${number}:${number}`;

type CapabilityEngineFactory = () => WorkflowCapabilityExecutionEngine<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

type HarnessRuntime = {
  database: ReturnType<typeof initializeSymphonyDb>;
  routeWorkflowStore: RouteWorkflowStore;
  routeWorkflows: SymphonyRouteWorkflowPort;
  planning: ReturnType<typeof createSymphonyCapabilityPlanningService>;
  execution: ReturnType<typeof createSymphonyCapabilityExecutionService>;
};

export class CapabilityRouterProofHarness {
  static async create(input: {
    createEngine?: CapabilityEngineFactory;
  } = {}): Promise<CapabilityRouterProofHarness> {
    const root = await mkdtemp(path.join(tmpdir(), "capability-router-proof-"));
    const harness = new CapabilityRouterProofHarness({
      root,
      createEngine: input.createEngine
    });
    await harness.openRuntime();
    await harness.seedWorkflow();
    return harness;
  }

  readonly #root: string;
  readonly #issue: SymphonyTrackerIssue;
  readonly #createEngine: CapabilityEngineFactory;
  #runtime: HarnessRuntime | null = null;
  #workflowId: string | null = null;
  #contract: RouteWorkflowExecutionContractRecord<
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  > | null = null;

  private constructor(input: {
    root: string;
    createEngine?: CapabilityEngineFactory;
  }) {
    this.#root = input.root;
    this.#issue = buildProofIssue();
    this.#createEngine =
      input.createEngine ?? (() => createCapabilityScenarioExecutionEngine());
  }

  get issue(): SymphonyTrackerIssue {
    return this.#issue;
  }

  get issueIdentifier(): string {
    return this.#issue.identifier;
  }

  get workflowId(): string {
    if (this.#workflowId === null) {
      throw new TypeError("Capability proof harness workflowId is not initialized.");
    }

    return this.#workflowId;
  }

  get routeWorkflows(): SymphonyRouteWorkflowPort {
    return this.runtime().routeWorkflows;
  }

  get routeWorkflowStore(): RouteWorkflowStore {
    return this.runtime().routeWorkflowStore;
  }

  get contract() {
    if (this.#contract === null) {
      throw new TypeError("Capability proof harness contract is not initialized.");
    }

    return this.#contract;
  }

  async cleanup(): Promise<void> {
    this.#runtime?.database.close();
    this.#runtime = null;
    await rm(this.#root, {
      recursive: true,
      force: true
    });
  }

  async restart(): Promise<void> {
    this.#runtime?.database.close();
    this.#runtime = null;
    await this.openRuntime();
  }

  async plan(input: {
    recordedAt: string;
    policyId?: "default" | "backend_strict";
  }): Promise<SymphonyCapabilityPlanningResult> {
    return await this.runtime().planning.planByWorkflowId({
      workflowId: this.workflowId,
      recordedAt: input.recordedAt,
      policyId: input.policyId
    });
  }

  async advance(input: {
    recordedAt: string;
    policyId?: "default" | "backend_strict";
  }): Promise<SymphonyCapabilityExecutionAdvanceResult> {
    return await this.runtime().execution.advanceByWorkflowId({
      workflowId: this.workflowId,
      recordedAt: input.recordedAt,
      policyId: input.policyId
    });
  }

  async history() {
    return await this.routeWorkflowStore.listHistory(this.workflowId);
  }

  async projection(): Promise<
    WorkflowCapabilityProjection<
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    >
  > {
    const history = await this.history();
    return projectWorkflowCapabilityProjection<
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    >({
      workflowId: this.workflowId,
      history: history.map((entry) => entry.event)
    });
  }

  async loadLifecycleAuthority() {
    const hydration = await this.routeWorkflowStore.loadWorkflowHydrationState(
      this.workflowId
    );
    if (!hydration?.snapshot) {
      throw new TypeError(
        `Capability proof harness could not load hydration snapshot for ${this.workflowId}.`
      );
    }
    if (hydration.snapshot.projection.currentNode === null) {
      throw new TypeError(
        `Capability proof harness requires a current lifecycle node for ${this.workflowId}.`
      );
    }

    return {
      currentNode: hydration.snapshot.projection.currentNode,
      pendingCommandIds: hydration.snapshot.projection.pendingCommands.map(
        (command) => command.id
      )
    };
  }

  async listPlannerCommands() {
    return await this.routeWorkflowStore.listCapabilityPlannerCommands(this.workflowId);
  }

  async listRecordedSignalTypes() {
    const history = await this.history();
    return history.reduce<string[]>((types, entry) => {
      if (entry.event.kind !== "signal_recorded") {
        return types;
      }

      types.push(entry.signalType ?? entry.event.signal.type);
      return types;
    }, []);
  }

  private runtime(): HarnessRuntime {
    if (this.#runtime === null) {
      throw new TypeError("Capability proof harness runtime is not initialized.");
    }

    return this.#runtime;
  }

  private async openRuntime() {
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const database = initializeSymphonyDb({
      dbFile: path.join(this.#root, "symphony.db")
    });
    const routeWorkflowStore = createRouteWorkflowStore(database.db);
    const routeWorkflows = createRouteWorkflowPort({
      routeWorkflowStore
    });
    const sessionLoader = await createRuntimeWorkflowSessionLoader({
      routeWorkflows,
      trackerConfig: runtimePolicy.tracker
    });
    const planning = createSymphonyCapabilityPlanningService({
      routeWorkflowStore
    });

    this.#runtime = {
      database,
      routeWorkflowStore,
      routeWorkflows,
      planning,
      execution: createSymphonyCapabilityExecutionService({
        capabilityPlanning: planning,
        routeWorkflowStore,
        routeWorkflows,
        sessionLoader,
        engine: this.#createEngine()
      })
    };
  }

  private async seedWorkflow() {
    const issueStore = createSymphonyIssueStore(this.runtime().database.db);
    await issueStore.upsert({
      issueIdentifier: this.#issue.identifier,
      trackerIssueId: this.#issue.id,
      repositoryKey: "openai/symphony",
      latestRunStartedAt: null,
      recordedAt: "2026-04-13T09:00:00.000Z"
    });

    const router = await createSymphonyCurrentFlowRouterAsync();
    const ensured = await this.routeWorkflows.ensureWorkflowForIssue({
      trackerIssueId: this.#issue.id,
      issueIdentifier: this.#issue.identifier,
      repositoryKey: "openai/symphony",
      routerPresetId: "current-flow",
      router,
      createdAt: "2026-04-13T09:00:30.000Z"
    });
    this.#workflowId = ensured.workflow.workflowId;

    const session = await router.startSessionAsync({
      workflowId: this.workflowId,
      policy: {}
    });
    const bootstrapResult = await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed_capability_router_proof",
        occurredAt: "2026-04-13T09:01:00.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: this.#issue.identifier
      })
    );
    await this.routeWorkflows.recordRouteResult({
      workflowId: this.workflowId,
      policy: {},
      result: bootstrapResult
    });

    const intake = createSymphonyCapabilityContractIntake({
      routeWorkflows: this.routeWorkflows
    });
    this.#contract = await intake.createAndPersistForWorkflow({
      workflowId: this.workflowId,
      issue: this.#issue,
      repositoryKey: "openai/symphony",
      recordedAt: "2026-04-13T09:02:00.000Z"
    });
  }
}

export function createCapabilityScenarioExecutionEngine(input: {
  outcomes?: Partial<Record<CapabilityScenarioOutcomeKey, CapabilityScenarioOutcome>>;
} = {}): WorkflowCapabilityExecutionEngine<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
  return {
    async execute(command) {
      const context = readExecutionContext(command);
      const key =
        `${command.payload.capabilityId}:${context.workEpoch}:${context.attempt}` as CapabilityScenarioOutcomeKey;
      const outcome = input.outcomes?.[key] ?? "completed";

      switch (outcome) {
        case "completed":
          return {
            kind: "completed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: context.workEpoch,
            attempt: context.attempt,
            summary: `Completed ${command.payload.capabilityId}.`,
            evidenceProduced: [
              {
                evidenceId: mapEvidenceId(command.payload.capabilityId),
                summary:
                  command.payload.capabilityId === "implement.spec"
                    ? "Produced the implementation change set."
                    : "Produced verifier evidence.",
                artifacts: []
              }
            ]
          } satisfies WorkflowCapabilityExecutionResult<
            SymphonyCapabilityId,
            SymphonyCapabilityEvidenceId,
            SymphonyCapabilityModelProfileId
          >;
        case "changes_requested":
          return {
            kind: "changes_requested",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: context.workEpoch,
            attempt: context.attempt,
            summary: `Requested follow-up changes for ${command.payload.capabilityId}.`,
            findings: ["Address the verifier finding."]
          };
        case "clarification_requested":
          return {
            kind: "clarification_requested",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            clarification: {
              requestId: `clarify_${command.id}`,
              raisedByCapabilityId: command.payload.capabilityId,
              workEpoch: context.workEpoch,
              summary: `Need clarification before continuing ${command.payload.capabilityId}.`,
              questions: [
                {
                  id: "question_1",
                  prompt: "What behavior should this capability prove?",
                  context: null
                }
              ]
            }
          };
        case "failed":
          return {
            kind: "failed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: context.workEpoch,
            attempt: context.attempt,
            summary: `Retryable failure while executing ${command.payload.capabilityId}.`,
            retryable: true,
            reasonCode: "transient_failure",
            failureKind: "transient"
          };
      }
    }
  };
}

function readExecutionContext(command: SymphonyWorkflowCapabilityExecutionCommand) {
  return {
    workEpoch: readIntegerExecutionField({
      executionInput: command.payload.executionInput,
      field: "workEpoch",
      commandId: command.id,
      predicate: (value) => value >= 0,
      requirement: "a non-negative integer"
    }),
    attempt: readIntegerExecutionField({
      executionInput: command.payload.executionInput,
      field: "attempt",
      commandId: command.id,
      predicate: (value) => value > 0,
      requirement: "a positive integer"
    })
  };
}

function readIntegerExecutionField(input: {
  executionInput: Record<string, unknown> | null;
  field: "workEpoch" | "attempt";
  commandId: string;
  predicate(value: number): boolean;
  requirement: string;
}) {
  const value = input.executionInput?.[input.field];
  if (typeof value !== "number" || !Number.isInteger(value) || !input.predicate(value)) {
    throw new TypeError(
      `Test execution command ${input.commandId} requires executionInput.${input.field} to be ${input.requirement}.`
    );
  }

  return value;
}

function mapEvidenceId(
  capabilityId: SymphonyCapabilityId
): SymphonyCapabilityEvidenceId {
  switch (capabilityId) {
    case "implement.spec":
      return "change_set";
    case "critic.code_review":
      return "code_review_report";
    case "critic.adversarial_tests":
      return "adversarial_test_report";
    case "critic.browser_test":
      return "browser_test_report";
  }
}

function buildProofIssue() {
  return buildSymphonyTrackerIssue({
    id: "issue-capability-router-proof-123",
    identifier: "SYM-CAP-PROOF-123",
    title: "Prove the capability router closed loop",
    description: [
      "## Objective",
      "Prove the closed capability-router loop through planning, execution, replay, and restart.",
      "",
      "## Done Definition",
      "The proof harness demonstrates the main route, changes-requested loops, clarification waits, restart, and stale evidence handling.",
      "",
      "## Merge Policy",
      "manual"
    ].join("\n")
  });
}
