import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createCodexAgentRuntime,
  createGitHubReviewPublisher,
  createLocalWorkspaceBackend,
  createMemorySymphonyTracker,
  createSymphonyRuntime,
  SYMPHONY_CORE_PACKAGE_NAME,
  type AgentRuntime
} from "./index.js";
import { buildSymphonyRepositoryTarget } from "./test-support/build-symphony-repository-target.js";
import { createSymphonyRuntimeCompositionHarness } from "./test-support/create-symphony-runtime-composition-harness.js";
import { buildSymphonyTrackerIssue } from "./test-support/build-symphony-tracker-issue.js";
import { buildSymphonyRuntimeConfig } from "./test-support/build-symphony-runtime-config.js";
import { buildSymphonyWorkflowConfig } from "./test-support/build-symphony-workflow-config.js";

describe("@symphony/core scaffold", () => {
  it("exposes the extraction-ready package name", () => {
    expect(SYMPHONY_CORE_PACKAGE_NAME).toBe("@symphony/core");
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
    const workspaceBackend = createLocalWorkspaceBackend();
    const agentRuntime: AgentRuntime = {
      async startRun() {
        return {
          sessionId: null,
          workerHost: null,
          workspacePath: "/tmp/symphony-runtime"
        };
      },
      async stopRun() {}
    };
    const publish = vi.fn(async (review: { id: string }) => ({
      ok: review.id
    }));
    const runtime = createSymphonyRuntime({
      workflowConfig: buildSymphonyWorkflowConfig(),
      tracker: createMemorySymphonyTracker(),
      workspaceBackend,
      agentRuntime: createCodexAgentRuntime(agentRuntime),
      reviewProvider: {
        resolve(input: string) {
          return input === "publish" ? { id: "review-1" } : null;
        }
      },
      reviewPublisher: {
        publish
      }
    });

    expect(
      workspaceBackend.getWorkspacePath({
        issueIdentifier: "COL-123",
        config: {
          root: "/tmp/symphony-root"
        }
      })
    ).toBe(path.join("/tmp/symphony-root", "symphony-COL-123"));
    expect(
      Object.prototype.hasOwnProperty.call(runtime, "orchestrator")
    ).toBe(false);
    expect(runtime.snapshot()).toEqual(
      expect.objectContaining({
        running: [],
        retrying: []
      })
    );
    expect(await runtime.ingestReview("publish")).toEqual({
      ok: "review-1"
    });
    expect(await runtime.publishReview({
      id: "review-2"
    })).toEqual({
      ok: "review-2"
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
      tracker: createMemorySymphonyTracker(),
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
      })
    });

    await expect(runtime.publishReview({
      id: "review-1"
    })).rejects.toThrow("ReviewPublisher");
    await expect(runtime.ingestReview("publish")).rejects.toThrow(
      "ReviewProvider"
    );
  });

  it("wraps github review publication behind the public publisher facade", async () => {
    const review = {
      repository: "openai/symphony",
      pullRequestNumber: 123,
      body: "Request changes"
    };
    const publish = vi.fn(async (input: typeof review) => ({
      delivered: input.pullRequestNumber
    }));
    const publisher = createGitHubReviewPublisher(publish);

    await expect(publisher.publish(review)).resolves.toEqual({
      delivered: 123
    });
    expect(publish).toHaveBeenCalledWith(review);
  });
});
