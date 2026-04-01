import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyGitHubWebhookEventSchema = z.enum([
  "ping",
  "pull_request_review",
  "issue_comment"
]);

export const symphonyGitHubWebhookHeadersSchema = z.strictObject({
  xGitHubDelivery: nonEmptyStringSchema,
  xGitHubEvent: symphonyGitHubWebhookEventSchema,
  xHubSignature256: nonEmptyStringSchema
});

const repositorySchema = z
  .object({
    full_name: nonEmptyStringSchema
  })
  .passthrough();

const pullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    head: z
      .object({
        sha: nonEmptyStringSchema,
        ref: nonEmptyStringSchema.optional()
      })
      .passthrough(),
    url: z.string().url().optional(),
    html_url: z.string().url().optional()
  })
  .passthrough();

const reviewSchema = z
  .object({
    id: z.number().int().positive(),
    state: nonEmptyStringSchema,
    user: z
      .object({
        login: nonEmptyStringSchema.optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const issueSchema = z
  .object({
    number: z.number().int().positive(),
    pull_request: z
      .object({
        url: z.string().url().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const commentSchema = z
  .object({
    id: z.number().int().positive(),
    body: z.string(),
    user: z
      .object({
        login: nonEmptyStringSchema.optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export const symphonyGitHubPingPayloadSchema = z
  .object({
    repository: repositorySchema,
    action: nonEmptyStringSchema.optional(),
    zen: z.string().optional(),
    hook_id: z.number().int().nonnegative().optional()
  })
  .passthrough();

export const symphonyGitHubPullRequestReviewPayloadSchema = z
  .object({
    repository: repositorySchema,
    action: nonEmptyStringSchema.optional(),
    pull_request: pullRequestSchema,
    review: reviewSchema
  })
  .passthrough();

export const symphonyGitHubIssueCommentPayloadSchema = z
  .object({
    repository: repositorySchema,
    action: nonEmptyStringSchema.optional(),
    issue: issueSchema,
    comment: commentSchema
  })
  .passthrough();

export const symphonyGitHubWebhookBodySchema = z.union([
  symphonyGitHubPingPayloadSchema,
  symphonyGitHubPullRequestReviewPayloadSchema,
  symphonyGitHubIssueCommentPayloadSchema
]);

export type SymphonyGitHubWebhookEvent = z.infer<typeof symphonyGitHubWebhookEventSchema>;
export type SymphonyGitHubWebhookHeaders = z.infer<typeof symphonyGitHubWebhookHeadersSchema>;
export type SymphonyGitHubWebhookBody = z.infer<typeof symphonyGitHubWebhookBodySchema>;
export type SymphonyGitHubPingPayload = z.infer<typeof symphonyGitHubPingPayloadSchema>;
export type SymphonyGitHubPullRequestReviewPayload = z.infer<
  typeof symphonyGitHubPullRequestReviewPayloadSchema
>;
export type SymphonyGitHubIssueCommentPayload = z.infer<
  typeof symphonyGitHubIssueCommentPayloadSchema
>;
