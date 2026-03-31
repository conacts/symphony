import {
  isLinearIssueInScope,
  isSymphonyAutoReworkDisabled,
  isSymphonyWorkflowDisabled,
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "../tracker/symphony-tracker.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";

const reworkCommandPattern = /^\/rework(?:\s+(?<context>[\s\S]+))?$/u;
const expectedSourceState = "In Review";
const targetState = "Rework";

export type SymphonyGitHubReviewEvent =
  | {
      event: "pull_request_review";
      repository: string;
      payload: {
        reviewState: string;
        authorLogin: string | null;
        headRef: string | null;
        headSha: string | null;
        reviewId: number;
        pullRequestUrl: string | null;
        pullRequestHtmlUrl: string | null;
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
    }
  | {
      kind: "manual_rework_comment";
      issueIdentifier: string | null;
      repository: string;
      issueNumber: number;
      pullRequestUrl: string | null;
      headSha: null;
      authorLogin: string | null;
      commentId: number;
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

export class SymphonyGithubReviewProcessor {
  readonly #workflowConfig: SymphonyResolvedWorkflowConfig;
  readonly #tracker: SymphonyTracker;
  readonly #pullRequestResolver: SymphonyGitHubPullRequestResolver;

  constructor(input: {
    workflowConfig: SymphonyResolvedWorkflowConfig;
    tracker: SymphonyTracker;
    pullRequestResolver: SymphonyGitHubPullRequestResolver;
  }) {
    this.#workflowConfig = input.workflowConfig;
    this.#tracker = input.tracker;
    this.#pullRequestResolver = input.pullRequestResolver;
  }

  async processEvent(
    event: SymphonyGitHubReviewEvent
  ): Promise<
    | { status: "ignored" }
    | { status: "requeued"; issueIdentifier: string }
    | { status: "skipped"; issueIdentifier: string | null; reason: string }
  > {
    const signal = extractSymphonyGithubReviewSignal(this.#workflowConfig, event);
    if (!signal) {
      return {
        status: "ignored"
      };
    }

    if (signal.kind === "manual_rework_comment") {
      return await this.#processManualReworkComment(signal);
    }

    return await this.#processSignalWithIssueIdentifier(signal, signal.issueIdentifier);
  }

  async #processManualReworkComment(
    signal: Extract<SymphonyGitHubReviewSignal, { kind: "manual_rework_comment" }>
  ): Promise<
    | { status: "requeued"; issueIdentifier: string }
    | { status: "skipped"; issueIdentifier: string | null; reason: string }
  > {
    if (!signal.pullRequestUrl) {
      return {
        status: "skipped",
        issueIdentifier: null,
        reason: "missing_pull_request_url"
      };
    }

    const pullRequest = await this.#pullRequestResolver.fetchPullRequest(
      signal.pullRequestUrl
    );

    const issueIdentifier = issueIdentifierFromBranch(pullRequest?.headRef ?? null);
    if (!issueIdentifier) {
      return {
        status: "skipped",
        issueIdentifier: null,
        reason: "unmapped_issue_branch"
      };
    }

    const result = await this.#processSignalWithIssueIdentifier(
      {
        ...signal,
        issueIdentifier,
        pullRequestUrl: pullRequest?.htmlUrl ?? signal.pullRequestUrl
      },
      issueIdentifier
    );

    if (
      result.status === "skipped" &&
      this.#pullRequestResolver.createIssueComment &&
      signal.repository
    ) {
      await this.#pullRequestResolver.createIssueComment(
        signal.repository,
        signal.issueNumber,
        result.reason === "not_in_review"
          ? notInReviewCommentBody()
          : "Queued rework via Symphony."
      );
    }

    return result;
  }

  async #processSignalWithIssueIdentifier(
    signal: SymphonyGitHubReviewSignal,
    issueIdentifier: string | null
  ): Promise<
    | { status: "requeued"; issueIdentifier: string }
    | { status: "skipped"; issueIdentifier: string | null; reason: string }
  > {
    if (!issueIdentifier) {
      return {
        status: "skipped",
        issueIdentifier: null,
        reason: "missing_issue_identifier"
      };
    }

    const issue = await this.#tracker.fetchIssueByIdentifier(
      this.#workflowConfig.tracker,
      issueIdentifier
    );

    if (!issue) {
      return {
        status: "skipped",
        issueIdentifier,
        reason: "issue_not_found"
      };
    }

    if (issue.state !== expectedSourceState) {
      return {
        status: "skipped",
        issueIdentifier,
        reason: "not_in_review"
      };
    }

    if (isSymphonyWorkflowDisabled(issue)) {
      return {
        status: "skipped",
        issueIdentifier,
        reason: "workflow_disabled"
      };
    }

    if (!isLinearIssueInScope(this.#workflowConfig.tracker, issue)) {
      return {
        status: "skipped",
        issueIdentifier,
        reason: "outside_scope"
      };
    }

    if (
      signal.kind !== "manual_rework_comment" &&
      isSymphonyAutoReworkDisabled(issue)
    ) {
      return {
        status: "skipped",
        issueIdentifier,
        reason: "auto_rework_disabled"
      };
    }

    await this.#tracker.updateIssueState(issue.id, targetState);
    await this.#tracker.createComment(
      issue.id,
      autoRequeueCommentBody(issue, signal)
    );

    return {
      status: "requeued",
      issueIdentifier
    };
  }
}

function parseReworkCommand(body: string): string | null {
  const match = reworkCommandPattern.exec(body.trim());
  if (!match) {
    return null;
  }

  const context = match.groups?.context?.trim();
  return context ? context : null;
}

function autoRequeueCommentBody(
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

function notInReviewCommentBody(): string {
  return "No action taken: matching Linear issue is not currently in `In Review`.";
}
