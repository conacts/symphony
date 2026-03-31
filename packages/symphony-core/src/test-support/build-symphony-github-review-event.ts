import type { SymphonyGitHubReviewEvent } from "../github/symphony-github-review.js";

export function buildSymphonyGithubReviewEvent(
  overrides: Partial<Extract<SymphonyGitHubReviewEvent, { event: "pull_request_review" }>> = {}
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

export function buildSymphonyGithubIssueCommentEvent(
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
