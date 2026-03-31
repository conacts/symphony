import { z } from "zod";
import { appErrorSchema } from "./core/codes.js";

export const envelopeMetaSchema = z.object({
  durationMs: z.number(),
  generatedAt: z.string(),
  count: z.number().optional()
});

const envelopeBaseSchema = {
  schemaVersion: z.literal("1"),
  meta: envelopeMetaSchema,
  warnings: z.array(z.string()).optional()
};

const errorEnvelopeSchema = z.object({
  ...envelopeBaseSchema,
  ok: z.literal(false),
  error: appErrorSchema,
  data: z.undefined().optional()
});

export const createEnvelopeSchema = <Schema extends z.ZodTypeAny>(data: Schema) =>
  z.discriminatedUnion("ok", [
    z.object({
      ...envelopeBaseSchema,
      ok: z.literal(true),
      data,
      error: z.undefined().optional()
    }),
    errorEnvelopeSchema
  ]);

export const unknownEnvelopeSchema = createEnvelopeSchema(z.unknown());

export type EnvelopeSchema = z.infer<typeof unknownEnvelopeSchema>;
