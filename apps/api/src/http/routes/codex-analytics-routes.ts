import { Hono, type Context } from "hono";
import {
  symphonyAgentCommandExecutionListResponseSchema,
  symphonyAgentFileChangeListResponseSchema,
  symphonyAgentItemListResponseSchema,
  symphonyAgentMessageListResponseSchema,
  symphonyAgentOverflowPathSchema,
  symphonyAgentOverflowResponseSchema,
  symphonyAgentReasoningBlockListResponseSchema,
  symphonyAgentRunArtifactsResponseSchema,
  symphonyAgentRunPathSchema,
  symphonyAgentRunTurnFilterSchema,
  symphonyAgentToolCallListResponseSchema,
  symphonyAgentTurnListResponseSchema
} from "@symphony/contracts";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-app-types.js";
import { createHttpError } from "../../core/errors.js";
import { jsonOk } from "../../core/envelope.js";
import { parseWithSchema } from "../../core/validation.js";
import type { SymphonyRuntimeAppContextSchema } from "../context.js";

export function createAgentAnalyticsRoutes(
  services: SymphonyRuntimeAppServices
) {
  const agentRoutes = new Hono<SymphonyRuntimeAppContextSchema>();

  agentRoutes.get("/agent/runs/:runId/artifacts", async (c) => {
    const runId = parseAgentRunId(c);
    const result = await services.agentAnalytics.fetchRunArtifacts(runId);

    if (!result) {
      logAgentRunNotFound(c, "Agent run artifacts not found", runId);
      throw createHttpError("NOT_FOUND", "Run not found.");
    }

    c.get("logger").debug("Returning agent run artifacts", {
      runId,
      turnCount: result.turns.length,
      eventCount: result.events.length
    });

    return validateAndSendAgentResponse(
      c,
      symphonyAgentRunArtifactsResponseSchema,
      result
    );
  });

  agentRoutes.get("/agent/runs/:runId/overflow/:overflowId", async (c) => {
    const { runId, overflowId } = parseAgentOverflowPath(c);
    const result = await services.agentAnalytics.fetchOverflow(runId, overflowId);

    if (!result) {
      logAgentRunNotFound(c, "Agent overflow not found", runId);
      throw createHttpError("NOT_FOUND", "Overflow not found.");
    }

    c.get("logger").debug("Returning agent overflow payload", {
      runId,
      overflowId,
      kind: result.overflow.kind
    });

    return validateAndSendAgentResponse(
      c,
      symphonyAgentOverflowResponseSchema,
      result
    );
  });

  agentRoutes.get("/agent/runs/:runId/turns", async (c) => {
    const runId = parseAgentRunId(c);
    const result = await services.agentAnalytics.listTurns(runId);

    c.get("logger").debug("Returning agent turns", {
      runId,
      count: result.turns.length
    });

    return validateAndSendAgentResponse(c, symphonyAgentTurnListResponseSchema, result, {
      count: result.turns.length
    });
  });

  agentRoutes.get("/agent/runs/:runId/items", async (c) => {
    const { runId, turnId } = parseAgentRunTurnInput(c);
    const result = await services.agentAnalytics.listItems(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning agent items", {
      runId,
      turnId,
      count: result.items.length
    });

    return validateAndSendAgentResponse(c, symphonyAgentItemListResponseSchema, result, {
      count: result.items.length
    });
  });

  agentRoutes.get("/agent/runs/:runId/command-executions", async (c) => {
    const { runId, turnId } = parseAgentRunTurnInput(c);
    const result = await services.agentAnalytics.listCommandExecutions(
      toRunTurnQuery(runId, turnId)
    );

    c.get("logger").debug("Returning agent command executions", {
      runId,
      turnId,
      count: result.commandExecutions.length
    });

    return validateAndSendAgentResponse(
      c,
      symphonyAgentCommandExecutionListResponseSchema,
      result,
      {
        count: result.commandExecutions.length
      }
    );
  });

  agentRoutes.get("/agent/runs/:runId/tool-calls", async (c) => {
    const { runId, turnId } = parseAgentRunTurnInput(c);
    const result = await services.agentAnalytics.listToolCalls(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning agent tool calls", {
      runId,
      turnId,
      count: result.toolCalls.length
    });

    return validateAndSendAgentResponse(c, symphonyAgentToolCallListResponseSchema, result, {
      count: result.toolCalls.length
    });
  });

  agentRoutes.get("/agent/runs/:runId/agent-messages", async (c) => {
    const { runId, turnId } = parseAgentRunTurnInput(c);
    const result = await services.agentAnalytics.listAgentMessages(
      toRunTurnQuery(runId, turnId)
    );

    c.get("logger").debug("Returning agent messages", {
      runId,
      turnId,
      count: result.agentMessages.length
    });

    return validateAndSendAgentResponse(
      c,
      symphonyAgentMessageListResponseSchema,
      result,
      {
        count: result.agentMessages.length
      }
    );
  });

  agentRoutes.get("/agent/runs/:runId/reasoning", async (c) => {
    const { runId, turnId } = parseAgentRunTurnInput(c);
    const result = await services.agentAnalytics.listReasoning(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning agent reasoning rows", {
      runId,
      turnId,
      count: result.reasoning.length
    });

    return validateAndSendAgentResponse(c, symphonyAgentReasoningBlockListResponseSchema, result, {
      count: result.reasoning.length
    });
  });

  agentRoutes.get("/agent/runs/:runId/file-changes", async (c) => {
    const { runId, turnId } = parseAgentRunTurnInput(c);
    const result = await services.agentAnalytics.listFileChanges(toRunTurnQuery(runId, turnId));

    c.get("logger").debug("Returning agent file changes", {
      runId,
      turnId,
      count: result.fileChanges.length
    });

    return validateAndSendAgentResponse(c, symphonyAgentFileChangeListResponseSchema, result, {
      count: result.fileChanges.length
    });
  });

  return agentRoutes;
}

type CodexRouteContext = Context<SymphonyRuntimeAppContextSchema>;

function parseAgentRunId(c: CodexRouteContext): string {
  return parseWithSchema(symphonyAgentRunPathSchema, c.req.param()).runId;
}

function parseAgentRunTurnInput(
  c: CodexRouteContext
): { runId: string; turnId: string | null } {
  const runId = parseAgentRunId(c);
  const query = parseWithSchema(symphonyAgentRunTurnFilterSchema, c.req.query());

  return {
    runId,
    turnId: query.turnId ?? null
  };
}

function parseAgentOverflowPath(
  c: CodexRouteContext
): { runId: string; overflowId: string } {
  return parseWithSchema(symphonyAgentOverflowPathSchema, c.req.param());
}

function toRunTurnQuery(runId: string, turnId: string | null) {
  return turnId ? { runId, turnId } : { runId };
}

function logAgentRunNotFound(c: CodexRouteContext, message: string, runId: string) {
  c.get("logger").warn(message, {
    runId
  });
}

function validateAndSendAgentResponse<T>(
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
