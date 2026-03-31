import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import { nonEmptyStringSchema, nullableNonEmptyStringSchema } from "../../core/shared.js";
import { symphonyGitHubWebhookEventSchema } from "./requests.js";

export const symphonyGitHubReviewIngressResultSchema = z.strictObject({
  accepted: z.boolean(),
  persisted: z.boolean(),
  duplicate: z.enum(["delivery", "semantic"]).nullable(),
  delivery: nonEmptyStringSchema,
  event: symphonyGitHubWebhookEventSchema,
  repository: nonEmptyStringSchema,
  action: nullableNonEmptyStringSchema,
  semanticKey: nullableNonEmptyStringSchema
});

export const symphonyGitHubReviewIngressResponseSchema = createEnvelopeSchema(
  symphonyGitHubReviewIngressResultSchema
);

export type SymphonyGitHubReviewIngressResult = z.infer<
  typeof symphonyGitHubReviewIngressResultSchema
>;
