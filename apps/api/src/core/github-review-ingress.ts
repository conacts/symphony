import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubIssueCommentPayload,
  SymphonyGitHubPullRequestReviewPayload,
  SymphonyGitHubWebhookEvent,
  SymphonyGitHubWebhookHeaders
} from "@symphony/contracts";
import type {
  SymphonyResolvedWorkflowConfig
} from "@symphony/core";
import type {
  SymphonyGitHubReviewEvent,
  SymphonyGithubReviewProcessor
} from "@symphony/core/github";
import {
  createSilentSymphonyLogger,
  type SymphonyLogger
} from "@symphony/logger";
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
  logger?: SymphonyLogger;
  onProcessed?: (
    result: Awaited<ReturnType<SymphonyGithubReviewProcessor["processEvent"]>>
  ) => void | Promise<void>;
}) {
  const eventJournal = input.eventJournal ?? createInMemoryEventJournal();
  const logger =
    input.logger ??
    createSilentSymphonyLogger("@symphony/api.github-review-ingress");

  return {
    async ingest(args: {
      headers: SymphonyGitHubWebhookHeaders;
      body: SymphonyGitHubWebhookBody;
      rawBody: string;
    }): Promise<SymphonyGitHubReviewIngressResult> {
      const github = input.workflowConfig.github;
      if (!github.repo || !github.webhookSecret) {
        logger.error("GitHub webhook ingress is not configured", {
          event: args.headers.xGitHubEvent,
          delivery: args.headers.xGitHubDelivery
        });
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
        logger.warn("Rejected GitHub webhook due to invalid signature", {
          event: args.headers.xGitHubEvent,
          delivery: args.headers.xGitHubDelivery
        });
        throw createRuntimeHttpError(
          403,
          "FORBIDDEN",
          "GitHub webhook signature validation failed."
        );
      }

      const normalized = normalizeReviewEvent(args.headers.xGitHubEvent, args.body);
      if (normalized.repository !== github.repo) {
        logger.warn("Rejected GitHub webhook for disallowed repository", {
          event: args.headers.xGitHubEvent,
          delivery: args.headers.xGitHubDelivery,
          repository: normalized.repository
        });
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

      logger.info("Accepted GitHub webhook delivery", {
        delivery: args.headers.xGitHubDelivery,
        event: args.headers.xGitHubEvent,
        repository: normalized.repository,
        action: normalized.action,
        duplicate:
          status === "recorded"
            ? null
            : status === "duplicate_delivery"
              ? "delivery"
              : "semantic"
      });

      if (status === "recorded") {
        const result = await input.reviewProcessor.processEvent(normalized.event);
        logger.info("Processed GitHub webhook delivery", {
          delivery: args.headers.xGitHubDelivery,
          event: args.headers.xGitHubEvent,
          result
        });
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

      {
        const reviewBody = body as SymphonyGitHubPullRequestReviewPayload;

        return {
          repository,
          action,
          semanticKey: `pull_request_review:${reviewBody.pull_request.number}:${reviewBody.pull_request.head.sha}:${reviewBody.review.id}:${reviewBody.review.state.toLowerCase()}`,
          event: {
            event: "pull_request_review",
            repository,
            payload: {
              reviewState: reviewBody.review.state,
              authorLogin: reviewBody.review.user?.login ?? null,
              headRef: reviewBody.pull_request.head.ref ?? null,
              headSha: reviewBody.pull_request.head.sha,
              reviewId: reviewBody.review.id,
              pullRequestUrl: reviewBody.pull_request.url ?? null,
              pullRequestHtmlUrl: reviewBody.pull_request.html_url ?? null
            }
          }
        };
      }

    case "issue_comment":
      if (!("issue" in body) || !("comment" in body)) {
        throw createRuntimeHttpError(
          422,
          "VALIDATION_FAILED",
          "GitHub webhook payload is not valid for this event type."
        );
      }

      {
        const commentBody = body as SymphonyGitHubIssueCommentPayload;

        return {
          repository,
          action,
          semanticKey: `issue_comment:${commentBody.issue.number}:${commentBody.comment.id}:${action ?? "none"}`,
          event: {
            event: "issue_comment",
            repository,
            payload: {
              issueNumber: commentBody.issue.number,
              commentId: commentBody.comment.id,
              commentBody: commentBody.comment.body,
              authorLogin: commentBody.comment.user?.login ?? null,
              pullRequestUrl: commentBody.issue.pull_request?.url ?? null
            }
          }
        };
      }
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
