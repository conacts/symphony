import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
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
  type WorkflowCapabilityExecutionEngine
} from "@symphony/router";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  createRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import {
  createSymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import {
  createSymphonyCapabilityExecutionService
} from "./symphony-capability-execution.js";
import {
  createSymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("Symphony capability execution", () => {
  it("records implementation completion and routes the next plan to code review", async () => {
    const harness = await createHarness();
    const seeded = await seedPlannerFixture(harness);

    try {
      const advanced = await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:03:00.000Z"
      });
      const history = await harness.routeWorkflowStore.listHistory(seeded.workflowId);
      const projection = projectWorkflowCapabilityProjection({
        workflowId: seeded.workflowId,
        history: history.map((entry) => entry.event)
      });

      expect(advanced.kind).toBe("executed");
      if (advanced.kind !== "executed") {
        throw new TypeError("Expected capability execution to run.");
      }

      expect(advanced.planning.plan).toEqual(
        expect.objectContaining({
          kind: "execute",
          decision: expect.objectContaining({
            capabilityId: "implement.spec",
            workEpoch: 1
          })
        })
      );
      expect(advanced.execution.result).toEqual(
        expect.objectContaining({
          kind: "completed",
          capabilityId: "implement.spec",
          workEpoch: 1,
          attempt: 1
        })
      );
      expect(advanced.nextPlanning.plan).toEqual(
        expect.objectContaining({
          kind: "execute",
          decision: expect.objectContaining({
            capabilityId: "critic.code_review",
            workEpoch: 1
          })
        })
      );
      expect(listRecordedSignalTypes(history).slice(-2)).toEqual([
        "capability.started",
        "capability.completed"
      ]);
      expect(projection.latestAttempts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            capabilityId: "implement.spec",
            workEpoch: 1,
            attempt: 1,
            status: "completed"
          })
        ])
      );
    } finally {
      harness.close();
    }
  });

  it("routes code-review changes requested back to implementing", async () => {
    const harness = await createHarness({
      engine: createScenarioExecutionEngine({
        outcomes: {
          "critic.code_review:1:1": "changes_requested"
        }
      })
    });
    const seeded = await seedPlannerFixture(harness);

    try {
      await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:10:00.000Z"
      });
      const reviewAdvance = await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:11:00.000Z"
      });

      expect(reviewAdvance.kind).toBe("executed");
      if (reviewAdvance.kind !== "executed") {
        throw new TypeError("Expected review execution to run.");
      }

      expect(reviewAdvance.execution.result).toEqual(
        expect.objectContaining({
          kind: "changes_requested",
          capabilityId: "critic.code_review",
          workEpoch: 1,
          attempt: 1
        })
      );
      expect(reviewAdvance.nextPlanning.plan).toEqual(
        expect.objectContaining({
          kind: "execute",
          decision: expect.objectContaining({
            capabilityId: "implement.spec",
            workEpoch: 2
          })
        })
      );
    } finally {
      harness.close();
    }
  });

  it("routes adversarial-test changes requested back to implementing", async () => {
    const harness = await createHarness({
      engine: createScenarioExecutionEngine({
        outcomes: {
          "critic.adversarial_tests:1:1": "changes_requested"
        }
      })
    });
    const seeded = await seedPlannerFixture(harness);

    try {
      await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:20:00.000Z",
        policyId: "backend_strict"
      });
      await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:21:00.000Z",
        policyId: "backend_strict"
      });
      const adversarialAdvance = await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:22:00.000Z",
        policyId: "backend_strict"
      });

      expect(adversarialAdvance.kind).toBe("executed");
      if (adversarialAdvance.kind !== "executed") {
        throw new TypeError("Expected adversarial execution to run.");
      }

      expect(adversarialAdvance.execution.result).toEqual(
        expect.objectContaining({
          kind: "changes_requested",
          capabilityId: "critic.adversarial_tests",
          workEpoch: 1,
          attempt: 1
        })
      );
      expect(adversarialAdvance.nextPlanning.plan).toEqual(
        expect.objectContaining({
          kind: "execute",
          decision: expect.objectContaining({
            capabilityId: "implement.spec",
            workEpoch: 2
          })
        })
      );
    } finally {
      harness.close();
    }
  });

  it("records retryable failures without corrupting current-flow authority", async () => {
    const harness = await createHarness({
      engine: createScenarioExecutionEngine({
        outcomes: {
          "critic.code_review:1:1": "failed"
        }
      })
    });
    const seeded = await seedPlannerFixture(harness);

    try {
      await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:30:00.000Z"
      });
      const hydrationBeforeFailure =
        await harness.routeWorkflowStore.loadWorkflowHydrationState(seeded.workflowId);
      const failedReview = await harness.execution.advanceByWorkflowId({
        workflowId: seeded.workflowId,
        recordedAt: "2026-04-13T08:31:00.000Z"
      });
      const hydrationAfterFailure =
        await harness.routeWorkflowStore.loadWorkflowHydrationState(seeded.workflowId);
      const history = await harness.routeWorkflowStore.listHistory(seeded.workflowId);

      expect(failedReview.kind).toBe("executed");
      if (failedReview.kind !== "executed") {
        throw new TypeError("Expected failed review execution to run.");
      }

      expect(failedReview.execution.result).toEqual(
        expect.objectContaining({
          kind: "failed",
          capabilityId: "critic.code_review",
          workEpoch: 1,
          attempt: 1,
          retryable: true
        })
      );
      expect(failedReview.nextPlanning.plan).toEqual(
        expect.objectContaining({
          kind: "execute",
          decision: expect.objectContaining({
            capabilityId: "critic.code_review",
            workEpoch: 1
          })
        })
      );
      expect(
        hydrationAfterFailure?.snapshot?.projection.currentNode ?? null
      ).toBe(hydrationBeforeFailure?.snapshot?.projection.currentNode ?? null);
      expect(
        hydrationAfterFailure?.snapshot?.projection.pendingCommands.map(
          (command) => command.id
        ) ?? []
      ).toEqual(
        hydrationBeforeFailure?.snapshot?.projection.pendingCommands.map(
          (command) => command.id
        ) ?? []
      );
      expect(listRecordedSignalTypes(history).slice(-2)).toEqual([
        "capability.started",
        "capability.failed"
      ]);
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  engine?: WorkflowCapabilityExecutionEngine<
    SymphonyWorkflowTicketExecutionContract,
    SymphonyCapabilityId,
    SymphonyCapabilityEvidenceId,
    SymphonyCapabilityModelProfileId
  >;
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-capability-execution-"));
  tempDirectories.push(root);
  return await openHarness(root, input);
}

