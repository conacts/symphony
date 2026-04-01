import { createHmac } from "node:crypto";
import type {
  SymphonyGitHubIssueCommentPayload,
  SymphonyGitHubPullRequestReviewPayload,
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookHeaders
} from "@symphony/contracts";

export function buildSymphonyGitHubWebhookHeaders(
  overrides: Partial<SymphonyGitHubWebhookHeaders> = {}
): SymphonyGitHubWebhookHeaders {
  return {
    xGitHubDelivery: "delivery-1",
    xGitHubEvent: "pull_request_review",
    xHubSignature256: "sha256=abc",
    ...overrides
  };
}

export function buildSymphonyGitHubPullRequestReviewPayload(
  overrides: Partial<SymphonyGitHubPullRequestReviewPayload> = {}
): SymphonyGitHubPullRequestReviewPayload {
  return {
    repository: {
      full_name: "openai/symphony"
    },
    action: "submitted",
    pull_request: {
      number: 123,
      head: {
        sha: "abc123",
        ref: "symphony/COL-123"
      },
      url: "https://api.github.com/repos/openai/symphony/pulls/123",
      html_url: "https://github.com/openai/symphony/pull/123"
    },
    review: {
      id: 999,
      state: "changes_requested",
      user: {
        login: "reviewer"
      }
    },
    ...overrides
  };
}

export function buildSymphonyGitHubIssueCommentPayload(
  overrides: Partial<SymphonyGitHubIssueCommentPayload> = {}
): SymphonyGitHubIssueCommentPayload {
  return {
    action: "created",
    repository: {
      full_name: "openai/symphony",
      private: true,
      default_branch: "main"
    },
    issue: {
      number: 123,
      title: "Requeue issue",
      state: "open",
      pull_request: {
        url: "https://api.github.com/repos/openai/symphony/pulls/123",
        html_url: "https://github.com/openai/symphony/pull/123"
      }
    },
    comment: {
      id: 456,
      body: "/rework please retry",
      created_at: "2026-04-01T07:41:59.000Z",
      user: {
        login: "reviewer",
        id: 1
      }
    },
    sender: {
      login: "reviewer",
      id: 1
    },
    ...overrides
  };
}

export function buildSymphonyGitHubReviewIngressResult(
  overrides: Partial<SymphonyGitHubReviewIngressResult> = {}
): SymphonyGitHubReviewIngressResult {
  return {
    accepted: true,
    persisted: true,
    duplicate: null,
    delivery: "delivery-1",
    event: "issue_comment",
    repository: "openai/symphony",
    action: "created",
    semanticKey: "issue_comment:123:456:created",
    ...overrides
  };
}

export function signSymphonyGitHubWebhook(
  rawBody: string,
  secret: string
): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}
