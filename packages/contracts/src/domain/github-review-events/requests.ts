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

const repositorySchema = z.strictObject({
  full_name: nonEmptyStringSchema
});

const pullRequestSchema = z.strictObject({
  number: z.number().int().positive(),
  head: z.strictObject({
    sha: nonEmptyStringSchema,
    ref: nonEmptyStringSchema.optional()
  }),
  url: z.string().url().optional(),
  html_url: z.string().url().optional()
});

const reviewSchema = z.strictObject({
  id: z.number().int().positive(),
  state: nonEmptyStringSchema,
  user: z
    .strictObject({
      login: nonEmptyStringSchema.optional()
    })
    .optional()
});

const issueSchema = z.strictObject({
  number: z.number().int().positive(),
  pull_request: z
    .strictObject({
      url: z.string().url().optional()
    })
    .optional()
});

const commentSchema = z.strictObject({
  id: z.number().int().positive(),
  body: z.string(),
  user: z
    .strictObject({
      login: nonEmptyStringSchema.optional()
    })
    .optional()
});

export const symphonyGitHubPingPayloadSchema = z.strictObject({
  repository: repositorySchema,
  action: nonEmptyStringSchema.optional(),
  zen: z.string().optional(),
  hook_id: z.number().int().nonnegative().optional()
});

export const symphonyGitHubPullRequestReviewPayloadSchema = z.strictObject({
  repository: repositorySchema,
  action: nonEmptyStringSchema.optional(),
  pull_request: pullRequestSchema,
  review: reviewSchema
});

export const symphonyGitHubIssueCommentPayloadSchema = z.strictObject({
  repository: repositorySchema,
  action: nonEmptyStringSchema.optional(),
  issue: issueSchema,
  comment: commentSchema
});

export const symphonyGitHubWebhookBodySchema = z.union([
  symphonyGitHubPingPayloadSchema,
  symphonyGitHubPullRequestReviewPayloadSchema,
  symphonyGitHubIssueCommentPayloadSchema
]);

export type SymphonyGitHubWebhookEvent = z.infer<typeof symphonyGitHubWebhookEventSchema>;
export type SymphonyGitHubWebhookHeaders = z.infer<typeof symphonyGitHubWebhookHeadersSchema>;
export type SymphonyGitHubWebhookBody = z.infer<typeof symphonyGitHubWebhookBodySchema>;
