import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

export const symphonyRuntimeIssuePathSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema
});

export const symphonyRuntimeRefreshRequestSchema = z.strictObject({});
export const symphonyRuntimeLogsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().optional(),
  issueIdentifier: nonEmptyStringSchema.optional()
});

export type SymphonyRuntimeIssuePath = z.infer<typeof symphonyRuntimeIssuePathSchema>;
export type SymphonyRuntimeRefreshRequest = z.infer<
  typeof symphonyRuntimeRefreshRequestSchema
>;
export type SymphonyRuntimeLogsQuery = z.infer<
  typeof symphonyRuntimeLogsQuerySchema
>;
