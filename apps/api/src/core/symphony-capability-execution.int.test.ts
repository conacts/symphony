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

describe("Symphony capability execution", () => {
  it("records implementation completion and routes the next plan to code review", async () => {
    harness = await CapabilityRouterProofHarness.create();

    const advanced = await harness.advance({
      recordedAt: "2026-04-13T08:03:00.000Z"
    });
    const projection = await harness.projection();

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
    expect((await harness.listRecordedSignalTypes()).slice(-2)).toEqual([
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
  });

  it("routes code-review changes requested back to implementing", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "critic.code_review:1:1": "changes_requested"
          }
        })
    });

    await harness.advance({
      recordedAt: "2026-04-13T08:10:00.000Z"
    });
    const reviewAdvance = await harness.advance({
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
  });

  it("routes adversarial-test changes requested back to implementing", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "critic.adversarial_tests:1:1": "changes_requested"
          }
        })
    });

    await harness.advance({
      recordedAt: "2026-04-13T08:20:00.000Z",
      policyId: "backend_strict"
    });
    await harness.advance({
      recordedAt: "2026-04-13T08:21:00.000Z",
      policyId: "backend_strict"
    });
    const adversarialAdvance = await harness.advance({
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
  });

  it("records retryable failures without corrupting current-flow authority", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "critic.code_review:1:1": "failed"
          }
        })
    });

    await harness.advance({
      recordedAt: "2026-04-13T08:30:00.000Z"
    });
    const authorityBeforeFailure = await harness.loadLifecycleAuthority();
    const failedReview = await harness.advance({
      recordedAt: "2026-04-13T08:31:00.000Z"
    });
    const authorityAfterFailure = await harness.loadLifecycleAuthority();

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
    expect(authorityAfterFailure).toEqual(authorityBeforeFailure);
    expect((await harness.listRecordedSignalTypes()).slice(-2)).toEqual([
      "capability.started",
      "capability.failed"
    ]);
  });

  it("retries the same capability after clarification is answered", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "clarification_requested",
            "implement.spec:1:2": "failed"
          }
        })
    });

    const clarificationAdvance = await harness.advance({
      recordedAt: "2026-04-13T08:40:00.000Z"
    });
    await harness.answerPendingClarification({
      recordedAt: "2026-04-13T08:41:00.000Z",
      answers: {
        question_1: "Prove the strict JSON response contract."
      }
    });
    const resumedAdvance = await harness.advance({
      recordedAt: "2026-04-13T08:42:00.000Z"
    });
    const projection = await harness.projection();

    expect(clarificationAdvance.kind).toBe("executed");
    if (clarificationAdvance.kind !== "executed") {
      throw new TypeError("Expected clarification execution to run.");
    }

    expect(resumedAdvance.kind).toBe("executed");
    if (resumedAdvance.kind !== "executed") {
      throw new TypeError("Expected resumed execution to run.");
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
        kind: "failed",
        capabilityId: "implement.spec",
        workEpoch: 1,
        attempt: 2,
        retryable: true
      })
    );
    expect(resumedAdvance.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1
        })
      })
    );
    expect(projection.pendingClarification).toBeNull();
  });
});
