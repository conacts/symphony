import type { SymphonyGitHubReviewSignal } from "./symphony-github-review-types.js";

export function buildSymphonyGitHubReviewContextUrl(
  signal: SymphonyGitHubReviewSignal
): string {
  if (
    signal.kind === "review_comment" &&
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
