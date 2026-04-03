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
    `Signal: ${signal.kind === "manual_rework_comment" ? "`/rework` comment" : "`changes_requested` review"}`,
    `PR: ${signal.pullRequestUrl ?? "unknown"}`,
    `Head SHA: ${signal.headSha ?? "unknown"}`,
    `Actor: ${signal.authorLogin ?? "unknown"}`
  ];

  if (
    signal.kind === "manual_rework_comment" &&
    signal.operatorContext
  ) {
    lines.push("", "Operator context:", signal.operatorContext);
  }

  return lines.join("\n");
}

export function notInReviewCommentBody(): string {
  return "No action taken: matching Linear issue is not currently in `In Review`.";
}
