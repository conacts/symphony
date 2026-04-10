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
      teamKey: "COL",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress", "Rework", "Approved"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked",
      ...overrides.tracker
    },
    github: {
      allowedReviewLogins: [],
      allowedReviewCommentLogins: [],
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
          reviewBody: "The current implementation needs one more pass.",
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
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-456"
        };

  return {
    event: "issue_comment",
    repository: "openai/symphony",
    ...overrides,
    payload
  };
}

function buildSymphonyGithubPullRequestReviewCommentEvent(
  overrides: Partial<
    Extract<SymphonyGitHubReviewEvent, { event: "pull_request_review_comment" }>
  > = {}
): SymphonyGitHubReviewEvent {
  const payload =
    "payload" in overrides && overrides.payload
      ? overrides.payload
      : {
          issueNumber: 123,
          commentId: 789,
          commentBody: "Please address this inline issue before merge.",
          authorLogin: "chatgpt-codex-connector[bot]",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          pullRequestHtmlUrl: "https://github.com/openai/symphony/pull/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#discussion_r789"
        };

  return {
    event: "pull_request_review_comment",
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

  it("accepts plain review comments from allowed review-comment logins", () => {
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
      github: {
        ...baseConfig.github,
        allowedReviewCommentLogins: ["chatgpt-codex-connector"]
      }
    });

    const signal = extractSymphonyGithubReviewSignal(
      policyConfig,
      buildSymphonyGithubIssueCommentEvent({
        payload: {
          issueNumber: 123,
          commentId: 789,
          commentBody: "Please address the API naming issues before merge.",
          authorLogin: "chatgpt-codex-connector",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-789"
        }
      })
    );

    expect(signal?.kind).toBe("review_comment");
  });

  it("accepts pull_request_review_comment events from the Codex bot by default", () => {
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig();

    const signal = extractSymphonyGithubReviewSignal(
      policyConfig,
      buildSymphonyGithubPullRequestReviewCommentEvent()
    );

    expect(signal?.kind).toBe("review_comment");
  });

  it("defaults plain PR review comments to the Codex connector when no review-comment allowlist is configured", () => {
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig();

    const signal = extractSymphonyGithubReviewSignal(
      policyConfig,
      buildSymphonyGithubIssueCommentEvent({
        payload: {
          issueNumber: 123,
          commentId: 790,
          commentBody: "Please address this before merge.",
          authorLogin: "chatgpt-codex-connector",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-790"
        }
      })
    );

    expect(signal?.kind).toBe("review_comment");
  });

  it("ignores plain PR comments from other authors when no review-comment allowlist is configured", () => {
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig();

    const signal = extractSymphonyGithubReviewSignal(
      policyConfig,
      buildSymphonyGithubIssueCommentEvent({
        payload: {
          issueNumber: 123,
          commentId: 791,
          commentBody: "Please address this before merge.",
          authorLogin: "some-private-repo-reviewer",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-791"
        }
      })
    );

    expect(signal).toBeNull();
  });

  it("emits a rework handoff for issues already in review without mutating tracker state", async () => {
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
    expect(result).toMatchObject({
      status: "requeued",
      issueIdentifier: "COL-123",
      handoff: {
        source: "github_review",
        triggerKind: "changes_requested_review",
        actorLogin: "reviewer",
        pullRequestUrl: "https://github.com/openai/symphony/pull/123",
        reviewContextUrl:
          "https://github.com/openai/symphony/pull/123#pullrequestreview-1",
        feedbackBody: "The current implementation needs one more pass."
      }
    });

    expect(tracker.listOperations()).toEqual([]);
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

    expect(result).toMatchObject({
      status: "requeued",
      issueIdentifier: "COL-123",
      handoff: {
        source: "github_review",
        triggerKind: "manual_rework_comment",
        actorLogin: "reviewer",
        reviewContextUrl:
          "https://github.com/openai/symphony/pull/123#issuecomment-456",
        feedbackBody: "Please address the feedback."
      }
    });
    expect(githubComments).toEqual([
      {
        repository: "openai/symphony",
        issueNumber: 123,
        body: "Queued rework via Symphony."
      }
    ]);
    expect(tracker.listOperations()).toEqual([]);
  });

  it("requeues issues in review from allowed review-comment logins", async () => {
    const baseConfig = buildSymphonyGitHubReviewPolicyConfig();
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig({
      tracker: baseConfig.tracker,
      github: {
        ...baseConfig.github,
        allowedReviewCommentLogins: ["chatgpt-codex-connector"]
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

    const result = await processor.processEvent(
      buildSymphonyGithubIssueCommentEvent({
        payload: {
          issueNumber: 123,
          commentId: 789,
          commentBody: "Please address the API naming issues before merge.",
          authorLogin: "chatgpt-codex-connector",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-789"
        }
      })
    );

    expect(result).toMatchObject({
      status: "requeued",
      issueIdentifier: "COL-123",
      handoff: {
        source: "github_review",
        triggerKind: "review_comment",
        actorLogin: "chatgpt-codex-connector",
        reviewContextUrl:
          "https://github.com/openai/symphony/pull/123#issuecomment-789",
        feedbackBody: "Please address the API naming issues before merge."
      }
    });

    expect(tracker.listOperations()).toEqual([]);
  });

  it("requeues issues in review from Codex connector PR comments when no review-comment allowlist is configured", async () => {
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig();

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

    const result = await processor.processEvent(
      buildSymphonyGithubIssueCommentEvent({
        payload: {
          issueNumber: 123,
          commentId: 792,
          commentBody: "Please tighten the validation logic before merge.",
          authorLogin: "chatgpt-codex-connector",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-792"
        }
      })
    );

    expect(result).toMatchObject({
      status: "requeued",
      issueIdentifier: "COL-123",
      handoff: {
        source: "github_review",
        triggerKind: "review_comment",
        actorLogin: "chatgpt-codex-connector",
        reviewContextUrl:
          "https://github.com/openai/symphony/pull/123#issuecomment-792",
        feedbackBody: "Please tighten the validation logic before merge."
      }
    });

    expect(tracker.listOperations()).toEqual([]);
  });

  it("requeues issues in review from Codex pull_request_review_comment events", async () => {
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig();

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

    const result = await processor.processEvent(
      buildSymphonyGithubPullRequestReviewCommentEvent()
    );

    expect(result).toMatchObject({
      status: "requeued",
      issueIdentifier: "COL-123",
      handoff: {
        source: "github_review",
        triggerKind: "review_comment",
        actorLogin: "chatgpt-codex-connector[bot]",
        reviewContextUrl: "https://github.com/openai/symphony/pull/123#discussion_r789",
        feedbackBody: "Please address this inline issue before merge."
      }
    });
    expect(tracker.listOperations()).toEqual([]);
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

  it("does not post a GitHub acknowledgement when the linked issue is no longer in review", async () => {
    const policyConfig = buildSymphonyGitHubReviewPolicyConfig();

    const tracker = createMemorySymphonyTracker([
      buildSymphonyTrackerIssue({
        state: "In Progress"
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

    const result = await processor.processEvent(
      buildSymphonyGithubIssueCommentEvent({
        payload: {
          issueNumber: 123,
          commentId: 791,
          commentBody: "Please address this before merge.",
          authorLogin: "chatgpt-codex-connector",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          commentHtmlUrl: "https://github.com/openai/symphony/pull/123#issuecomment-791"
        }
      })
    );

    expect(result).toEqual({
      status: "skipped",
      issueIdentifier: "COL-123",
      reason: "not_in_review"
    });
    expect(githubComments).toEqual([]);
  });
});
