import { z } from "zod";

export const isoTimestampSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const nonEmptyStringSchema = z.string().trim().min(1);
export const nullableNonEmptyStringSchema = nonEmptyStringSchema.nullable();
export const positiveLimitSchema = z.coerce.number().int().positive().max(500).default(200);
