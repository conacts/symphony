import { describe, expect, it } from "vitest";
import {
  symphonyGitHubWebhookHeadersSchema,
  symphonyGitHubWebhookBodySchema,
  symphonyGitHubReviewIngressResponseSchema
} from "./index.js";

describe("symphony github review ingress contracts", () => {
  it("parses supported ingress headers and review payloads", () => {
    const headers = symphonyGitHubWebhookHeadersSchema.parse({
      xGitHubDelivery: "delivery-1",
      xGitHubEvent: "pull_request_review",
      xHubSignature256: "sha256=abc"
    });

    const body = symphonyGitHubWebhookBodySchema.parse({
      repository: {
        full_name: "openai/symphony"
      },
      action: "submitted",
      pull_request: {
        number: 10,
        head: {
          sha: "abc123",
          ref: "symphony/COL-157"
        },
        url: "https://api.github.com/repos/openai/symphony/pulls/10",
        html_url: "https://github.com/openai/symphony/pull/10"
      },
      review: {
        id: 42,
        state: "changes_requested",
        user: {
          login: "octocat"
        }
      }
    });

    expect(headers.xGitHubEvent).toBe("pull_request_review");
    expect("review" in body).toBe(true);
  });

  it("parses the ingress response envelope", () => {
    const parsed = symphonyGitHubReviewIngressResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        accepted: true,
        persisted: true,
        duplicate: null,
        delivery: "delivery-1",
        event: "issue_comment",
        repository: "openai/symphony",
        action: "created",
        semanticKey: "issue_comment:123:456:created"
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("rejects unsupported webhook events", () => {
    expect(() =>
      symphonyGitHubWebhookHeadersSchema.parse({
        xGitHubDelivery: "delivery-1",
        xGitHubEvent: "push",
        xHubSignature256: "sha256=abc"
      })
    ).toThrowError();
  });
});
