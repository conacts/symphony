import { describe, expect, it, vi } from "vitest";
import {
  buildSymphonyRuntimePolicy,
  createTestWorkspaceBackend
} from "@symphony/test-support";
import {
  createAgentRuntime,
  type SymphonyDispatchBootstrapRouter,
  type SymphonyRunLifecycleRouter,
  type SymphonyRunStartActivationRouter
} from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { createSymphonyRuntime } from "./symphony-runtime.js";

const inertTracker = {
  async fetchCandidateIssues() {
    return [];
  },
  async fetchIssuesByStates() {
    return [];
  },
  async fetchIssueStatesByIds() {
    return [];
  },
  async fetchIssueByIdentifier() {
    return null;
  },
  async createComment() {
    return;
  },
  async updateIssueState() {
    return;
  }
};

const inertLifecycleRouting: {
  dispatchBootstrapRouter: SymphonyDispatchBootstrapRouter;
  runStartActivationRouter: SymphonyRunStartActivationRouter;
  runLifecycleRouter: SymphonyRunLifecycleRouter;
} = {
  dispatchBootstrapRouter: {
    route(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue,
        runMode: "implementation" as const
      };
    }
  },
  runStartActivationRouter: {
    activate(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue
      };
    }
  },
  runLifecycleRouter: {
    observeIssueState(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue
      };
    },
    routeCompletion(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue
      };
    }
  }
};

describe("symphony runtime review seam", () => {
  it("runs reviews through the explicit provider and publisher contracts", async () => {
    const provider = {
      review: vi.fn(async (request: { issueId: string }) => ({
        summary: `Review for ${request.issueId}`,
        findings: [
          {
            title: "Missing check",
            body: "Add a guard before dispatch."
          }
        ]
      }))
    };
    const publisher = {
      publishReview: vi.fn(async (review) => ({
        deliveredFindings: review.findings.length
      }))
    };
    const runtime = createSymphonyRuntime({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      tracker: inertTracker,
      workspaceBackend: createTestWorkspaceBackend(),
      agentRuntime: createAgentRuntime({
        async startRun() {
          return {
            threadId: null,
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {}
      }),
      ...inertLifecycleRouting,
      reviewProvider: provider,
      reviewPublisher: publisher
    });

    await expect(runtime.runReview({ issueId: "COL-123" })).resolves.toEqual({
      deliveredFindings: 1
    });
    expect(provider.review).toHaveBeenCalledWith({
      issueId: "COL-123"
    });
    expect(publisher.publishReview).toHaveBeenCalledWith({
      summary: "Review for COL-123",
      findings: [
        {
          title: "Missing check",
          body: "Add a guard before dispatch."
        }
      ]
    });
  });

  it("returns null when the explicit review provider skips publication", async () => {
    const runtime = createSymphonyRuntime({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      tracker: inertTracker,
      workspaceBackend: createTestWorkspaceBackend(),
      agentRuntime: createAgentRuntime({
        async startRun() {
          return {
            threadId: null,
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {}
      }),
      ...inertLifecycleRouting,
      reviewProvider: {
        review: vi.fn(async () => null)
      },
      reviewPublisher: {
        async publishReview(review) {
          return {
            delivered: review.findings.length
          };
        }
      }
    });

    await expect(runtime.runReview("skip")).resolves.toBeNull();
  });

  it("fails fast when lifecycle routing adapters are omitted", () => {
    expect(() =>
      createSymphonyRuntime({
        runtimePolicy: buildSymphonyRuntimePolicy(),
        tracker: inertTracker,
        workspaceBackend: createTestWorkspaceBackend(),
        agentRuntime: createAgentRuntime({
          async startRun() {
            return {
              threadId: null,
              workerHost: null,
              launchTarget: null
            };
          },
          async stopRun() {}
        }),
        dispatchBootstrapRouter: undefined as never,
        runStartActivationRouter: inertLifecycleRouting.runStartActivationRouter,
        runLifecycleRouter: inertLifecycleRouting.runLifecycleRouter
      })
    ).toThrow(/dispatch bootstrap router/i);
  });
});
