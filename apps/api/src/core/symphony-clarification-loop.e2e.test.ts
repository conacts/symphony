import { afterEach, describe, expect, it } from "vitest";
import {
  CapabilityRouterProofHarness,
  createCapabilityScenarioExecutionEngine
} from "../test-support/capability-router-proof-harness.js";

let harness: CapabilityRouterProofHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("clarification loop golden paths", () => {
  it("resumes the same capability after clarification is answered", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "clarification_requested",
            "implement.spec:1:2": "completed"
          }
        })
    });

    const clarificationAdvance = await harness.advance({
      recordedAt: "2026-04-13T10:20:00.000Z"
    });

    expect(clarificationAdvance.kind).toBe("executed");
    if (clarificationAdvance.kind !== "executed") {
      throw new TypeError("Expected clarification advance to execute.");
    }

    expect(clarificationAdvance.execution.result).toEqual(
      expect.objectContaining({
        kind: "clarification_requested",
        capabilityId: "implement.spec"
      })
    );
    expect(clarificationAdvance.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "awaiting_input"
      })
    );

    const projectionAfterClarification = await harness.projection();
    expect(projectionAfterClarification.pendingClarification).toEqual(
      expect.objectContaining({
        raisedByCapabilityId: "implement.spec",
        workEpoch: 1
      })
    );
    expect(projectionAfterClarification.latestAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1,
          attempt: 1,
          status: "clarification_requested"
        })
      ])
    );

    await harness.answerPendingClarification({
      recordedAt: "2026-04-13T10:21:00.000Z",
      answers: {
        question_1: "Use the strict JSON contract and proceed."
      }
    });

    const resumedAdvance = await harness.advance({
      recordedAt: "2026-04-13T10:22:00.000Z"
    });

    expect(resumedAdvance.kind).toBe("executed");
    if (resumedAdvance.kind !== "executed") {
      throw new TypeError("Expected resumed advance to execute.");
    }

    expect(resumedAdvance.planning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1
        })
      })
    );
    expect(resumedAdvance.execution.result).toEqual(
      expect.objectContaining({
        kind: "completed",
        capabilityId: "implement.spec",
        workEpoch: 1,
        attempt: 2
      })
    );
    expect(resumedAdvance.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          workEpoch: 1
        })
      })
    );

    const projectionAfterResume = await harness.projection();
    expect(projectionAfterResume.pendingClarification).toBeNull();
    expect(projectionAfterResume.latestAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1,
          attempt: 2,
          status: "completed"
        })
      ])
    );

    const signalTypes = await harness.listRecordedSignalTypes();
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        "capability.started",
        "workflow.clarification_requested",
        "workflow.clarification_answered",
        "capability.completed"
      ])
    );
    expect(resumedAdvance.nextPlanning.plan.kind).not.toBe("awaiting_input");
  });
});
