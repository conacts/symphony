import { describe, expect, it } from "vitest";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { SymphonyGithubReviewProcessor } from "@symphony/github-review";
import {
  buildSymphonyGitHubIssueCommentPayload,
  buildSymphonyGitHubWebhookHeaders,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue,
  signSymphonyGitHubWebhook
} from "@symphony/test-support";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";

describe("github review ingress", () => {
  it("processes a manual /rework webhook once and suppresses semantic duplicates", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "In Review",
      branchName: "symphony/COL-123"
    });
    const baseRuntimePolicy = buildSymphonyRuntimePolicy();
    const runtimePolicy = {
      ...baseRuntimePolicy,
      github: {
        ...baseRuntimePolicy.github,
        repo: "openai/symphony",
        webhookSecret: "secret",
        allowedReworkCommentLogins: ["reviewer"]
      }
    };
    const tracker = createMemorySymphonyTracker([issue]);
    const processedResults: Array<{
      status: string;
      issueIdentifier?: string | null;
    }> = [];
    let refreshCount = 0;

    const ingress = createSymphonyGitHubReviewIngressService({
      githubPolicy: runtimePolicy.github,
      reviewProcessor: new SymphonyGithubReviewProcessor({
        policyConfig: {
          tracker: runtimePolicy.tracker,
          github: runtimePolicy.github
        },
        tracker,
        pullRequestResolver: {
          async fetchPullRequest() {
            return {
              headRef: issue.branchName ?? `symphony/${issue.identifier}`,
              htmlUrl: "https://github.com/openai/symphony/pull/123"
            };
          },
          async createIssueComment() {}
        }
      }),
      async onProcessed(result) {
        processedResults.push(result);
        if (result.status === "requeued") {
          refreshCount += 1;
        }
      }
    });

    const rawBody = JSON.stringify(buildSymphonyGitHubIssueCommentPayload());
    const signature = signSymphonyGitHubWebhook(rawBody, "secret");

    const first = await ingress.ingest({
      headers: buildSymphonyGitHubWebhookHeaders({
        xGitHubDelivery: "delivery-1",
        xGitHubEvent: "issue_comment",
        xHubSignature256: signature
      }),
      body: JSON.parse(rawBody),
      rawBody
    });
    const duplicateSemantic = await ingress.ingest({
      headers: buildSymphonyGitHubWebhookHeaders({
        xGitHubDelivery: "delivery-2",
        xGitHubEvent: "issue_comment",
        xHubSignature256: signature
      }),
      body: JSON.parse(rawBody),
      rawBody
    });

    expect(first).toMatchObject({
      accepted: true,
      persisted: true,
      duplicate: null,
      event: "issue_comment",
      repository: "openai/symphony"
    });
    expect(duplicateSemantic).toMatchObject({
      accepted: true,
      persisted: false,
      duplicate: "semantic"
    });
    expect(processedResults).toHaveLength(1);
    expect(processedResults[0]).toMatchObject({
      status: "requeued",
      issueIdentifier: issue.identifier
    });
    expect(refreshCount).toBe(1);
  });
});
