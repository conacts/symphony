import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createWorkflowRouterComparison,
  InvalidRouterComparisonError
} from "../index.js";
import type { WorkflowJournalEvent } from "../index.js";
import {
  createWorkflowRouterTestBuilder,
  recordDecisionEvent
} from "../testing/workflow-router-test-kit.js";
import type { WorkflowSignal } from "../types/index.js";

type ComparisonNode =
  | "queued"
  | "review"
  | "done";

type ComparisonData = {
  reviewSignals: string[];
};

type ComparisonPolicy = {
  allowApproval: boolean;
};

const seededReviewHistory: WorkflowJournalEvent<ComparisonNode>[] = [
  recordDecisionEvent(
    {
      id: "decision_seed_review",
      fromNode: "queued",
      toNode: "review",
      edgeId: "seed_review",
      reasonCode: "seeded_review",
      commands: [],
      trace: [],
      selectionMetadata: null
    },
    "2026-04-09T23:00:00.000Z"
  )
];

async function createReviewRouter() {
  return await Effect.runPromise(
    createWorkflowRouterTestBuilder<
      ComparisonNode,
      ComparisonData,
      ComparisonPolicy
    >()
      .named("review-router")
      .startingAt("queued")
      .withInitialData({
        reviewSignals: []
      })
      .withNode("queued")
      .withNode("review")
      .withNode("done", {
        terminal: true
      })
      .withEdge({
        id: "review_to_done",
        from: "review",
        to: "done",
        reasonCode: "approved",
        guard: ({ signal, policy }) =>
          signal.type === "review.approved" && policy.allowApproval
      })
      .withReducer(({ data, event }) =>
        event.kind === "signal_recorded"
          ? {
              ...data,
              reviewSignals: [...data.reviewSignals, event.signal.type]
            }
          : data
      )
      .withRouterOptions({
        now: () => new Date("2026-04-09T23:30:00.000Z"),
        createId: (prefix) => `${prefix}_comparison`
      })
      .build()
  );
}

function createComparisonSignal(
  overrides: Partial<WorkflowSignal> & Pick<WorkflowSignal, "type" | "source" | "payload">
): WorkflowSignal {
  return {
    id: overrides.id ?? "signal_comparison",
    type: overrides.type,
    source: overrides.source,
    occurredAt: overrides.occurredAt ?? "2026-04-09T23:30:00.000Z",
    causationId: overrides.causationId ?? null,
    correlationId: overrides.correlationId ?? null,
    payload: overrides.payload
  };
}

describe("WorkflowRouterComparison", () => {
  it("records simulation steps while replaying a signal stream", async () => {
    const router = await createReviewRouter();

    const simulation = await Effect.runPromise(
      router.simulate({
        workflowId: "SYM-200",
        history: seededReviewHistory,
        signals: [
          createComparisonSignal({
            type: "review.approved",
            source: "review",
            payload: null
          })
        ],
        policy: {
          allowApproval: true
        }
      })
    );

    expect(simulation.steps).toHaveLength(1);
    expect(simulation.steps[0]?.result.decision.reasonCode).toBe("approved");
    expect(simulation.projection.currentNode).toBe("done");
  });

  it("compares multiple router candidates and reports divergence", async () => {
    const router = await createReviewRouter();
    const comparison = await Effect.runPromise(
      createWorkflowRouterComparison({
        candidates: [
          {
            id: "auto-approve",
            router,
            history: seededReviewHistory,
            policy: {
              allowApproval: true
            }
          },
          {
            id: "manual-review",
            router,
            history: seededReviewHistory,
            policy: {
              allowApproval: false
            }
          }
        ]
      })
    );

    const result = await Effect.runPromise(
      comparison.compare({
        workflowId: "SYM-201",
        signals: [
          createComparisonSignal({
            type: "review.approved",
            source: "review",
            payload: null
          })
        ]
      })
    );

    expect(result.entries).toHaveLength(2);
    expect(result.summary.diverged).toBe(true);
    expect(result.summary.finalNodeByCandidate).toEqual({
      "auto-approve": "done",
      "manual-review": "review"
    });
    expect(result.summary.reasonCodesByCandidate).toEqual({
      "auto-approve": ["approved"],
      "manual-review": ["no_matching_edge"]
    });
  });

  it("rejects empty comparison definitions", async () => {
    await expect(
      Effect.runPromise(
        Effect.flip(
          createWorkflowRouterComparison<ComparisonNode, ComparisonData, ComparisonPolicy>({
            candidates: []
          })
        )
      )
    ).resolves.toBeInstanceOf(InvalidRouterComparisonError);
  });
});
