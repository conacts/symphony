import { Hono } from "hono";
import {
  symphonyForensicsIssueDetailResponseSchema,
  symphonyForensicsIssueListResponseSchema,
  symphonyForensicsIssuePathSchema,
  symphonyForensicsIssueQuerySchema,
  symphonyForensicsIssuesQuerySchema,
  symphonyForensicsProblemRunsQuerySchema,
  symphonyForensicsProblemRunsResponseSchema,
  symphonyForensicsRunDetailResponseSchema,
  symphonyForensicsRunPathSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-services.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { parseWithSchema } from "../../core/validation.js";
import {
  serializeForensicsIssueDetail,
  serializeForensicsIssueList,
  serializeForensicsProblemRuns,
  serializeForensicsRunDetail
} from "../serializers.js";

export function createForensicsRoutes(services: SymphonyRuntimeAppServices) {
  const forensicsRoutes = new Hono<{
    Variables: {
      requestStartedAt: number;
    };
  }>();

  forensicsRoutes.get("/issues", async (c) => {
    const query = parseWithSchema(symphonyForensicsIssuesQuerySchema, c.req.query());
    const result = serializeForensicsIssueList(
      await services.forensics.issues({
        limit: query.limit
      })
    );

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

  forensicsRoutes.get("/issues/:issueIdentifier", async (c) => {
    const path = parseWithSchema(symphonyForensicsIssuePathSchema, c.req.param());
    const query = parseWithSchema(symphonyForensicsIssueQuerySchema, c.req.query());
    const result = await services.forensics.issueDetail(path.issueIdentifier, {
      limit: query.limit
    });

    if (!result) {
      throw createHttpError("NOT_FOUND", "Issue not found.");
    }

    const serialized = serializeForensicsIssueDetail(result);
    symphonyForensicsIssueDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: serialized,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, serialized, {
      count: serialized.runs.length
    });
  });

  forensicsRoutes.get("/runs/:runId", async (c) => {
    const path = parseWithSchema(symphonyForensicsRunPathSchema, c.req.param());
    const result = await services.forensics.runDetail(path.runId);

    if (!result) {
      throw createHttpError("NOT_FOUND", "Run not found.");
    }

    const serialized = serializeForensicsRunDetail(result);
    symphonyForensicsRunDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: serialized,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, serialized);
  });

  forensicsRoutes.get("/problem-runs", async (c) => {
    const query = parseWithSchema(
      symphonyForensicsProblemRunsQuerySchema,
      c.req.query()
    );
    const result = serializeForensicsProblemRuns(
      await services.forensics.problemRuns({
        limit: query.limit,
        outcome: query.outcome,
        issueIdentifier: query.issueIdentifier
      })
    );

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
