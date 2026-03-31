import { Hono } from "hono";
import {
  symphonyGitHubReviewIngressResponseSchema,
  symphonyGitHubWebhookBodySchema,
  symphonyGitHubWebhookHeadersSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-services.js";
import { jsonOk } from "../../core/envelope.js";
import { createHttpError } from "../../core/errors.js";
import { parseWithSchema } from "../../core/validation.js";

export function createGitHubReviewEventsRoutes(
  services: SymphonyRuntimeAppServices
) {
  const routes = new Hono<{
    Variables: {
      requestStartedAt: number;
    };
  }>();

  routes.post("/github/review-events", async (c) => {
    const rawBody = await c.req.text();
    let parsedBody: unknown;

    try {
      parsedBody = rawBody === "" ? {} : JSON.parse(rawBody);
    } catch {
      throw createHttpError("VALIDATION_FAILED", "Validation failed.");
    }

    const headers = parseWithSchema(symphonyGitHubWebhookHeadersSchema, {
      xGitHubDelivery: c.req.header("x-github-delivery"),
      xGitHubEvent: c.req.header("x-github-event"),
      xHubSignature256: c.req.header("x-hub-signature-256")
    });
    const body = parseWithSchema(symphonyGitHubWebhookBodySchema, parsedBody);
    const result = await services.githubReviewIngress.ingest({
      headers,
      body,
      rawBody
    });

    symphonyGitHubReviewIngressResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      status: 202
    });
  });

  return routes;
}
