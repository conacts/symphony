import { Hono } from "hono";
import { resolveHarnessModelRuntimePolicy } from "@symphony/agent-harnesses";
import {
  symphonyRuntimeHealthResponseSchema,
  symphonyRuntimeClarificationAnswerRequestSchema,
  symphonyRuntimeClarificationAnswerResponseSchema,
  symphonyRuntimeConfigResponseSchema,
  symphonyRuntimeIssuePathSchema,
  symphonyRuntimeLogsQuerySchema,
  symphonyRuntimeLogsResponseSchema,
  symphonyRuntimeRefreshRequestSchema,
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshResponseSchema,
  symphonyRuntimeStateResponseSchema,
  symphonyRuntimeTrackerStateObservationRequestSchema,
  symphonyRuntimeTrackerStateObservationResponseSchema,
  symphonyRuntimeWorkflowObservabilityQuerySchema,
  symphonyRuntimeWorkflowObservabilityResponseSchema,
  symphonyRuntimeWorkflowComparisonQuerySchema,
  symphonyRuntimeWorkflowComparisonResponseSchema,
  symphonyRuntimeWorkflowPathSchema
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

  runtimeRoutes.get("/runtime/config", (c) => {
    const result = services.runtimeConfig;

    c.get("logger").debug("Returning runtime config snapshot", {
      repositorySourceKind: result.bootstrap.repositorySource.kind,
      admittedRepositoryCount: result.admittedRepositories.length,
      bindingCatalogPresent: result.bindingCatalog !== null,
      presetId: result.bootstrap.presetSelection.presetId
    });

    symphonyRuntimeConfigResponseSchema.parse({
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

  runtimeRoutes.get("/workflows/:workflowId/observability", async (c) => {
    const path = parseWithSchema(symphonyRuntimeWorkflowPathSchema, c.req.param());
    const query = parseWithSchema(
      symphonyRuntimeWorkflowObservabilityQuerySchema,
      c.req.query()
    );
    const result = await services.workflowObservability.loadByWorkflowId({
      workflowId: path.workflowId,
      recordedAt: new Date().toISOString(),
      historyLimit: query.historyLimit,
      decisionLimit: query.decisionLimit
    });

    if (!result) {
      c.get("logger").warn("Runtime workflow observability not found", {
        workflowId: path.workflowId
      });
      throw createHttpError("NOT_FOUND", "Workflow observability not found.");
    }

    c.get("logger").debug("Returning runtime workflow observability by workflow id", {
      workflowId: result.workflow.workflowId,
      issueIdentifier: result.workflow.issueIdentifier,
      currentNode: result.snapshot?.currentNode ?? null
    });

    symphonyRuntimeWorkflowObservabilityResponseSchema.parse({
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

  runtimeRoutes.get("/:issueIdentifier/workflow-observability", async (c) => {
    const path = parseWithSchema(symphonyRuntimeIssuePathSchema, c.req.param());
    const query = parseWithSchema(
      symphonyRuntimeWorkflowObservabilityQuerySchema,
      c.req.query()
    );
    const result = await services.workflowObservability.loadByIssueIdentifier({
      issueIdentifier: path.issueIdentifier,
      recordedAt: new Date().toISOString(),
      historyLimit: query.historyLimit,
      decisionLimit: query.decisionLimit
    });

    if (!result) {
      c.get("logger").warn("Runtime workflow observability not found", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Workflow observability not found.");
    }

    c.get("logger").debug("Returning runtime workflow observability by issue", {
      workflowId: result.workflow.workflowId,
      issueIdentifier: result.workflow.issueIdentifier,
      currentNode: result.snapshot?.currentNode ?? null
    });

    symphonyRuntimeWorkflowObservabilityResponseSchema.parse({
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

  runtimeRoutes.post("/:issueIdentifier/clarification-answer", async (c) => {
    const path = parseWithSchema(symphonyRuntimeIssuePathSchema, c.req.param());
    const payload = parseWithSchema(
      symphonyRuntimeClarificationAnswerRequestSchema,
      await c.req.json()
    );
    const recordedAt = new Date().toISOString();
    const capability = await services.capabilityOperator.inspectByIssueIdentifier({
      issueIdentifier: path.issueIdentifier,
      recordedAt
    });

    if (!capability) {
      c.get("logger").warn("Capability operator state not found for issue", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Capability operator state not found.");
    }

    if (
      capability.planKind !== "awaiting_input" ||
      capability.pendingClarification === null
    ) {
      throw createHttpError(
        "VALIDATION_FAILED",
        "Issue is not waiting on a clarification answer."
      );
    }

    if (payload.requestId !== capability.pendingClarification.requestId) {
      throw createHttpError(
        "VALIDATION_FAILED",
        `Clarification request ${payload.requestId} is no longer current for ${path.issueIdentifier}.`
      );
    }

    const requiredQuestionIds = new Set(
      capability.pendingClarification.questions.map((question) => question.id)
    );
    for (const questionId of requiredQuestionIds) {
      if (!(questionId in payload.answers)) {
        throw createHttpError(
          "VALIDATION_FAILED",
          `Missing clarification answer for question ${questionId}.`
        );
      }
    }

    for (const questionId of Object.keys(payload.answers)) {
      if (!requiredQuestionIds.has(questionId)) {
        throw createHttpError(
          "VALIDATION_FAILED",
          `Unexpected clarification answer key ${questionId}.`
        );
      }
    }

    const result =
      await services.capabilityOperator.answerPendingClarificationByWorkflowId({
        workflowId: capability.workflowId,
        recordedAt,
        requestId: payload.requestId,
        answers: payload.answers
      });

    c.get("logger").info("Recorded capability clarification answer", {
      issueIdentifier: result.issueIdentifier,
      workflowId: result.workflowId,
      requestId: result.requestId,
      nextPlanKind: result.capability.planKind
    });

    services.realtime.publishIssueUpdated(result.issueIdentifier);

    symphonyRuntimeClarificationAnswerResponseSchema.parse({
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
    const recordedAt = new Date().toISOString();
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
    const capability = await services.capabilityOperator.inspectByIssueIdentifier({
      issueIdentifier: path.issueIdentifier,
      recordedAt
    });
    const result = serializeRuntimeIssue(
      services.orchestrator.snapshot(),
      services.runtimePolicy.github.repo,
      path.issueIdentifier,
      trackedIssue,
      workflowLifecycle?.trackerState ?? null,
      piSelectionPolicy,
      capability
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
