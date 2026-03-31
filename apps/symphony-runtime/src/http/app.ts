import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import type { SymphonyRuntimeAppServices } from "../core/runtime-services.js";
import { jsonError } from "../core/envelope.js";
import { normalizeRuntimeError } from "../core/errors.js";
import { createForensicsRoutes } from "./routes/forensics-routes.js";
import { createGitHubReviewEventsRoutes } from "./routes/github-review-events-routes.js";
import { createRealtimeRoutes } from "./routes/realtime-routes.js";
import { createRuntimeRoutes } from "./routes/runtime-routes.js";

export function createSymphonyRuntimeApplication(
  services: SymphonyRuntimeAppServices
) {
  const app = new Hono<{
    Variables: {
      requestStartedAt: number;
    };
  }>();
  const nodeWebSocket = createNodeWebSocket({ app });

  app.use("*", async (c, next) => {
    c.set("requestStartedAt", Date.now());
    await next();
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
