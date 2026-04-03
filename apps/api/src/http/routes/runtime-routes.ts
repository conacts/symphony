import { Hono } from "hono";
import {
  symphonyRuntimeHealthResponseSchema,
  symphonyRuntimeIssuePathSchema,
  symphonyRuntimeLogsQuerySchema,
  symphonyRuntimeLogsResponseSchema,
  symphonyRuntimeRefreshRequestSchema,
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshResponseSchema,
  symphonyRuntimeStateResponseSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { parseWithSchema } from "../../core/validation.js";
import {
  serializeRuntimeIssue,
  serializeRuntimeState
} from "../serializers.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";

export function createRuntimeRoutes(services: SymphonyRuntimeAppServices) {
  const runtimeRoutes = new Hono<SymphonyRuntimeAppContextSchema>();

  runtimeRoutes.get("/state", (c) => {
    const result = serializeRuntimeState(services.orchestrator.snapshot());
    c.get("logger").debug("Returning runtime state", {
      runningCount: result.counts.running,
      retryingCount: result.counts.retrying
    });

    symphonyRuntimeStateResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result);
  });

  runtimeRoutes.get("/health", (c) => {
    const result = services.health.snapshot();

    c.get("logger").debug("Returning runtime health", {
      healthy: result.healthy,
      pollerRunning: result.poller.running,
      pollerInFlight: result.poller.inFlight
    });

    symphonyRuntimeHealthResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result);
  });

  runtimeRoutes.get("/runtime/logs", async (c) => {
    const query = parseWithSchema(symphonyRuntimeLogsQuerySchema, c.req.query());
    const result = await services.runtimeLogs.list({
      limit: query.limit,
      issueIdentifier: query.issueIdentifier
    });

    c.get("logger").debug("Returning runtime logs", {
      count: result.logs.length,
      issueIdentifier: query.issueIdentifier ?? null
    });

    symphonyRuntimeLogsResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.logs.length
    });
  });

  runtimeRoutes.post("/refresh", async (c) => {
    c.get("logger").info("Manual refresh requested");
    parseWithSchema(symphonyRuntimeRefreshRequestSchema, {});
    const result = await services.orchestrator.requestRefresh();

    c.get("logger").info("Manual refresh queued", {
      coalesced: result.coalesced
    });

    symphonyRuntimeRefreshResponseSchema.parse({
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

  runtimeRoutes.get("/:issueIdentifier", async (c) => {
    const path = parseWithSchema(symphonyRuntimeIssuePathSchema, c.req.param());
    const trackedIssue = await services.tracker.fetchIssueByIdentifier(
      services.runtimePolicy.tracker,
      path.issueIdentifier
    );
    const result = serializeRuntimeIssue(
      services.orchestrator.snapshot(),
      services.runtimePolicy.github.repo,
      path.issueIdentifier,
      trackedIssue
    );

    if (!result) {
      c.get("logger").warn("Runtime issue not found", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

    c.get("logger").debug("Returning runtime issue detail", {
      issueIdentifier: path.issueIdentifier,
      status: result.status,
      trackedIssueFound: trackedIssue !== null
    });

    symphonyRuntimeIssueResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result);
  });

  return runtimeRoutes;
}
