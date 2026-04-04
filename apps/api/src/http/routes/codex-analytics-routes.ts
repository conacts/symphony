import { Hono } from "hono";
import {
  symphonyCodexAgentMessageListResponseSchema,
  symphonyCodexCommandExecutionListResponseSchema,
  symphonyCodexFileChangeListResponseSchema,
  symphonyCodexItemListResponseSchema,
  symphonyCodexReasoningListResponseSchema,
  symphonyCodexRunArtifactsResponseSchema,
  symphonyCodexRunPathSchema,
  symphonyCodexRunTurnFilterSchema,
  symphonyCodexToolCallListResponseSchema,
  symphonyCodexTurnListResponseSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { parseWithSchema } from "../../core/validation.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";

export function createCodexAnalyticsRoutes(
  services: SymphonyRuntimeAppServices
) {
  const codexRoutes = new Hono<SymphonyRuntimeAppContextSchema>();

  codexRoutes.get("/codex/runs/:runId/artifacts", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const result = await services.codexAnalytics.fetchRunArtifacts(path.runId);

    if (!result) {
      c.get("logger").warn("Codex run artifacts not found", {
        runId: path.runId
      });
      throw createHttpError("NOT_FOUND", "Run not found.");
    }

    c.get("logger").debug("Returning Codex run artifacts", {
      runId: path.runId,
      turnCount: result.turns.length,
      eventCount: result.events.length
    });

    symphonyCodexRunArtifactsResponseSchema.parse({
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

  codexRoutes.get("/codex/runs/:runId/turns", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const result = await services.codexAnalytics.listTurns(path.runId);

    c.get("logger").debug("Returning Codex turns", {
      runId: path.runId,
      count: result.turns.length
    });

    symphonyCodexTurnListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.turns.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/items", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());
    const result = await services.codexAnalytics.listItems({
      runId: path.runId,
      turnId: query.turnId
    });

    c.get("logger").debug("Returning Codex items", {
      runId: path.runId,
      turnId: query.turnId ?? null,
      count: result.items.length
    });

    symphonyCodexItemListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.items.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/command-executions", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());
    const result = await services.codexAnalytics.listCommandExecutions({
      runId: path.runId,
      turnId: query.turnId
    });

    c.get("logger").debug("Returning Codex command executions", {
      runId: path.runId,
      turnId: query.turnId ?? null,
      count: result.commandExecutions.length
    });

    symphonyCodexCommandExecutionListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.commandExecutions.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/tool-calls", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());
    const result = await services.codexAnalytics.listToolCalls({
      runId: path.runId,
      turnId: query.turnId
    });

    c.get("logger").debug("Returning Codex tool calls", {
      runId: path.runId,
      turnId: query.turnId ?? null,
      count: result.toolCalls.length
    });

    symphonyCodexToolCallListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.toolCalls.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/agent-messages", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());
    const result = await services.codexAnalytics.listAgentMessages({
      runId: path.runId,
      turnId: query.turnId
    });

    c.get("logger").debug("Returning Codex agent messages", {
      runId: path.runId,
      turnId: query.turnId ?? null,
      count: result.agentMessages.length
    });

    symphonyCodexAgentMessageListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.agentMessages.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/reasoning", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());
    const result = await services.codexAnalytics.listReasoning({
      runId: path.runId,
      turnId: query.turnId
    });

    c.get("logger").debug("Returning Codex reasoning rows", {
      runId: path.runId,
      turnId: query.turnId ?? null,
      count: result.reasoning.length
    });

    symphonyCodexReasoningListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.reasoning.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/file-changes", async (c) => {
    const path = parseWithSchema(symphonyCodexRunPathSchema, c.req.param());
    const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());
    const result = await services.codexAnalytics.listFileChanges({
      runId: path.runId,
      turnId: query.turnId
    });

    c.get("logger").debug("Returning Codex file changes", {
      runId: path.runId,
      turnId: query.turnId ?? null,
      count: result.fileChanges.length
    });

    symphonyCodexFileChangeListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      data: result,
      meta: {
        durationMs: 0,
        generatedAt: new Date().toISOString()
      }
    });

    return jsonOk(c, result, {
      count: result.fileChanges.length
    });
  });

  return codexRoutes;
}
