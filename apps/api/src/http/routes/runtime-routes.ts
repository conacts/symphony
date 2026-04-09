import { Hono } from "hono";
import { z } from "zod";
import { resolveHarnessModelRuntimePolicy } from "@symphony/agent-harnesses";
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
  const deliveryReportRequestSchema = z.strictObject({
    runId: z.string().trim().min(1),
    turnId: z.string().trim().min(1).nullable().optional(),
    issue: z.strictObject({
      trackerIssueId: z.string().trim().min(1),
      identifier: z.string().trim().min(1),
      state: z.string().trim().min(1).nullable().optional()
    }),
    arguments: z.unknown()
  });
  const spikeResultRequestSchema = deliveryReportRequestSchema;
  const cancelRequestSchema = deliveryReportRequestSchema;
  const mergeResultRequestSchema = deliveryReportRequestSchema;

  runtimeRoutes.get("/state", (c) => {
    const result = serializeRuntimeState(
      services.orchestrator.snapshot(),
      services.admittedRepositories
    );
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
      repo: query.repo,
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

  runtimeRoutes.post("/internal/runtime-tools/finish", async (c) => {
    const payload = parseWithSchema(deliveryReportRequestSchema, await c.req.json());
    const result = await services.runtimeTools.recordDeliveryReport({
      runId: payload.runId,
      turnId: payload.turnId ?? null,
      issue: {
        trackerIssueId: payload.issue.trackerIssueId,
        identifier: payload.issue.identifier,
        state: payload.issue.state ?? null
      },
      argumentsPayload: payload.arguments
    });

    c.get("logger").info("Recorded delivery report through the runtime tools API", {
      runId: payload.runId,
      issueIdentifier: payload.issue.identifier,
      success: result.success
    });

    return jsonOk(c, result);
  });

  runtimeRoutes.post("/internal/runtime-tools/spike-result", async (c) => {
    const payload = parseWithSchema(spikeResultRequestSchema, await c.req.json());
    const result = await services.runtimeTools.submitSpikeResult({
      runId: payload.runId,
      turnId: payload.turnId ?? null,
      issue: {
        trackerIssueId: payload.issue.trackerIssueId,
        identifier: payload.issue.identifier,
        state: payload.issue.state ?? null
      },
      argumentsPayload: payload.arguments
    });

    c.get("logger").info("Submitted spike result through the runtime tools API", {
      runId: payload.runId,
      issueIdentifier: payload.issue.identifier,
      success: result.success
    });

    return jsonOk(c, result);
  });

  runtimeRoutes.post("/internal/runtime-tools/cancel", async (c) => {
    const payload = parseWithSchema(cancelRequestSchema, await c.req.json());
    const result = await services.runtimeTools.cancelIssue({
      runId: payload.runId,
      turnId: payload.turnId ?? null,
      issue: {
        trackerIssueId: payload.issue.trackerIssueId,
        identifier: payload.issue.identifier,
        state: payload.issue.state ?? null
      },
      argumentsPayload: payload.arguments
    });

    c.get("logger").info("Canceled issue through the runtime tools API", {
      runId: payload.runId,
      issueIdentifier: payload.issue.identifier,
      success: result.success
    });

    return jsonOk(c, result);
  });

  runtimeRoutes.post("/internal/runtime-tools/merge-result", async (c) => {
    const payload = parseWithSchema(mergeResultRequestSchema, await c.req.json());
    const result = await services.runtimeTools.submitMergeResult({
      runId: payload.runId,
      turnId: payload.turnId ?? null,
      issue: {
        trackerIssueId: payload.issue.trackerIssueId,
        identifier: payload.issue.identifier,
        state: payload.issue.state ?? null
      },
      argumentsPayload: payload.arguments
    });

    c.get("logger").info("Recorded merge result through the runtime tools API", {
      runId: payload.runId,
      issueIdentifier: payload.issue.identifier,
      success: result.success
    });

    return jsonOk(c, result);
  });

  runtimeRoutes.get("/:issueIdentifier", async (c) => {
    const path = parseWithSchema(symphonyRuntimeIssuePathSchema, c.req.param());
    const trackedIssue = await services.tracker.fetchIssueByIdentifier(
      services.runtimePolicy.tracker,
      path.issueIdentifier
    );
    const piSelectionPolicy = resolveHarnessModelRuntimePolicy(
      services.runtimePolicy
    );
    const result = serializeRuntimeIssue(
      services.orchestrator.snapshot(),
      services.runtimePolicy.github.repo,
      path.issueIdentifier,
      trackedIssue,
      piSelectionPolicy
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
