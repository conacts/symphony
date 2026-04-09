import type { SymphonyTrackerConfig } from "@symphony/tracker";
import type { SymphonyReworkHandoff } from "@symphony/runtime-contract";

export type SymphonyGitHubReviewConfig = {
  allowedReviewLogins: string[];
  allowedReviewCommentLogins: string[];
  allowedReworkCommentLogins: string[];
};

export type SymphonyGitHubReviewPolicyConfig = {
  tracker: SymphonyTrackerConfig;
  github: SymphonyGitHubReviewConfig;
};

export type SymphonyGitHubReviewEvent =
  | {
      event: "pull_request_review";
      repository: string;
      payload: {
        reviewState: string;
        reviewBody: string | null;
        authorLogin: string | null;
        headRef: string | null;
        headSha: string | null;
        reviewId: number;
        pullRequestUrl: string | null;
        pullRequestHtmlUrl: string | null;
      };
    }
  | {
      event: "pull_request_review_comment";
      repository: string;
      payload: {
        issueNumber: number;
        commentId: number;
        commentBody: string;
        authorLogin: string | null;
        pullRequestUrl: string | null;
        pullRequestHtmlUrl: string | null;
        commentHtmlUrl: string | null;
      };
    }
  | {
      event: "issue_comment";
      repository: string;
      payload: {
        issueNumber: number;
        commentId: number;
        commentBody: string;
        authorLogin: string | null;
        pullRequestUrl: string | null;
        commentHtmlUrl: string | null;
      };
    };

export type SymphonyGitHubReviewSignal =
  | {
      kind: "changes_requested_review";
      issueIdentifier: string | null;
      headSha: string | null;
      authorLogin: string | null;
      pullRequestUrl: string | null;
      reviewId: number;
      feedbackBody: string | null;
    }
  | {
      kind: "review_comment";
      issueIdentifier: string | null;
      repository: string;
      issueNumber: number;
      pullRequestUrl: string | null;
      pullRequestHtmlUrl: string | null;
      commentHtmlUrl: string | null;
      headSha: null;
      authorLogin: string | null;
      commentId: number;
      feedbackBody: string | null;
      operatorContext: string | null;
    }
  | {
      kind: "manual_rework_comment";
      issueIdentifier: string | null;
      repository: string;
      issueNumber: number;
      pullRequestUrl: string | null;
      pullRequestHtmlUrl: string | null;
      commentHtmlUrl: string | null;
      headSha: null;
      authorLogin: string | null;
      commentId: number;
      feedbackBody: string | null;
      operatorContext: string | null;
    };

export type SymphonyGitHubPullRequestResolver = {
  fetchPullRequest(
    pullRequestUrl: string
  ): Promise<{ headRef: string | null; htmlUrl: string | null } | null>;
  createIssueComment?(
    repository: string,
    issueNumber: number,
    body: string
  ): Promise<void>;
};

export type SymphonyGitHubReviewProcessResult =
  | { status: "ignored" }
  | {
      status: "requeued";
      issueIdentifier: string;
      handoff: SymphonyReworkHandoff;
    }
  | { status: "skipped"; issueIdentifier: string | null; reason: string };
