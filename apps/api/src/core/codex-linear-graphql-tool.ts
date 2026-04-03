import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyLogger } from "@symphony/logger";
import type { CodexAppServerToolExecutor } from "./codex-app-server-types.js";

export function buildLinearGraphqlToolExecutor(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  logger: SymphonyLogger
): CodexAppServerToolExecutor {
  return async (toolName, argumentsPayload) => {
    if (toolName !== "linear_graphql") {
      return buildToolErrorResult({
        message: `Unsupported dynamic tool: ${JSON.stringify(toolName)}.`,
        supportedTools: ["linear_graphql"]
      });
    }

    const normalizedArguments = normalizeLinearGraphqlArguments(argumentsPayload);
    if (!normalizedArguments.ok) {
      return buildToolErrorResult({
        message: normalizedArguments.message
      });
    }

    if (!runtimePolicy.tracker.apiKey) {
      return buildToolErrorResult({
        message:
          "Symphony is missing Linear auth. Export `LINEAR_API_KEY` for the runtime policy config."
      });
    }

    try {
      const response = await fetch(runtimePolicy.tracker.endpoint, {
        method: "POST",
        headers: {
          Authorization: runtimePolicy.tracker.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: normalizedArguments.query,
          variables: normalizedArguments.variables
        })
      });
      const body = (await response.json()) as Record<string, unknown>;
      const output = JSON.stringify(body, null, 2);
      const responseErrors = Array.isArray(body.errors) ? body.errors : null;

      return {
        success: response.ok && (!responseErrors || responseErrors.length === 0),
        output,
        contentItems: [
          {
            type: "inputText",
            text: output
          }
        ]
      };
    } catch (error) {
      logger.error("linear_graphql tool execution failed", {
        error
      });

      return buildToolErrorResult({
        message:
          "Linear GraphQL request failed before receiving a successful response.",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

function buildToolErrorResult(error: Record<string, unknown>): Record<string, unknown> {
  const output = JSON.stringify(
    {
      error
    },
    null,
    2
  );

  return {
    success: false,
    output,
    contentItems: [
      {
        type: "inputText",
        text: output
      }
    ]
  };
}

function normalizeLinearGraphqlArguments(
  argumentsPayload: unknown
):
  | {
      ok: true;
      query: string;
      variables: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
    } {
  if (typeof argumentsPayload === "string") {
    const query = argumentsPayload.trim();

    return query === ""
      ? {
          ok: false,
          message: "`linear_graphql` requires a non-empty `query` string."
        }
      : {
          ok: true,
          query,
          variables: {}
        };
  }

  if (!argumentsPayload || typeof argumentsPayload !== "object" || Array.isArray(argumentsPayload)) {
    return {
      ok: false,
      message:
        "`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`."
    };
  }

  const record = argumentsPayload as Record<string, unknown>;
  const query = getString(record, "query");
  if (!query) {
    return {
      ok: false,
      message: "`linear_graphql` requires a non-empty `query` string."
    };
  }

  const rawVariables = record.variables;
  if (
    rawVariables !== undefined &&
    rawVariables !== null &&
    (typeof rawVariables !== "object" || Array.isArray(rawVariables))
  ) {
    return {
      ok: false,
      message: "`linear_graphql.variables` must be a JSON object when provided."
    };
  }

  return {
    ok: true,
    query,
    variables:
      rawVariables && typeof rawVariables === "object"
        ? (rawVariables as Record<string, unknown>)
        : {}
  };
}

function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}
