import { Hono, type Context } from "hono";
import {
  symphonyCodexAgentMessageListResponseSchema,
  symphonyCodexCommandExecutionListResponseSchema,
  symphonyCodexFileChangeListResponseSchema,
  symphonyCodexItemListResponseSchema,
  symphonyCodexOverflowPathSchema,
  symphonyCodexOverflowResponseSchema,
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
    const runId = parseCodexRunId(c);
    const result = await services.codexAnalytics.fetchRunArtifacts(runId);

    if (!result) {
      logCodexRunNotFound(c, "Codex run artifacts not found", runId);
      throw createHttpError("NOT_FOUND", "Run not found.");
    }

    c.get("logger").debug("Returning Codex run artifacts", {
      runId,
      turnCount: result.turns.length,
      eventCount: result.events.length
    });

    return validateAndSendCodexResponse(
      c,
      symphonyCodexRunArtifactsResponseSchema,
      result
    );
  });

  codexRoutes.get("/codex/runs/:runId/overflow/:overflowId", async (c) => {
    const { runId, overflowId } = parseCodexOverflowPath(c);
    const result = await services.codexAnalytics.fetchOverflow(runId, overflowId);

    if (!result) {
      logCodexRunNotFound(c, "Codex overflow not found", runId);
      throw createHttpError("NOT_FOUND", "Overflow not found.");
    }

    c.get("logger").debug("Returning Codex overflow payload", {
      runId,
      overflowId,
      kind: result.overflow.kind
    });

    return validateAndSendCodexResponse(
      c,
      symphonyCodexOverflowResponseSchema,
      result
    );
  });

  codexRoutes.get("/codex/runs/:runId/turns", async (c) => {
    const runId = parseCodexRunId(c);
    const result = await services.codexAnalytics.listTurns(runId);

    c.get("logger").debug("Returning Codex turns", {
      runId,
      count: result.turns.length
    });

    return validateAndSendCodexResponse(c, symphonyCodexTurnListResponseSchema, result, {
      count: result.turns.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/items", async (c) => {
    const { runId, turnId } = parseCodexRunTurnInput(c);
    const result = await services.codexAnalytics.listItems(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning Codex items", {
      runId,
      turnId,
      count: result.items.length
    });

    return validateAndSendCodexResponse(c, symphonyCodexItemListResponseSchema, result, {
      count: result.items.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/command-executions", async (c) => {
    const { runId, turnId } = parseCodexRunTurnInput(c);
    const result = await services.codexAnalytics.listCommandExecutions(
      toRunTurnQuery(runId, turnId)
    );

    c.get("logger").debug("Returning Codex command executions", {
      runId,
      turnId,
      count: result.commandExecutions.length
    });

    return validateAndSendCodexResponse(
      c,
      symphonyCodexCommandExecutionListResponseSchema,
      result,
      {
        count: result.commandExecutions.length
      }
    );
  });

  codexRoutes.get("/codex/runs/:runId/tool-calls", async (c) => {
    const { runId, turnId } = parseCodexRunTurnInput(c);
    const result = await services.codexAnalytics.listToolCalls(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning Codex tool calls", {
      runId,
      turnId,
      count: result.toolCalls.length
    });

    return validateAndSendCodexResponse(c, symphonyCodexToolCallListResponseSchema, result, {
      count: result.toolCalls.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/agent-messages", async (c) => {
    const { runId, turnId } = parseCodexRunTurnInput(c);
    const result = await services.codexAnalytics.listAgentMessages(
      toRunTurnQuery(runId, turnId)
    );

    c.get("logger").debug("Returning Codex agent messages", {
      runId,
      turnId,
      count: result.agentMessages.length
    });

    return validateAndSendCodexResponse(
      c,
      symphonyCodexAgentMessageListResponseSchema,
      result,
      {
        count: result.agentMessages.length
      }
    );
  });

  codexRoutes.get("/codex/runs/:runId/reasoning", async (c) => {
    const { runId, turnId } = parseCodexRunTurnInput(c);
    const result = await services.codexAnalytics.listReasoning(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning Codex reasoning rows", {
      runId,
      turnId,
      count: result.reasoning.length
    });

    return validateAndSendCodexResponse(c, symphonyCodexReasoningListResponseSchema, result, {
      count: result.reasoning.length
    });
  });

  codexRoutes.get("/codex/runs/:runId/file-changes", async (c) => {
    const { runId, turnId } = parseCodexRunTurnInput(c);
    const result = await services.codexAnalytics.listFileChanges(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning Codex file changes", {
      runId,
      turnId,
      count: result.fileChanges.length
    });

    return validateAndSendCodexResponse(c, symphonyCodexFileChangeListResponseSchema, result, {
      count: result.fileChanges.length
    });
  });

  return codexRoutes;
}

type CodexRouteContext = Context<SymphonyRuntimeAppContextSchema>;

function parseCodexRunId(c: CodexRouteContext): string {
  return parseWithSchema(symphonyCodexRunPathSchema, c.req.param()).runId;
}

function parseCodexRunTurnInput(
  c: CodexRouteContext
): { runId: string; turnId: string | null } {
  const runId = parseCodexRunId(c);
  const query = parseWithSchema(symphonyCodexRunTurnFilterSchema, c.req.query());

  return {
    runId,
    turnId: query.turnId ?? null
  };
}

function parseCodexOverflowPath(
  c: CodexRouteContext
): { runId: string; overflowId: string } {
  return parseWithSchema(symphonyCodexOverflowPathSchema, c.req.param());
}

function toRunTurnQuery(runId: string, turnId: string | null) {
  return turnId ? { runId, turnId } : { runId };
}

function logCodexRunNotFound(c: CodexRouteContext, message: string, runId: string) {
  c.get("logger").warn(message, {
    runId
  });
}

function validateAndSendCodexResponse<T>(
  c: CodexRouteContext,
  responseSchema: {
    parse(input: unknown): unknown;
  },
  data: T,
  meta: {
    count?: number;
  } = {}
) {
  responseSchema.parse({
    schemaVersion: "1",
    ok: true,
    data,
    meta: {
      durationMs: 0,
      generatedAt: new Date().toISOString()
    }
  });

  return jsonOk(c, data, meta.count === undefined ? undefined : { count: meta.count });
}
