import { describe, expect, it } from "vitest";
import { SymphonyGithubReviewProcessor } from "@symphony/github-review";
import {
  buildSymphonyManualReworkIngressFixture
} from "@symphony/test-support";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";

describe("github review ingress", () => {
  it("processes a manual /rework webhook once and suppresses semantic duplicates", async () => {
    const fixture = buildSymphonyManualReworkIngressFixture();
    const processedResults: Array<{
      status: string;
      issueIdentifier?: string | null;
    }> = [];
    let refreshCount = 0;

    const ingress = createSymphonyGitHubReviewIngressService({
      githubPolicy: fixture.runtimePolicy.github,
      reviewProcessor: new SymphonyGithubReviewProcessor({
        policyConfig: {
          tracker: fixture.runtimePolicy.tracker,
          github: fixture.runtimePolicy.github
        },
        tracker: fixture.tracker,
        pullRequestResolver: {
          async fetchPullRequest() {
            return {
              headRef:
                fixture.issue.branchName ??
                `symphony/${fixture.issue.identifier}`,
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

    const first = await ingress.ingest(fixture.firstRequest);
    const duplicateSemantic = await ingress.ingest(fixture.duplicateRequest);

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
      issueIdentifier: fixture.issue.identifier
    });
    expect(refreshCount).toBe(1);
  });
});
