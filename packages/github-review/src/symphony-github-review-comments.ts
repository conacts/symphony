import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { SymphonyGitHubReviewSignal } from "./symphony-github-review-types.js";

const targetState = "Rework";

export function autoRequeueCommentBody(
  issue: SymphonyTrackerIssue,
  signal: SymphonyGitHubReviewSignal
): string {
  const lines = [
    "Symphony status update.",
    "",
    `State: \`${targetState}\``,
    `What changed: GitHub review automation moved the ticket from \`${issue.state}\` to \`${targetState}\`.`,
    `Signal: ${
      signal.kind === "manual_rework_comment"
        ? "`/rework` comment"
        : signal.kind === "review_comment"
          ? "allowed GitHub review comment"
          : "`changes_requested` review"
    }`,
    `PR: ${signal.pullRequestUrl ?? "unknown"}`,
    `Review context: ${buildSymphonyGitHubReviewContextUrl(signal)}`,
    `Head SHA: ${signal.headSha ?? "unknown"}`,
    `Actor: ${signal.authorLogin ?? "unknown"}`,
    "Next run: read the latest Linear comment and the linked PR review feedback before editing."
  ];

  if (
    (signal.kind === "manual_rework_comment" ||
      signal.kind === "review_comment") &&
    signal.operatorContext
  ) {
    lines.push("", "Operator context:", signal.operatorContext);
  }

  return lines.join("\n");
}

export function notInReviewCommentBody(): string {
  return "No action taken: matching Linear issue is not currently in `In Review`.";
}

export function buildSymphonyGitHubReviewContextUrl(
  signal: SymphonyGitHubReviewSignal
): string {
  if (
    (signal.kind === "manual_rework_comment" || signal.kind === "review_comment") &&
    signal.repository &&
    signal.issueNumber > 0 &&
    signal.commentId > 0
  ) {
    if (signal.commentHtmlUrl) {
      return signal.commentHtmlUrl;
    }

    if (signal.pullRequestHtmlUrl) {
      return `${signal.pullRequestHtmlUrl}#issuecomment-${signal.commentId}`;
    }

    return `https://github.com/${signal.repository}/pull/${signal.issueNumber}#issuecomment-${signal.commentId}`;
  }

  if (
    signal.kind === "changes_requested_review" &&
    signal.pullRequestUrl &&
    signal.reviewId > 0
  ) {
    return `${signal.pullRequestUrl}#pullrequestreview-${signal.reviewId}`;
  }

  return signal.pullRequestUrl ?? "unknown";
}
