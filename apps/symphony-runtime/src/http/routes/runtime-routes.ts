import { Hono } from "hono";
import {
  symphonyRuntimeIssuePathSchema,
  symphonyRuntimeRefreshRequestSchema,
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshResponseSchema,
  symphonyRuntimeStateResponseSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-services.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { parseWithSchema } from "../../core/validation.js";
import {
  serializeRefreshResult,
  serializeRuntimeIssue,
  serializeRuntimeState
} from "../serializers.js";

export function createRuntimeRoutes(services: SymphonyRuntimeAppServices) {
  const runtimeRoutes = new Hono<{
    Variables: {
      requestStartedAt: number;
    };
  }>();

  runtimeRoutes.get("/state", (c) => {
    const result = serializeRuntimeState(services.orchestrator.snapshot());
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

  runtimeRoutes.post("/refresh", async (c) => {
    parseWithSchema(symphonyRuntimeRefreshRequestSchema, {});
    await services.orchestrator.runPollCycle();
    const result = serializeRefreshResult(new Date().toISOString());
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
      services.workflowConfig.tracker,
      path.issueIdentifier
    );
    const result = serializeRuntimeIssue(
      services.orchestrator.snapshot(),
      services.workflowConfig,
      path.issueIdentifier,
      trackedIssue
    );

    if (!result) {
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

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
