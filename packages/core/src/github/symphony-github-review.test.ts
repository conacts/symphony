import { describe, expect, it } from "vitest";
import {
  extractSymphonyGithubReviewSignal,
  SymphonyGithubReviewProcessor
} from "./symphony-github-review.js";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";
import { buildSymphonyTrackerIssue } from "../test-support/build-symphony-tracker-issue.js";
import {
  buildSymphonyGithubIssueCommentEvent,
  buildSymphonyGithubReviewEvent
} from "../test-support/build-symphony-github-review-event.js";

describe("symphony github review policy", () => {
  it("accepts changes_requested reviews and manual /rework comments from allowed logins", () => {
    const baseConfig = buildSymphonyWorkflowConfig();
    const workflowConfig = buildSymphonyWorkflowConfig({
      github: {
        ...baseConfig.github,
        allowedReviewLogins: ["reviewer"],
        allowedReworkCommentLogins: ["reviewer"]
      }
    });

    const reviewSignal = extractSymphonyGithubReviewSignal(
      workflowConfig,
      buildSymphonyGithubReviewEvent()
    );
    const commentSignal = extractSymphonyGithubReviewSignal(
      workflowConfig,
      buildSymphonyGithubIssueCommentEvent()
    );

    expect(reviewSignal?.kind).toBe("changes_requested_review");
    expect(commentSignal?.kind).toBe("manual_rework_comment");
  });

  it("requeues issues in review through tracker state transitions and comments", async () => {
    const baseConfig = buildSymphonyWorkflowConfig();
    const workflowConfig = buildSymphonyWorkflowConfig({
      github: {
        ...baseConfig.github,
        allowedReviewLogins: ["reviewer"],
        allowedReworkCommentLogins: ["reviewer"]
      }
    });

    const tracker = createMemorySymphonyTracker([
      buildSymphonyTrackerIssue({
        state: "In Review"
      })
    ]);

    const processor = new SymphonyGithubReviewProcessor({
      workflowConfig,
      tracker,
      pullRequestResolver: {
        async fetchPullRequest() {
          return {
            headRef: "symphony/COL-123",
            htmlUrl: "https://github.com/openai/symphony/pull/123"
          };
        }
      }
    });

    const result = await processor.processEvent(buildSymphonyGithubReviewEvent());
    expect(result).toEqual({
      status: "requeued",
      issueIdentifier: "COL-123"
    });

    expect(tracker.listOperations()).toEqual([
      {
        kind: "update_state",
        issueId: "issue-123",
        stateName: "Rework"
      },
      {
        kind: "comment",
        issueId: "issue-123",
        body: expect.stringContaining("GitHub review automation moved the ticket")
      }
    ]);
  });

  it("skips auto requeue when the issue is opted out", async () => {
    const baseConfig = buildSymphonyWorkflowConfig();
    const workflowConfig = buildSymphonyWorkflowConfig({
      github: {
        ...baseConfig.github,
        allowedReviewLogins: ["reviewer"]
      }
    });

    const tracker = createMemorySymphonyTracker([
      buildSymphonyTrackerIssue({
        state: "In Review",
        labels: ["symphony:no-auto-rework"]
      })
    ]);

    const processor = new SymphonyGithubReviewProcessor({
      workflowConfig,
      tracker,
      pullRequestResolver: {
        async fetchPullRequest() {
          return null;
        }
      }
    });

    const result = await processor.processEvent(buildSymphonyGithubReviewEvent());
    expect(result).toEqual({
      status: "skipped",
      issueIdentifier: "COL-123",
      reason: "auto_rework_disabled"
    });
  });

  it("acknowledges successful manual /rework requests on GitHub", async () => {
    const baseConfig = buildSymphonyWorkflowConfig();
    const workflowConfig = buildSymphonyWorkflowConfig({
      github: {
        ...baseConfig.github,
        allowedReworkCommentLogins: ["reviewer"]
      }
    });

    const tracker = createMemorySymphonyTracker([
      buildSymphonyTrackerIssue({
        state: "In Review"
      })
    ]);
    const githubComments: Array<{
      repository: string;
      issueNumber: number;
      body: string;
    }> = [];

    const processor = new SymphonyGithubReviewProcessor({
      workflowConfig,
      tracker,
      pullRequestResolver: {
        async fetchPullRequest() {
          return {
            headRef: "symphony/COL-123",
            htmlUrl: "https://github.com/openai/symphony/pull/123"
          };
        },
        async createIssueComment(repository, issueNumber, body) {
          githubComments.push({
            repository,
            issueNumber,
            body
          });
        }
      }
    });

    const result = await processor.processEvent(buildSymphonyGithubIssueCommentEvent());

    expect(result).toEqual({
      status: "requeued",
      issueIdentifier: "COL-123"
    });
    expect(githubComments).toEqual([
      {
        repository: "openai/symphony",
        issueNumber: 123,
        body: "Queued rework via Symphony."
      }
    ]);
  });

  it("does not claim manual /rework was queued when no Symphony issue matches", async () => {
    const baseConfig = buildSymphonyWorkflowConfig();
    const workflowConfig = buildSymphonyWorkflowConfig({
      github: {
        ...baseConfig.github,
        allowedReworkCommentLogins: ["reviewer"]
      }
    });

    const tracker = createMemorySymphonyTracker([]);
    const githubComments: string[] = [];

    const processor = new SymphonyGithubReviewProcessor({
      workflowConfig,
      tracker,
      pullRequestResolver: {
        async fetchPullRequest() {
          return {
            headRef: "symphony/COL-404",
            htmlUrl: "https://github.com/openai/symphony/pull/404"
          };
        },
        async createIssueComment(_repository, _issueNumber, body) {
          githubComments.push(body);
        }
      }
    });

    const result = await processor.processEvent(buildSymphonyGithubIssueCommentEvent());

    expect(result).toEqual({
      status: "skipped",
      issueIdentifier: "COL-404",
      reason: "issue_not_found"
    });
    expect(githubComments).toEqual([]);
  });
});
