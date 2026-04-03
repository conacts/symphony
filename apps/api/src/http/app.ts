import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import type { SymphonyRuntimeAppServices } from "../core/runtime-app-types.js";
import { jsonError } from "../core/envelope.js";
import { normalizeRuntimeError } from "../core/errors.js";
import type { SymphonyRuntimeAppContextSchema } from "./context.js";
import { createForensicsRoutes } from "./routes/forensics-routes.js";
import { createGitHubReviewEventsRoutes } from "./routes/github-review-events-routes.js";
import { createRealtimeRoutes } from "./routes/realtime-routes.js";
import { createRuntimeRoutes } from "./routes/runtime-routes.js";

export function createSymphonyRuntimeApplication(
  services: SymphonyRuntimeAppServices,
  input: {
    allowedOrigins?: string[];
  } = {}
) {
  const app = new Hono<SymphonyRuntimeAppContextSchema>();
  const nodeWebSocket = createNodeWebSocket({ app });
  const allowedOrigins = input.allowedOrigins ?? [];

  app.use("/api/*", async (c, next) => {
    const requestOrigin = c.req.header("origin");
    const allowedOrigin = requestOrigin
      ? getAllowedCorsOrigin(requestOrigin, allowedOrigins)
      : null;

    if (c.req.method === "OPTIONS") {
      if (!allowedOrigin) {
        return new Response(null, {
          status: requestOrigin ? 403 : 204
        });
      }

      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(allowedOrigin)
      });
    }

    await next();

    if (!allowedOrigin) {
      return;
    }

    for (const [header, value] of Object.entries(buildCorsHeaders(allowedOrigin))) {
      c.header(header, value);
    }
  });

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

export function createSymphonyRuntimeApp(
  services: SymphonyRuntimeAppServices,
  input: {
    allowedOrigins?: string[];
  } = {}
) {
  return createSymphonyRuntimeApplication(services, input).app;
}

export function getAllowedCorsOrigin(
  requestOrigin: string,
  configuredOrigins: string[]
): string | null {
  if (configuredOrigins.length > 0) {
    return configuredOrigins.includes(requestOrigin) ? requestOrigin : null;
  }

  return isLocalNetworkOrigin(requestOrigin) ? requestOrigin : null;
}

function buildCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

function isLocalNetworkOrigin(origin: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    isPrivateIpv4Hostname(hostname)
  );
}

function isPrivateIpv4Hostname(hostname: string): boolean {
  const segments = hostname.split(".");

  if (segments.length !== 4) {
    return false;
  }

  const octets = segments.map((segment) => Number.parseInt(segment, 10));

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  if (octets[0] === 10 || octets[0] === 127) {
    return true;
  }

  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }

  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}
