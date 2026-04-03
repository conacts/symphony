import { describe, expect, it, vi } from "vitest";
import * as core from "./index.js";
import {
  createCodexAgentRuntime,
  createDockerWorkspaceBackend,
  createGitHubReviewPublisher,
  createSymphonyRuntime,
  type AgentRuntime
} from "./index.js";
import { buildSymphonyRepositoryTarget } from "./test-support/build-symphony-repository-target.js";
import { createSymphonyRuntimeCompositionHarness } from "./test-support/create-symphony-runtime-composition-harness.js";
import { createTestWorkspaceBackend } from "./test-support/create-test-workspace-backend.js";
import { buildSymphonyTrackerIssue } from "./test-support/build-symphony-tracker-issue.js";
import { buildSymphonyRuntimeConfig } from "./test-support/build-symphony-runtime-config.js";
import { buildSymphonyWorkflowConfig } from "./test-support/build-symphony-workflow-config.js";

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

describe("@symphony/core scaffold", () => {
  it("keeps the default runtime barrel focused on the happy path", () => {
    expect(core).toMatchObject({
      createCodexAgentRuntime,
      createDockerWorkspaceBackend,
      createGitHubReviewPublisher,
      createSymphonyRuntime
    });
    expect("SYMPHONY_CORE_PACKAGE_NAME" in core).toBe(false);
  });

  it("ships deterministic local builders for future boundary tests", () => {
    const repositoryTarget = buildSymphonyRepositoryTarget({
      slug: "symphony"
    });
    const runtimeConfig = buildSymphonyRuntimeConfig({
      repositoryTarget
    });

    expect(runtimeConfig.repositoryTarget.slug).toBe("symphony");
    expect(runtimeConfig.pollIntervalMs).toBe(5_000);
    expect(runtimeConfig.realtimeEnabled).toBe(true);
  });

  it("ships deterministic builders for workflow and tracker core modules", () => {
    const workflowConfig = buildSymphonyWorkflowConfig();
    const issue = buildSymphonyTrackerIssue();

    expect(workflowConfig.tracker.projectSlug).toBe("coldets");
    expect(issue.identifier).toBe("COL-123");
  });

  it("ships the new public facade without changing orchestrator composition", async () => {
    const workspaceBackend = createTestWorkspaceBackend();
    const agentRuntime: AgentRuntime = {
      async startRun() {
        return {
          sessionId: null,
          workerHost: null,
          launchTarget: null
        };
      },
      async stopRun() {}
    };
    const publish = vi.fn(async (review: { findings: Array<unknown> }) => ({
      ok: review.findings.length
    }));
    const runtime = createSymphonyRuntime({
      workflowConfig: buildSymphonyWorkflowConfig(),
      tracker: inertTracker,
      workspaceBackend,
      agentRuntime: createCodexAgentRuntime(agentRuntime),
      reviewProvider: {
        review(input: string) {
          return input === "publish"
            ? {
                summary: "Review for COL-123",
                findings: [
                  {
                    title: "Missing guard",
                    body: "Add a validation check."
                  }
                ]
              }
            : null;
        }
      },
      reviewPublisher: {
        publishReview: publish
      }
    });

    expect("getWorkspacePath" in workspaceBackend).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(runtime, "orchestrator")
    ).toBe(false);
    expect(runtime.snapshot()).toEqual(
      expect.objectContaining({
        running: [],
        retrying: []
      })
    );
    expect(await runtime.runReview("publish")).toEqual({
      ok: 1
    });
    expect(await runtime.publishReview({
      findings: [
        {
          title: "Manual finding",
          body: "Handle the explicit publish path."
        }
      ]
    })).toEqual({
      ok: 1
    });
    expect(await runtime.ingestReview("skip")).toBeNull();
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("drives dispatch and completion through the public runtime facade", async () => {
    const harness = await createSymphonyRuntimeCompositionHarness();

    try {
      await harness.runtime.runPollCycle();
      harness.runtime.applyAgentUpdate("issue-123", {
        event: "notification",
        payload: {
          method: "thread/tokenUsage/updated",
          params: {
            tokenUsage: {
              total: {
                inputTokens: 12,
                outputTokens: 4,
                totalTokens: 16
              }
            }
          }
        },
        timestamp: "2026-03-31T00:00:02.000Z",
        codexAppServerPid: "4242"
      });
      harness.runtime.applyAgentUpdate("issue-123", {
        event: "turn_completed",
        payload: {
          usage: {
            input_tokens: 12,
            output_tokens: 4,
            total_tokens: 16
          }
        },
        timestamp: "2026-03-31T00:00:03.000Z"
      });
      await harness.runtime.handleRunCompletion("issue-123", {
        kind: "normal"
      });

      expect(harness.launchRecords).toEqual([
        expect.objectContaining({
          attempt: 0,
          issueId: "issue-123"
        })
      ]);
      expect(harness.runtime.snapshot().running).toHaveLength(0);
      expect(harness.runtime.snapshot().retrying[0]?.delayType).toBe(
        "continuation"
      );
      expect(harness.runtime.snapshot().codexTotals.totalTokens).toBe(16);
    } finally {
      await harness.cleanup();
    }
  });

  it("fails fast when review methods are called without review wiring", async () => {
    const runtime = createSymphonyRuntime({
      workflowConfig: buildSymphonyWorkflowConfig(),
      tracker: inertTracker,
      workspaceBackend: createTestWorkspaceBackend(),
      agentRuntime: createCodexAgentRuntime({
        async startRun() {
          return {
            sessionId: null,
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {}
      })
    });

    await expect(
      runtime.publishReview({
        findings: [
          {
            title: "Missing guard",
            body: "Add a validation check."
          }
        ]
      })
    ).rejects.toThrow("ReviewPublisher");
    await expect(runtime.runReview("publish")).rejects.toThrow(
      "ReviewProvider"
    );
  });

  it("wraps github review publication behind the public publisher facade", async () => {
    const review = {
      repository: "openai/symphony",
      pullRequestNumber: 123,
      findings: [
        {
          title: "Request changes",
          body: "Add the missing guard before dispatch."
        }
      ]
    };
    const publish = vi.fn(async (input: typeof review) => ({
      delivered: input.pullRequestNumber
    }));
    const publisher = createGitHubReviewPublisher(publish);

    await expect(publisher.publishReview(review)).resolves.toEqual({
      delivered: 123
    });
    expect(publish).toHaveBeenCalledWith(review);
  });
});
