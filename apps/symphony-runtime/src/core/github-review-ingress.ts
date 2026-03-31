import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubWebhookEvent,
  SymphonyGitHubWebhookHeaders
} from "@symphony/contracts";
import type {
  SymphonyResolvedWorkflowConfig
} from "@symphony/core";
import type {
  SymphonyGitHubReviewEvent,
  SymphonyGithubReviewProcessor
} from "@symphony/core";
import { createRuntimeHttpError } from "./errors.js";

type EventJournalStatus = "recorded" | "duplicate_delivery" | "duplicate_semantic";

type EventJournal = {
  record(input: {
    delivery: string;
    event: SymphonyGitHubWebhookEvent;
    repository: string;
    action: string | null;
    semanticKey: string | null;
  }): EventJournalStatus;
};

export function createSymphonyGitHubReviewIngressService(input: {
  workflowConfig: SymphonyResolvedWorkflowConfig;
  reviewProcessor: SymphonyGithubReviewProcessor;
  eventJournal?: EventJournal;
  onProcessed?: (
    result: Awaited<ReturnType<SymphonyGithubReviewProcessor["processEvent"]>>
  ) => void | Promise<void>;
}) {
  const eventJournal = input.eventJournal ?? createInMemoryEventJournal();

  return {
    async ingest(args: {
      headers: SymphonyGitHubWebhookHeaders;
      body: SymphonyGitHubWebhookBody;
      rawBody: string;
    }): Promise<SymphonyGitHubReviewIngressResult> {
      const github = input.workflowConfig.github;
      if (!github.repo || !github.webhookSecret) {
        throw createRuntimeHttpError(
          503,
          "UNKNOWN",
          "GitHub webhook ingress is not configured."
        );
      }

      if (
        !validateGitHubWebhookSignature(
          args.rawBody,
          args.headers.xHubSignature256,
          github.webhookSecret
        )
      ) {
        throw createRuntimeHttpError(
          403,
          "FORBIDDEN",
          "GitHub webhook signature validation failed."
        );
      }

      const normalized = normalizeReviewEvent(args.headers.xGitHubEvent, args.body);
      if (normalized.repository !== github.repo) {
        throw createRuntimeHttpError(
          403,
          "FORBIDDEN",
          "GitHub webhook repository is not allowed."
        );
      }

      const status = eventJournal.record({
        delivery: args.headers.xGitHubDelivery,
        event: args.headers.xGitHubEvent,
        repository: normalized.repository,
        action: normalized.action,
        semanticKey: normalized.semanticKey
      });

      if (status === "recorded") {
        const result = await input.reviewProcessor.processEvent(normalized.event);
        await input.onProcessed?.(result);
      }

      return {
        accepted: true,
        persisted: status === "recorded",
        duplicate:
          status === "recorded"
            ? null
            : status === "duplicate_delivery"
              ? "delivery"
              : "semantic",
        delivery: args.headers.xGitHubDelivery,
        event: args.headers.xGitHubEvent,
        repository: normalized.repository,
        action: normalized.action,
        semanticKey: normalized.semanticKey
      };
    }
  };
}

function normalizeReviewEvent(
  event: SymphonyGitHubWebhookEvent,
  body: SymphonyGitHubWebhookBody
): {
  repository: string;
  action: string | null;
  semanticKey: string | null;
  event: SymphonyGitHubReviewEvent;
} {
  const repository = body.repository.full_name;
  const action =
    typeof body.action === "string" && body.action.trim() !== ""
      ? body.action
      : null;

  switch (event) {
    case "ping":
      return {
        repository,
        action,
        semanticKey: null,
        event: {
          event: "issue_comment",
          repository,
          payload: {
            issueNumber: 0,
            commentId: 0,
            commentBody: "",
            authorLogin: null,
            pullRequestUrl: null
          }
        }
      };

    case "pull_request_review":
      if (!("pull_request" in body) || !("review" in body)) {
        throw createRuntimeHttpError(
          422,
          "VALIDATION_FAILED",
          "GitHub webhook payload is not valid for this event type."
        );
      }

      return {
        repository,
        action,
        semanticKey: `pull_request_review:${body.pull_request.number}:${body.pull_request.head.sha}:${body.review.id}:${body.review.state.toLowerCase()}`,
        event: {
          event: "pull_request_review",
          repository,
          payload: {
            reviewState: body.review.state,
            authorLogin: body.review.user?.login ?? null,
            headRef: body.pull_request.head.ref ?? null,
            headSha: body.pull_request.head.sha,
            reviewId: body.review.id,
            pullRequestUrl: body.pull_request.url ?? null,
            pullRequestHtmlUrl: body.pull_request.html_url ?? null
          }
        }
      };

    case "issue_comment":
      if (!("issue" in body) || !("comment" in body)) {
        throw createRuntimeHttpError(
          422,
          "VALIDATION_FAILED",
          "GitHub webhook payload is not valid for this event type."
        );
      }

      return {
        repository,
        action,
        semanticKey: `issue_comment:${body.issue.number}:${body.comment.id}:${action ?? "none"}`,
        event: {
          event: "issue_comment",
          repository,
          payload: {
            issueNumber: body.issue.number,
            commentId: body.comment.id,
            commentBody: body.comment.body,
            authorLogin: body.comment.user?.login ?? null,
            pullRequestUrl: body.issue.pull_request?.url ?? null
          }
        }
      };
  }
}

function validateGitHubWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const normalizedHeader = signatureHeader.trim();

  if (!normalizedHeader.startsWith("sha256=")) {
    return false;
  }

  const provided = normalizedHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function createInMemoryEventJournal(): EventJournal {
  const deliveries = new Set<string>();
  const semantics = new Set<string>();

  return {
    record(input) {
      if (deliveries.has(input.delivery)) {
        return "duplicate_delivery";
      }

      if (input.semanticKey && semantics.has(input.semanticKey)) {
        deliveries.add(input.delivery);
        return "duplicate_semantic";
      }

      deliveries.add(input.delivery);
      if (input.semanticKey) {
        semantics.add(input.semanticKey);
      }

      return "recorded";
    }
  };
}
