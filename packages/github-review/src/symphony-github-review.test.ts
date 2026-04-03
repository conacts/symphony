import { describe, expect, it } from "vitest";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import {
  issueBranchName
} from "@symphony/tracker";
import {
  SymphonyGithubReviewProcessor
} from "./symphony-github-review.js";
import { extractSymphonyGithubReviewSignal } from "./symphony-github-review-signal.js";
import type {
  SymphonyGitHubReviewEvent,
  SymphonyGitHubReviewPolicyConfig
} from "./symphony-github-review-types.js";

function buildSymphonyGitHubReviewPolicyConfig(
  overrides: Partial<SymphonyGitHubReviewPolicyConfig> = {}
): SymphonyGitHubReviewPolicyConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "coldets",
      teamKey: null,
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress", "Rework"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Backlog",
      pauseTransitionToState: "Paused",
      ...overrides.tracker
    },
    github: {
      allowedReviewLogins: [],
      allowedReworkCommentLogins: [],
      ...overrides.github
    }
  };
}

function buildSymphonyTrackerIssue(
  overrides: Record<string, unknown> = {}
) {
  const identifier =
    typeof overrides.identifier === "string" ? overrides.identifier : "COL-123";

  return {
    id: typeof overrides.id === "string" ? overrides.id : "issue-123",
    identifier,
    title: typeof overrides.title === "string" ? overrides.title : "Test issue",
    description:
      typeof overrides.description === "string"
        ? overrides.description
        : "Test description",
    priority: typeof overrides.priority === "number" ? overrides.priority : 2,
    state: typeof overrides.state === "string" ? overrides.state : "Todo",
    branchName:
      typeof overrides.branchName === "string"
        ? overrides.branchName
        : issueBranchName(identifier),
    url:
      typeof overrides.url === "string"
        ? overrides.url
        : `https://linear.app/coldets/issue/${identifier.toLowerCase()}`,
    projectId:
      typeof overrides.projectId === "string" ? overrides.projectId : "project-1",
    projectName:
      typeof overrides.projectName === "string"
        ? overrides.projectName
        : "Symphony Developer Control Plane Foundation",
    projectSlug:
      typeof overrides.projectSlug === "string" ? overrides.projectSlug : "coldets",
    teamKey: typeof overrides.teamKey === "string" ? overrides.teamKey : "COL",
    assigneeId:
      typeof overrides.assigneeId === "string" ? overrides.assigneeId : "worker-1",
    blockedBy: Array.isArray(overrides.blockedBy) ? overrides.blockedBy : [],
    labels: Array.isArray(overrides.labels) ? overrides.labels : [],
    assignedToWorker:
      typeof overrides.assignedToWorker === "boolean"
        ? overrides.assignedToWorker
        : true,
    createdAt:
      typeof overrides.createdAt === "string"
        ? overrides.createdAt
        : "2026-03-31T00:00:00.000Z",
    updatedAt:
      typeof overrides.updatedAt === "string"
        ? overrides.updatedAt
        : "2026-03-31T00:00:00.000Z"
  };
}

function buildSymphonyGithubReviewEvent(
  overrides: Partial<
    Extract<SymphonyGitHubReviewEvent, { event: "pull_request_review" }>
  > = {}
): SymphonyGitHubReviewEvent {
  const payload =
    "payload" in overrides && overrides.payload
      ? overrides.payload
      : {
          reviewState: "changes_requested",
          authorLogin: "reviewer",
          headRef: "symphony/COL-123",
          headSha: "abc123",
          reviewId: 1,
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          pullRequestHtmlUrl: "https://github.com/openai/symphony/pull/123"
        };

  return {
    event: "pull_request_review",
    repository: "openai/symphony",
    ...overrides,
    payload
  };
}

function buildSymphonyGithubIssueCommentEvent(
  overrides: Partial<Extract<SymphonyGitHubReviewEvent, { event: "issue_comment" }>> = {}
): SymphonyGitHubReviewEvent {
  const payload =
    "payload" in overrides && overrides.payload
      ? overrides.payload
      : {
          issueNumber: 123,
          commentId: 456,
          commentBody: "/rework Please address the feedback.",
          authorLogin: "reviewer",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123"
        };

  return {
    event: "issue_comment",
    repository: "openai/symphony",
    ...overrides,
    payload
  };
}

describe("symphony github review policy", () => {
  it("accepts changes_requested reviews and manual /rework comments from allowed logins", () => {
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
      github: {
        ...baseConfig.github,
        allowedReviewLogins: ["reviewer"],
        allowedReworkCommentLogins: ["reviewer"]
      }
    });

    const reviewSignal = extractSymphonyGithubReviewSignal(
      policyConfig,
      buildSymphonyGithubReviewEvent()
    );
    const commentSignal = extractSymphonyGithubReviewSignal(
      policyConfig,
      buildSymphonyGithubIssueCommentEvent()
    );

    expect(reviewSignal?.kind).toBe("changes_requested_review");
    expect(commentSignal?.kind).toBe("manual_rework_comment");
  });

  it("requeues issues in review through tracker state transitions and comments", async () => {
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
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
      policyConfig,
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
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
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
      policyConfig,
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
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
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
      policyConfig,
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
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
      github: {
        ...baseConfig.github,
        allowedReworkCommentLogins: ["reviewer"]
      }
    });

    const tracker = createMemorySymphonyTracker([]);
    const githubComments: string[] = [];

    const processor = new SymphonyGithubReviewProcessor({
      policyConfig,
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