async function openHarness(
  root: string,
  input: {
    engine?: WorkflowCapabilityExecutionEngine<
      SymphonyWorkflowTicketExecutionContract,
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    >;
  } = {}
) {
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
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

  return {
    root,
    database,
    runtimePolicy,
    issueStore: createSymphonyIssueStore(database.db),
    routeWorkflowStore,
    routeWorkflows,
    intake: createSymphonyCapabilityContractIntake({
      routeWorkflows
    }),
    planning,
    execution: createSymphonyCapabilityExecutionService({
      capabilityPlanning: planning,
      routeWorkflowStore,
      routeWorkflows,
      sessionLoader,
      engine: input.engine
    }),
    close() {
      database.close();
    }
  };
}

async function seedPlannerFixture(
  harness: Awaited<ReturnType<typeof openHarness>>
) {
  const issue = buildIssue();
  const router = await createSymphonyCurrentFlowRouterAsync();

  await harness.issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T08:00:00.000Z"
  });

  const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
    trackerIssueId: issue.id,
    issueIdentifier: issue.identifier,
    repositoryKey: "openai/symphony",
    routerPresetId: "current-flow",
    router,
    createdAt: "2026-04-13T08:00:30.000Z"
  });
  const workflowId = ensured.workflow.workflowId;
  const session = await router.startSessionAsync({
    workflowId,
    policy: {}
  });
  const bootstrapResult = await session.receiveAsync(
    createSymphonyCurrentFlowTrackerStateObservedSignal({
      id: "signal_todo_observed_execution",
      occurredAt: "2026-04-13T08:01:00.000Z",
      state: "Todo",
      runId: null,
      runMode: null,
      causationId: null,
      correlationId: issue.identifier
    })
  );
  await harness.routeWorkflows.recordRouteResult({
    workflowId,
    policy: {},
    result: bootstrapResult
  });

  const contract = await harness.intake.createAndPersistForWorkflow({
    workflowId,
    issue,
    repositoryKey: "openai/symphony",
    recordedAt: "2026-04-13T08:02:00.000Z"
  });

  return {
    workflowId,
    issue,
    contract
  };
}

function createScenarioExecutionEngine(input: {
  outcomes: Record<string, "completed" | "changes_requested" | "failed">;
}): WorkflowCapabilityExecutionEngine<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
  return {
    async execute(command) {
      const context = readExecutionContext(command);
      const outcome =
        input.outcomes[
          `${command.payload.capabilityId}:${context.workEpoch}:${context.attempt}`
        ] ?? "completed";

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
          };
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

      throw new TypeError(`Unsupported test outcome ${JSON.stringify(outcome)}.`);
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

function listRecordedSignalTypes(
  history: Awaited<
    ReturnType<Awaited<ReturnType<typeof openHarness>>["routeWorkflowStore"]["listHistory"]>
  >
) {
  return history.reduce<string[]>((types, entry) => {
    if (entry.event.kind !== "signal_recorded") {
      return types;
    }

    types.push(entry.signalType ?? entry.event.signal.type);
    return types;
  }, []);
}

function buildIssue() {
  return buildSymphonyTrackerIssue({
    id: "issue-capability-execution-123",
    identifier: "SYM-CAP-EXEC-123",
    title: "Execute the first in-process capability loop",
    description: createDescription()
  });
}

function createDescription() {
  return [
    "## Objective",
    "Execute the capability loop in-process without external systems.",
    "",
    "## Done Definition",
    "Implementation, review, and adversarial verification route deterministically through persisted capability signals.",
    "",
    "## Merge Policy",
    "manual"
  ].join("\n");
}
