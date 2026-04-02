import {
  isLinearIssueInScope,
  isSymphonyAutoReworkDisabled,
  isSymphonyWorkflowDisabled,
  type SymphonyTracker
} from "../tracker/symphony-tracker.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import {
  autoRequeueCommentBody,
  notInReviewCommentBody
} from "./symphony-github-review-comments.js";
import {
  extractSymphonyGithubReviewSignal,
  issueIdentifierFromBranch
} from "./symphony-github-review-signal.js";
import type {
  SymphonyGitHubPullRequestResolver,
  SymphonyGitHubReviewEvent,
  SymphonyGitHubReviewProcessResult,
  SymphonyGitHubReviewSignal
} from "./symphony-github-review-types.js";

const expectedSourceState = "In Review";
const targetState = "Rework";
export {
  extractSymphonyGithubReviewSignal,
  issueIdentifierFromBranch
} from "./symphony-github-review-signal.js";
export type {
  SymphonyGitHubPullRequestResolver,
  SymphonyGitHubReviewEvent,
  SymphonyGitHubReviewSignal
} from "./symphony-github-review-types.js";

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
  ): Promise<SymphonyGitHubReviewProcessResult> {
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
  ): Promise<Extract<SymphonyGitHubReviewProcessResult, { status: "requeued" | "skipped" }>> {
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

    const githubAcknowledgement =
      result.status === "requeued"
        ? "Queued rework via Symphony."
        : result.reason === "not_in_review"
          ? notInReviewCommentBody()
          : null;

    if (
      githubAcknowledgement &&
      this.#pullRequestResolver.createIssueComment &&
      signal.repository
    ) {
      await this.#pullRequestResolver.createIssueComment(
        signal.repository,
        signal.issueNumber,
        githubAcknowledgement
      );
    }

    return result;
  }

  async #processSignalWithIssueIdentifier(
    signal: SymphonyGitHubReviewSignal,
    issueIdentifier: string | null
  ): Promise<Extract<SymphonyGitHubReviewProcessResult, { status: "requeued" | "skipped" }>> {
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
