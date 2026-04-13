import { afterEach, describe, expect, it } from "vitest";
import {
  CapabilityRouterProofHarness,
  createCapabilityScenarioExecutionEngine
} from "../test-support/capability-router-proof-harness.js";
import {
  expectRouteWorkflowAuthorityProof
} from "../test-support/route-workflow-authority-test-support.js";

let harness: CapabilityRouterProofHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("Symphony capability router proof harness", () => {
  it("proves the happy path through implement, review, adversarial tests, and the completion gate", async () => {
    harness = await CapabilityRouterProofHarness.create();
    const lifecycleAuthority = await harness.loadLifecycleAuthority();

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T09:10:00.000Z",
      policyId: "backend_strict"
    });
    const review = await harness.advance({
      recordedAt: "2026-04-13T09:11:00.000Z",
      policyId: "backend_strict"
    });
    const adversarial = await harness.advance({
      recordedAt: "2026-04-13T09:12:00.000Z",
      policyId: "backend_strict"
    });
    const projection = await harness.projection();
    const plannerCommands = await harness.listPlannerCommands();

    expect(implementation.kind).toBe("executed");
    expect(review.kind).toBe("executed");
    expect(adversarial.kind).toBe("executed");
    if (adversarial.kind !== "executed") {
      throw new TypeError("Expected adversarial execution to run.");
    }

    expect(adversarial.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "ready_for_manual_completion",
        evaluation: expect.objectContaining({
          workEpoch: 1,
          result: "ready_for_manual_completion",
          missingCapabilityIds: [],
          missingEvidenceIds: []
        })
      })
    );
    expect(plannerCommands).toHaveLength(3);
    expect(await harness.listRecordedSignalTypes()).toEqual([
      "tracker.state_observed",
      "capability.started",
      "capability.completed",
      "capability.started",
      "capability.completed",
      "capability.started",
      "capability.completed"
    ]);
    expect(projection.evidenceByEpoch).toEqual([
      expect.objectContaining({
        workEpoch: 1,
        stale: false,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "change_set"
          }),
          expect.objectContaining({
            evidenceId: "code_review_report"
          }),
          expect.objectContaining({
            evidenceId: "adversarial_test_report"
          })
        ])
      })
    ]);

    await expectRouteWorkflowAuthorityProof({
      routeWorkflows: harness.routeWorkflows,
      issueIdentifier: harness.issueIdentifier,
      currentNode: lifecycleAuthority.currentNode,
      pendingCommandIds: lifecycleAuthority.pendingCommandIds,
      signalType: "capability.completed",
      reasonCode: "no_matching_edge"
    });
  });

  it("proves review changes requested routes back to implementing", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "critic.code_review:1:1": "changes_requested"
          }
        })
    });

    await harness.advance({
      recordedAt: "2026-04-13T09:20:00.000Z"
    });
    const reviewAdvance = await harness.advance({
      recordedAt: "2026-04-13T09:21:00.000Z"
    });
    const projection = await harness.projection();

    expect(reviewAdvance.kind).toBe("executed");
    if (reviewAdvance.kind !== "executed") {
      throw new TypeError("Expected review execution to run.");
    }

    expect(reviewAdvance.execution.result).toEqual(
      expect.objectContaining({
        kind: "changes_requested",
        capabilityId: "critic.code_review",
        workEpoch: 1
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
    expect(projection.workEpoch).toBe(1);
    expect(projection.latestAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: "critic.code_review",
          status: "changes_requested"
        })
      ])
    );
  });

  it("proves adversarial changes requested routes back to implementing", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "critic.adversarial_tests:1:1": "changes_requested"
          }
        })
    });

    await harness.advance({
      recordedAt: "2026-04-13T09:30:00.000Z",
      policyId: "backend_strict"
    });
    await harness.advance({
      recordedAt: "2026-04-13T09:31:00.000Z",
      policyId: "backend_strict"
    });
    const adversarialAdvance = await harness.advance({
      recordedAt: "2026-04-13T09:32:00.000Z",
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
        workEpoch: 1
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

  it("proves clarification blocks routing until input is answered", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "clarification_requested"
          }
        })
    });

    const advanced = await harness.advance({
      recordedAt: "2026-04-13T09:40:00.000Z"
    });
    const projection = await harness.projection();

    expect(advanced.kind).toBe("executed");
    if (advanced.kind !== "executed") {
      throw new TypeError("Expected implementation execution to run.");
    }

    expect(advanced.execution.result).toEqual(
      expect.objectContaining({
        kind: "clarification_requested",
        capabilityId: "implement.spec"
      })
    );
    expect(advanced.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "awaiting_input",
        clarification: expect.objectContaining({
          raisedByCapabilityId: "implement.spec",
          workEpoch: 1
        })
      })
    );
    expect(projection.phase).toBe("waiting_input");
    expect(projection.pendingClarification).toEqual(
      expect.objectContaining({
        raisedByCapabilityId: "implement.spec"
      })
    );
  });

  it("proves restart mid-verification reuses persisted planner state and resumes routing", async () => {
    harness = await CapabilityRouterProofHarness.create();
    const lifecycleAuthority = await harness.loadLifecycleAuthority();

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T09:50:00.000Z",
      policyId: "backend_strict"
    });
    expect(implementation.kind).toBe("executed");
    if (implementation.kind !== "executed") {
      throw new TypeError("Expected implementation execution to run.");
    }

    const plannedBeforeRestart = implementation.nextPlanning;
    await harness.restart();
    const plannedAfterRestart = await harness.plan({
      recordedAt: "2026-04-13T09:51:00.000Z",
      policyId: "backend_strict"
    });
    const reviewAdvance = await harness.advance({
      recordedAt: "2026-04-13T09:52:00.000Z",
      policyId: "backend_strict"
    });

    expect(plannedAfterRestart.reused).toBe(true);
    expect(plannedAfterRestart.decision).toEqual(plannedBeforeRestart.decision);
    expect(plannedAfterRestart.command).toEqual(plannedBeforeRestart.command);
    expect(reviewAdvance.kind).toBe("executed");
    if (reviewAdvance.kind !== "executed") {
      throw new TypeError("Expected review execution to run after restart.");
    }
    expect(reviewAdvance.planning.reused).toBe(true);
    expect(reviewAdvance.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.adversarial_tests",
          workEpoch: 1
        })
      })
    );

    await expectRouteWorkflowAuthorityProof({
      routeWorkflows: harness.routeWorkflows,
      issueIdentifier: harness.issueIdentifier,
      currentNode: lifecycleAuthority.currentNode,
      pendingCommandIds: lifecycleAuthority.pendingCommandIds,
      signalType: "capability.completed",
      reasonCode: "no_matching_edge"
    });
  });

  it("proves stale prior-epoch evidence does not satisfy the next epoch", async () => {
    harness = await CapabilityRouterProofHarness.create({
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "critic.adversarial_tests:1:1": "changes_requested"
          }
        })
    });

    await harness.advance({
      recordedAt: "2026-04-13T10:00:00.000Z",
      policyId: "backend_strict"
    });
    await harness.advance({
      recordedAt: "2026-04-13T10:01:00.000Z",
      policyId: "backend_strict"
    });
    const adversarialChanges = await harness.advance({
      recordedAt: "2026-04-13T10:02:00.000Z",
      policyId: "backend_strict"
    });
    const reimplementation = await harness.advance({
      recordedAt: "2026-04-13T10:03:00.000Z",
      policyId: "backend_strict"
    });
    const projection = await harness.projection();

    expect(adversarialChanges.kind).toBe("executed");
    expect(reimplementation.kind).toBe("executed");
    if (reimplementation.kind !== "executed") {
      throw new TypeError("Expected reimplementation execution to run.");
    }

    expect(reimplementation.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          workEpoch: 2
        })
      })
    );
    expect(projection.evidenceByEpoch).toEqual([
      expect.objectContaining({
        workEpoch: 1,
        stale: true,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "change_set"
          }),
          expect.objectContaining({
            evidenceId: "code_review_report"
          })
        ])
      }),
      expect.objectContaining({
        workEpoch: 2,
        stale: false,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "change_set"
          })
        ])
      })
    ]);
    expect(projection.workEpoch).toBe(2);
  });
});
