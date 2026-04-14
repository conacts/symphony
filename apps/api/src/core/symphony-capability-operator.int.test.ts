import { afterEach, describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimePolicy
} from "@symphony/test-support";
import {
  createRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import {
  createSymphonyCapabilityOperatorService
} from "./symphony-capability-operator.js";
import {
  createSymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  CapabilityRouterProofHarness,
  createCapabilityScenarioExecutionEngine
} from "../test-support/capability-router-proof-harness.js";

let harness: CapabilityRouterProofHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("Symphony capability operator service", () => {
  it("inspects awaiting-input planner state by issue identifier", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "clarification_requested"
          }
        })
    });
    await harness.advance({
      recordedAt: "2026-04-13T19:00:00.000Z"
    });
    const operator = await createOperatorService();

    const capability = await operator.inspectByIssueIdentifier({
      issueIdentifier: harness.issueIdentifier,
      recordedAt: "2026-04-13T19:00:01.000Z"
    });

    expect(capability).toEqual(
      expect.objectContaining({
        planKind: "awaiting_input",
        capabilityId: "implement.spec",
        workEpoch: 1,
        pendingClarification: expect.objectContaining({
          requestId: expect.stringContaining("clarify_"),
          answerPath: `/api/v1/${harness.issueIdentifier}/clarification-answer`,
          questions: [
            expect.objectContaining({
              id: "question_1"
            })
          ]
        })
      })
    );
  });

  it("records clarification answers and returns the replanned capability state", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "clarification_requested"
          }
        })
    });
    await harness.advance({
      recordedAt: "2026-04-13T19:10:00.000Z"
    });
    const operator = await createOperatorService();
    const pending = await operator.inspectByIssueIdentifier({
      issueIdentifier: harness.issueIdentifier,
      recordedAt: "2026-04-13T19:10:01.000Z"
    });

    if (!pending || pending.pendingClarification === null) {
      throw new TypeError("Expected a pending clarification.");
    }

    const answered = await operator.answerPendingClarificationByWorkflowId({
      workflowId: pending.workflowId,
      recordedAt: "2026-04-13T19:10:02.000Z",
      requestId: pending.pendingClarification.requestId,
      answers: {
        question_1: "Prove the strict backend behavior."
      }
    });

    expect(answered).toEqual(
      expect.objectContaining({
        issueIdentifier: harness.issueIdentifier,
        requestId: pending.pendingClarification.requestId,
        capability: expect.objectContaining({
          planKind: "execute",
          capabilityId: "implement.spec",
          workEpoch: 1,
          pendingClarification: null
        })
      })
    );
  });
});

async function createOperatorService() {
  if (!harness) {
    throw new TypeError("Harness is required.");
  }

  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows: harness.routeWorkflows,
    trackerConfig: buildSymphonyRuntimePolicy().tracker
  });
  const capabilityPlanning = createSymphonyCapabilityPlanningService({
    routeWorkflowStore: harness.routeWorkflowStore
  });

  return createSymphonyCapabilityOperatorService({
    routeWorkflowStore: harness.routeWorkflowStore,
    routeWorkflows: harness.routeWorkflows,
    sessionLoader,
    capabilityPlanning
  });
}
