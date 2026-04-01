import { describe, expect, it, vi } from "vitest";
import { createLocalWorkspaceBackend } from "../workspace/workspace-backend.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";
import { createCodexAgentRuntime } from "./agent-runtime.js";
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
      workflowConfig: buildSymphonyWorkflowConfig(),
      tracker: inertTracker,
      workspaceBackend: createLocalWorkspaceBackend(),
      agentRuntime: createCodexAgentRuntime({
        async startRun() {
          return {
            sessionId: null,
            workerHost: null,
            workspacePath: "/tmp/symphony-runtime"
          };
        },
        async stopRun() {}
      }),
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

  it("adapts transitional resolve and publish callbacks behind the new runtime methods", async () => {
    const runtime = createSymphonyRuntime({
      workflowConfig: buildSymphonyWorkflowConfig(),
      tracker: inertTracker,
      workspaceBackend: createLocalWorkspaceBackend(),
      agentRuntime: createCodexAgentRuntime({
        async startRun() {
          return {
            sessionId: null,
            workerHost: null,
            workspacePath: "/tmp/symphony-runtime"
          };
        },
        async stopRun() {}
      }),
      reviewProvider: {
        resolve(input: string) {
          return input === "skip"
            ? null
            : {
                findings: [
                  {
                    title: "Legacy input",
                    body: input
                  }
                ]
              };
        }
      },
      reviewPublisher: {
        publish(review) {
          return {
            delivered: review.findings.length
          };
        }
      }
    });

    await expect(runtime.runReview("legacy")).resolves.toEqual({
      delivered: 1
    });
    await expect(runtime.ingestReview("skip")).resolves.toBeNull();
  });
});
