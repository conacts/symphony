import { z } from "zod";

const workflowPayloadSchema = z.record(z.string(), z.unknown()).nullable();
const workflowNullableIdSchema = z.string().trim().min(1).nullable();

export const workflowSignalSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  source: z.enum(["tracker", "runtime", "review", "ci", "operator", "router"]),
  occurredAt: z.string().trim().min(1),
  causationId: workflowNullableIdSchema,
  correlationId: workflowNullableIdSchema,
  payload: workflowPayloadSchema
});

export const workflowCommandSettlementInputSchema = z.object({
  commandId: z.string().trim().min(1),
  status: z.enum(["succeeded", "failed"]),
  payload: workflowPayloadSchema,
  recordedAt: z.string().trim().min(1)
});
