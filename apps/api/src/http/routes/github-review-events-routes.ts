import { Hono } from "hono";
import {
  symphonyGitHubReviewIngressResponseSchema,
  symphonyGitHubWebhookBodySchema,
  symphonyGitHubWebhookHeadersSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { jsonOk } from "../../core/envelope.js";
import { createHttpError } from "../../core/errors.js";
import { parseWithSchema } from "../../core/validation.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";

export function createGitHubReviewEventsRoutes(
  services: SymphonyRuntimeAppServices
) {
  const routes = new Hono<SymphonyRuntimeAppContextSchema>();

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
    c.get("logger").info("Received GitHub review webhook", {
      delivery: headers.xGitHubDelivery,
      event: headers.xGitHubEvent
    });
    const body = parseWithSchema(symphonyGitHubWebhookBodySchema, parsedBody);
    const result = await services.githubReviewIngress.ingest({
      headers,
      body,
      rawBody
    });

    c.get("logger").info("Processed GitHub review webhook", {
      delivery: result.delivery,
      event: result.event,
      repository: result.repository,
      action: result.action,
      persisted: result.persisted,
      duplicate: result.duplicate
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
