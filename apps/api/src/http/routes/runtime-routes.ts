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
  symphonyRuntimeStateResponseSchema,
  symphonyRuntimeTrackerStateObservationRequestSchema,
  symphonyRuntimeTrackerStateObservationResponseSchema,
  symphonyRuntimeWorkflowComparisonQuerySchema,
  symphonyRuntimeWorkflowComparisonResponseSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { requireRuntimeRouterPresetId } from "../../core/runtime-workflow-presets.js";
import { loadRunningWorkflowTrackerStates } from "../../core/runtime-workflow-tracker-state.js";
import { parseWithSchema } from "../../core/validation.js";
import {
  serializeRuntimeIssue,
  serializeRuntimeState,
  serializeRuntimeWorkflowComparison
} from "../serializers.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";

export function createRuntimeRoutes(services: SymphonyRuntimeAppServices) {
  const runtimeRoutes = new Hono<SymphonyRuntimeAppContextSchema>();
  const deliveryReportRequestSchema = z.strictObject({
    runId: z.string().trim().min(1),
    turnId: z.string().trim().min(1).nullable().optional(),
    issue: z.strictObject({
      trackerIssueId: z.string().trim().min(1),
      identifier: z.string().trim().min(1)
    }),
    arguments: z.unknown()
  });
  const spikeResultRequestSchema = deliveryReportRequestSchema;
  const cancelRequestSchema = deliveryReportRequestSchema;
  const mergeResultRequestSchema = deliveryReportRequestSchema;

  runtimeRoutes.get("/state", async (c) => {
    const snapshot = services.orchestrator.snapshot();
    const result = serializeRuntimeState(
      snapshot,
      services.admittedRepositories,
      await loadRunningWorkflowTrackerStates({
        snapshot,
        workflowRead: services.workflowRead
      })
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

  runtimeRoutes.post("/internal/tracker-state/non-running/observe", async (c) => {
    const payload = parseWithSchema(
      symphonyRuntimeTrackerStateObservationRequestSchema,
      await c.req.json()
    );
    const result = await services.trackerStateIngress.observeNonRunningIssue({
      issueIdentifier: payload.issueIdentifier
    });

    if (!result) {
      c.get("logger").warn("Tracker state observation issue not found", {
        issueIdentifier: payload.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

    c.get("logger").info("Observed non-running tracker state through runtime API", {
      issueIdentifier: result.issueIdentifier,
      observedTrackerState: result.observedTrackerState,
      workflowTrackerState: result.workflowTrackerState,
      observed: result.observed,
      disposition: result.disposition
    });

    symphonyRuntimeTrackerStateObservationResponseSchema.parse({
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

  runtimeRoutes.post("/internal/runtime-tools/finish", async (c) => {
    const payload = parseWithSchema(deliveryReportRequestSchema, await c.req.json());
    const result = await services.runtimeTools.recordDeliveryReport({
      runId: payload.runId,
      turnId: payload.turnId ?? null,
      issue: {
        trackerIssueId: payload.issue.trackerIssueId,
        identifier: payload.issue.identifier
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
        identifier: payload.issue.identifier
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
        identifier: payload.issue.identifier
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
        identifier: payload.issue.identifier
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

  runtimeRoutes.get("/:issueIdentifier/workflow-comparison", async (c) => {
    const path = parseWithSchema(symphonyRuntimeIssuePathSchema, c.req.param());
    const searchParams = new URL(c.req.url).searchParams;
    const requestedPresetIds = searchParams.getAll("presetId");
    const query = parseWithSchema(symphonyRuntimeWorkflowComparisonQuerySchema, {
      presetIds: requestedPresetIds.length > 0 ? requestedPresetIds : undefined
    });
    const presetIds = normalizeWorkflowComparisonPresetIds(query.presetIds);
    const comparison = await services.workflowComparison.compareByIssueIdentifier({
      issueIdentifier: path.issueIdentifier,
      presetIds
    });

    if (!comparison) {
      c.get("logger").warn("Runtime workflow comparison not found", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Workflow comparison not found.");
    }

    const result = serializeRuntimeWorkflowComparison(comparison);

    c.get("logger").debug("Returning runtime workflow comparison", {
      issueIdentifier: path.issueIdentifier,
      presetIds: result.comparedPresetIds,
      diverged: result.summary.diverged
    });

    symphonyRuntimeWorkflowComparisonResponseSchema.parse({
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

  runtimeRoutes.get("/:issueIdentifier", async (c) => {
    const path = parseWithSchema(symphonyRuntimeIssuePathSchema, c.req.param());
    const trackedIssue = await services.tracker.fetchIssueByIdentifier(
      services.runtimePolicy.tracker,
      path.issueIdentifier
    );
    const workflowLifecycle = await services.workflowRead.loadWorkflowLifecycleView({
      issueIdentifier: path.issueIdentifier
    });
    const piSelectionPolicy = resolveHarnessModelRuntimePolicy(
      services.runtimePolicy
    );
    const result = serializeRuntimeIssue(
      services.orchestrator.snapshot(),
      services.runtimePolicy.github.repo,
      path.issueIdentifier,
      trackedIssue,
      workflowLifecycle?.trackerState ?? null,
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
      trackedIssueFound: trackedIssue !== null,
      workflowId: workflowLifecycle?.workflowId ?? null,
      workflowTrackerState: workflowLifecycle?.trackerState ?? null
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
function normalizeWorkflowComparisonPresetIds(
  presetIds: ReadonlyArray<string> | undefined
): ReadonlyArray<string> | undefined {
  if (!presetIds) {
    return undefined;
  }

  return presetIds.map((presetId) => {
    try {
      requireRuntimeRouterPresetId(presetId);
      return presetId;
    } catch (error) {
      throw createHttpError(
        "VALIDATION_FAILED",
        error instanceof Error ? error.message : "Validation failed."
      );
    }
  });
}
