import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  unknownEnvelopeSchema,
  type AppError,
  type Envelope,
  type EnvelopeMeta
} from "@symphony/errors";

type RuntimeContext = Context<{
  Variables: {
    requestStartedAt: number;
  };
}>;

function resolveStartedAt(c: RuntimeContext): number {
  return c.get("requestStartedAt") ?? Date.now();
}

function createMeta(c: RuntimeContext, count?: number): EnvelopeMeta {
  const meta: EnvelopeMeta = {
    durationMs: Date.now() - resolveStartedAt(c),
    generatedAt: new Date().toISOString()
  };

  if (typeof count === "number") {
    meta.count = count;
  }

  return meta;
}

export function jsonOk<T>(
  c: RuntimeContext,
  data: T,
  options: {
    count?: number;
    status?: number;
  } = {}
): Response {
  const envelope: Envelope<T> = {
    ok: true,
    schemaVersion: "1",
    data,
    meta: createMeta(c, options.count)
  };

  unknownEnvelopeSchema.parse(envelope);
  return c.json(envelope, (options.status ?? 200) as ContentfulStatusCode);
}

export function jsonError(
  c: RuntimeContext,
  error: AppError,
  status = 500
): Response {
  const envelope: Envelope<never> = {
    ok: false,
    schemaVersion: "1",
    error,
    meta: createMeta(c)
  };

  unknownEnvelopeSchema.parse(envelope);
  return c.json(envelope, status as ContentfulStatusCode);
}
