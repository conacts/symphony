import { Hono } from "hono";
import {
  symphonyForensicsIssueDetailResponseSchema,
  symphonyForensicsIssueForensicsBundleQuerySchema,
  symphonyForensicsIssueForensicsBundleResponseSchema,
  symphonyForensicsIssueListResponseSchema,
  symphonyForensicsIssuePathSchema,
  symphonyForensicsIssueQuerySchema,
  symphonyForensicsIssueTimelineQuerySchema,
  symphonyForensicsIssueTimelineResponseSchema,
  symphonyForensicsIssuesQuerySchema,
  symphonyForensicsProblemRunsQuerySchema,
  symphonyForensicsProblemRunsResponseSchema,
  symphonyForensicsRunDetailResponseSchema,
  symphonyForensicsRunPathSchema
} from "@symphony/contracts";
import type { SymphonyForensicsIssueFlag } from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { parseWithSchema } from "../../core/validation.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";

export function createForensicsRoutes(services: SymphonyRuntimeAppServices) {
  const forensicsRoutes = new Hono<SymphonyRuntimeAppContextSchema>();

  forensicsRoutes.get("/issues", async (c) => {
    const query = parseWithSchema(symphonyForensicsIssuesQuerySchema, c.req.query());
    const result = await services.forensics.issues({
      limit: query.limit,
      timeRange: query.timeRange,
      startedAfter: query.startedAfter,
      startedBefore: query.startedBefore,
      outcome: query.outcome,
      errorClass: query.errorClass,
      hasFlags: parseFlags(query.hasFlag),
      sortBy: query.sortBy,
      sortDirection: query.sortDirection
    });

    c.get("logger").debug("Returning forensics issue list", {
      limit: query.limit,
      outcome: query.outcome ?? null,
      errorClass: query.errorClass ?? null,
      count: result.issues.length
    });

    symphonyForensicsIssueListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.issues.length
    });
  });

  forensicsRoutes.get("/issues/:issueIdentifier/forensics-bundle", async (c) => {
    const path = parseWithSchema(symphonyForensicsIssuePathSchema, c.req.param());
    const query = parseWithSchema(
      symphonyForensicsIssueForensicsBundleQuerySchema,
      c.req.query()
    );
    const result = await services.forensics.issueForensicsBundle(
      path.issueIdentifier,
      {
        limit: query.limit,
        timeRange: query.timeRange,
        startedAfter: query.startedAfter,
        startedBefore: query.startedBefore,
        outcome: query.outcome,
        errorClass: query.errorClass,
        hasFlags: parseFlags(query.hasFlag),
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        recentRunLimit: query.recentRunLimit,
        timelineLimit: query.timelineLimit,
        runtimeLogLimit: query.runtimeLogLimit
      }
    );

    if (!result) {
      c.get("logger").warn("Forensics issue bundle not found", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

    c.get("logger").debug("Returning forensics issue bundle", {
      issueIdentifier: path.issueIdentifier,
      runCount: result.recentRuns.length,
      timelineCount: result.timeline.length,
      runtimeLogCount: result.runtimeLogs.length
    });

    symphonyForensicsIssueForensicsBundleResponseSchema.parse({
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

  forensicsRoutes.get("/issues/:issueIdentifier/timeline", async (c) => {
    const path = parseWithSchema(symphonyForensicsIssuePathSchema, c.req.param());
    const query = parseWithSchema(
      symphonyForensicsIssueTimelineQuerySchema,
      c.req.query()
    );
    const result = await services.issueTimeline.list({
      issueIdentifier: path.issueIdentifier,
      limit: query.limit
    });

    if (!result) {
      c.get("logger").warn("Forensics issue timeline not found", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

    c.get("logger").debug("Returning forensics issue timeline", {
      issueIdentifier: path.issueIdentifier,
      count: result.entries.length
    });

    symphonyForensicsIssueTimelineResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.entries.length
    });
  });

  forensicsRoutes.get("/issues/:issueIdentifier", async (c) => {
    const path = parseWithSchema(symphonyForensicsIssuePathSchema, c.req.param());
    const query = parseWithSchema(symphonyForensicsIssueQuerySchema, c.req.query());
    const result = await services.forensics.issueDetail(path.issueIdentifier, {
      limit: query.limit
    });

    if (!result) {
      c.get("logger").warn("Forensics issue detail not found", {
        issueIdentifier: path.issueIdentifier
      });
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

    c.get("logger").debug("Returning forensics issue detail", {
      issueIdentifier: path.issueIdentifier,
      runCount: result.runs.length
    });

    symphonyForensicsIssueDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.runs.length
    });
  });

  forensicsRoutes.get("/runs/:runId", async (c) => {
    const path = parseWithSchema(symphonyForensicsRunPathSchema, c.req.param());
    const result = await services.forensics.runDetail(path.runId);

    if (!result) {
      c.get("logger").warn("Forensics run detail not found", {
        runId: path.runId
      });
      throw createHttpError("NOT_FOUND", "Run not found.");
    }

    c.get("logger").debug("Returning forensics run detail", {
      runId: path.runId,
      turnCount: result.turns.length,
      eventCount: result.run.eventCount
    });

    symphonyForensicsRunDetailResponseSchema.parse({
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

  forensicsRoutes.get("/problem-runs", async (c) => {
    const query = parseWithSchema(
      symphonyForensicsProblemRunsQuerySchema,
      c.req.query()
    );
    const result = await services.forensics.problemRuns({
      limit: query.limit,
      outcome: query.outcome,
      issueIdentifier: query.issueIdentifier
    });

    c.get("logger").debug("Returning problem runs", {
      count: result.problemRuns.length,
      issueIdentifier: query.issueIdentifier ?? null,
      outcome: query.outcome ?? null
    });

    symphonyForensicsProblemRunsResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.problemRuns.length
    });
  });

  return forensicsRoutes;
}

function parseFlags(value: string | undefined): SymphonyForensicsIssueFlag[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is SymphonyForensicsIssueFlag => entry.length > 0);
}
