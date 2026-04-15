import {
  isSymphonyWorkflowDisabled,
  type SymphonyTracker
} from "@symphony/tracker";
import {
  extractSymphonyGithubReviewSignal,
  issueIdentifierFromBranch
} from "./symphony-github-review-signal.js";
import type {
  SymphonyGitHubPullRequestResolver,
  SymphonyGitHubReviewPolicyConfig,
  SymphonyGitHubReviewEvent,
  SymphonyGitHubReviewProcessResult,
  SymphonyGitHubReviewSignal
} from "./symphony-github-review-types.js";

const expectedSourceState = "In Review";
export class SymphonyGithubReviewProcessor {
  readonly #policyConfig: SymphonyGitHubReviewPolicyConfig;
  readonly #tracker: SymphonyTracker;
  readonly #pullRequestResolver: SymphonyGitHubPullRequestResolver;

  constructor(input: {
    policyConfig: SymphonyGitHubReviewPolicyConfig;
    tracker: SymphonyTracker;
    pullRequestResolver: SymphonyGitHubPullRequestResolver;
  }) {
    this.#policyConfig = input.policyConfig;
    this.#tracker = input.tracker;
    this.#pullRequestResolver = input.pullRequestResolver;
  }

  async processEvent(
    event: SymphonyGitHubReviewEvent
  ): Promise<SymphonyGitHubReviewProcessResult> {
    const signal = extractSymphonyGithubReviewSignal(this.#policyConfig, event);
    if (!signal) {
      return {
        status: "ignored"
      };
    }

    if (signal.kind === "review_comment") {
      return await this.#processReviewComment(signal);
    }

    return await this.#processSignalWithIssueIdentifier(signal, signal.issueIdentifier);
  }

  async #processReviewComment(
    signal: Extract<SymphonyGitHubReviewSignal, { kind: "review_comment" }>
  ): Promise<Extract<SymphonyGitHubReviewProcessResult, { status: "matched" | "skipped" }>> {
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

    return result;
  }

  async #processSignalWithIssueIdentifier(
    signal: SymphonyGitHubReviewSignal,
    issueIdentifier: string | null
  ): Promise<Extract<SymphonyGitHubReviewProcessResult, { status: "matched" | "skipped" }>> {
    if (!issueIdentifier) {
      return {
        status: "skipped",
        issueIdentifier: null,
        reason: "missing_issue_identifier"
      };
    }

    const issue = await this.#tracker.fetchIssueByIdentifier(
      this.#policyConfig.tracker,
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

    return {
      status: "matched",
      issueIdentifier
    };
  }
}
