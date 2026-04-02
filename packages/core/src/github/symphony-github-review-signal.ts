import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type {
  SymphonyGitHubReviewEvent,
  SymphonyGitHubReviewSignal
} from "./symphony-github-review-types.js";

const reworkCommandPattern = /^\/rework(?:\s+(?<context>[\s\S]+))?$/u;

export function extractSymphonyGithubReviewSignal(
  workflowConfig: SymphonyResolvedWorkflowConfig,
  event: SymphonyGitHubReviewEvent
): SymphonyGitHubReviewSignal | null {
  if (event.event === "pull_request_review") {
    const allowedLogins = new Set(workflowConfig.github.allowedReviewLogins);

    if (
      event.payload.reviewState.toLowerCase() === "changes_requested" &&
      event.payload.authorLogin &&
      allowedLogins.has(event.payload.authorLogin)
    ) {
      return {
        kind: "changes_requested_review",
        issueIdentifier: issueIdentifierFromBranch(event.payload.headRef),
        headSha: event.payload.headSha,
        authorLogin: event.payload.authorLogin,
        pullRequestUrl: event.payload.pullRequestHtmlUrl,
        reviewId: event.payload.reviewId
      };
    }

    return null;
  }

  const allowedLogins = new Set(
    workflowConfig.github.allowedReworkCommentLogins
  );
  const parsed = parseReworkCommand(event.payload.commentBody);

  if (
    parsed &&
    event.payload.authorLogin &&
    allowedLogins.has(event.payload.authorLogin) &&
    event.payload.pullRequestUrl
  ) {
    return {
      kind: "manual_rework_comment",
      issueIdentifier: null,
      repository: event.repository,
      issueNumber: event.payload.issueNumber,
      pullRequestUrl: event.payload.pullRequestUrl,
      headSha: null,
      authorLogin: event.payload.authorLogin,
      commentId: event.payload.commentId,
      operatorContext: parsed
    };
  }

  return null;
}

export function issueIdentifierFromBranch(branchName: string | null): string | null {
  if (!branchName?.startsWith("symphony/")) {
    return null;
  }

  const issueIdentifier = branchName.slice("symphony/".length).trim();
  return issueIdentifier === "" ? null : issueIdentifier;
}

function parseReworkCommand(body: string): string | null {
  const match = reworkCommandPattern.exec(body.trim());
  if (!match) {
    return null;
  }

  const context = match.groups?.context?.trim();
  return context ? context : null;
}
