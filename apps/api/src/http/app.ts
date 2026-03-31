import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import type { SymphonyRuntimeAppServices } from "../core/runtime-services.js";
import { jsonError } from "../core/envelope.js";
import { normalizeRuntimeError } from "../core/errors.js";
import type { SymphonyRuntimeAppContextSchema } from "./context.js";
import { createForensicsRoutes } from "./routes/forensics-routes.js";
import { createGitHubReviewEventsRoutes } from "./routes/github-review-events-routes.js";
import { createRealtimeRoutes } from "./routes/realtime-routes.js";
import { createRuntimeRoutes } from "./routes/runtime-routes.js";

export function createSymphonyRuntimeApplication(
  services: SymphonyRuntimeAppServices
) {
  const app = new Hono<SymphonyRuntimeAppContextSchema>();
  const nodeWebSocket = createNodeWebSocket({ app });

  app.use("*", async (c, next) => {
    const requestStartedAt = Date.now();
    const requestId = randomUUID();
    const requestLogger = services.logger.child({
      requestId,
      method: c.req.method,
      path: c.req.path
    });

    c.set("requestStartedAt", requestStartedAt);
    c.set("requestId", requestId);
    c.set("logger", requestLogger);

    requestLogger.debug("HTTP request started");
    await next();

    requestLogger.info("HTTP request completed", {
      status: c.finalized ? c.res.status : null,
      durationMs: Date.now() - requestStartedAt
    });
  });

  app.route("/api/v1", createForensicsRoutes(services));
  app.route("/api/v1", createGitHubReviewEventsRoutes(services));
  app.route("/api/v1", createRealtimeRoutes(services, nodeWebSocket.upgradeWebSocket));
  app.route("/api/v1", createRuntimeRoutes(services));

  app.notFound((c) =>
    jsonError(
      c,
      {
        code: "NOT_FOUND",
        message: "Route not found."
      },
      404
    )
  );

  app.onError((error, c) => {
    const normalized = normalizeRuntimeError(error);
    const requestLogger =
      c.get("logger") ??
      services.logger.child({
        method: c.req.method,
        path: c.req.path
      });

    requestLogger.error("HTTP request failed", {
      status: normalized.status,
      code: normalized.appError.code,
      error
    });
    return jsonError(c, normalized.appError, normalized.status);
  });

  return {
    app,
    nodeWebSocket
  };
}

export function createSymphonyRuntimeApp(services: SymphonyRuntimeAppServices) {
  return createSymphonyRuntimeApplication(services).app;
}
