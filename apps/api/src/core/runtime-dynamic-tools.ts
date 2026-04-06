import type { SymphonyIssueDeliveryReportStore } from "@symphony/db";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyLogger } from "@symphony/logger";
import type { HarnessToolExecutor } from "@symphony/agent-harnesses";
import type { SymphonyTracker } from "@symphony/tracker";

const linearGraphqlToolName = "linear_graphql";
const reportIssueDeliveryToolName = "report_issue_delivery";
const deliveryTransitionState = "In Review";

export function buildRuntimeDynamicToolExecutor(input: {
  runtimePolicy: SymphonyAgentRuntimeConfig;
  logger: SymphonyLogger;
  tracker: SymphonyTracker;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  issue: {
    id: string;
    identifier: string;
    state?: string | null;
  };
  runId: string | null;
  readTurnId(): string | null;
  onDeliveryReportRecorded?(delivery: RuntimeDeliveryReportResult): void;
}): HarnessToolExecutor {
  return async (toolName, argumentsPayload) => {
    switch (toolName) {
      case linearGraphqlToolName:
        return await executeLinearGraphqlTool(input.runtimePolicy, input.logger, argumentsPayload);
      case reportIssueDeliveryToolName:
        return await executeDeliveryReportTool(input, argumentsPayload);
      default:
        return buildToolErrorResult({
          message: `Unsupported dynamic tool: ${JSON.stringify(toolName)}.`,
          supportedTools: [linearGraphqlToolName, reportIssueDeliveryToolName]
        });
    }
  };
}

export type RuntimeDeliveryReportResult = {
  reportId: string;
  status: "completed" | "blocked" | "partial";
  summary: string;
  prUrl: string | null;
  blockingReason: string | null;
};

type NormalizedDeliveryReportArguments = {
  status: "completed" | "blocked" | "partial";
  summary: string;
  prUrl: string | null;
  prNumber: string | null;
  branchName: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
  rawPayload: unknown;
};

async function executeDeliveryReportTool(
  input: {
    tracker: SymphonyTracker;
    deliveryReports: SymphonyIssueDeliveryReportStore;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
    runId: string | null;
    readTurnId(): string | null;
    onDeliveryReportRecorded?(delivery: RuntimeDeliveryReportResult): void;
  },
  argumentsPayload: unknown
): Promise<Record<string, unknown>> {
  if (!input.runId) {
    return buildToolErrorResult({
      message:
        "`report_issue_delivery` requires an active persisted run. Symphony could not resolve the current run id."
    });
  }

  const normalizedArguments = normalizeDeliveryReportArguments(argumentsPayload);
  if (!normalizedArguments.ok) {
    return buildToolErrorResult({
      message: normalizedArguments.message
    });
  }

  try {
    const reportId = await input.deliveryReports.record({
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      turnId: input.readTurnId(),
      status: normalizedArguments.status,
      summary: normalizedArguments.summary,
      prUrl: normalizedArguments.prUrl,
      prNumber: normalizedArguments.prNumber,
      branchName: normalizedArguments.branchName,
      blockingReason: normalizedArguments.blockingReason,
      testsSummary: normalizedArguments.testsSummary,
      source: "pi",
      payload: toJsonValue(normalizedArguments.rawPayload)
    });

    const deliveryResult: RuntimeDeliveryReportResult = {
      reportId,
      status: normalizedArguments.status,
      summary: normalizedArguments.summary,
      prUrl: normalizedArguments.prUrl,
      blockingReason: normalizedArguments.blockingReason
    };
    input.onDeliveryReportRecorded?.(deliveryResult);

    const transition = await maybeTransitionDeliveredIssueToInReview(
      input,
      normalizedArguments.status
    );

    const output = JSON.stringify(
      {
        reportId,
        issueIdentifier: input.issue.identifier,
        runId: input.runId,
        status: normalizedArguments.status,
        prUrl: normalizedArguments.prUrl,
        branchName: normalizedArguments.branchName,
        recorded: true,
        issueStateTransition: transition
      },
      null,
      2
    );

    return {
      success: true,
      output,
      contentItems: [
        {
          type: "inputText",
          text: output
        }
      ]
    };
  } catch (error) {
    return buildToolErrorResult({
      message:
        error instanceof Error ? error.message : "Failed to record the issue delivery report."
    });
  }
}

async function maybeTransitionDeliveredIssueToInReview(
  input: {
    tracker: SymphonyTracker;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
  },
  status: "completed" | "blocked" | "partial"
): Promise<{
  attempted: boolean;
  targetState: string | null;
  success: boolean;
  reason: string | null;
}> {
  if (status !== "completed") {
    return {
      attempted: false,
      targetState: null,
      success: false,
      reason: null
    };
  }

  if (input.issue.state?.trim().toLowerCase() === deliveryTransitionState.toLowerCase()) {
    return {
      attempted: false,
      targetState: deliveryTransitionState,
      success: true,
      reason: null
    };
  }

  try {
    await input.tracker.updateIssueState(input.issue.id, deliveryTransitionState);
    return {
      attempted: true,
      targetState: deliveryTransitionState,
      success: true,
      reason: null
    };
  } catch (error) {
    return {
      attempted: true,
      targetState: deliveryTransitionState,
      success: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function executeLinearGraphqlTool(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  logger: SymphonyLogger,
  argumentsPayload: unknown
): Promise<Record<string, unknown>> {
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

function normalizeDeliveryReportArguments(
  argumentsPayload: unknown
):
  | ({
      ok: true;
    } & NormalizedDeliveryReportArguments)
  | {
      ok: false;
      message: string;
    } {
  if (!argumentsPayload || typeof argumentsPayload !== "object" || Array.isArray(argumentsPayload)) {
    return {
      ok: false,
      message:
        "`report_issue_delivery` expects an object with `status`, `summary`, and the relevant delivery fields."
    };
  }

  const record = argumentsPayload as Record<string, unknown>;
  const status = getString(record, "status");
  const summary = getString(record, "summary");
  const prUrl = getOptionalString(record, "prUrl");
  const prNumber = getOptionalString(record, "prNumber");
  const branchName = getOptionalString(record, "branchName");
  const blockingReason = getOptionalString(record, "blockingReason");
  const testsSummary = getOptionalString(record, "testsSummary");

  if (status !== "completed" && status !== "blocked" && status !== "partial") {
    return {
      ok: false,
      message:
        "`report_issue_delivery.status` must be one of `completed`, `blocked`, or `partial`."
    };
  }

  if (!summary) {
    return {
      ok: false,
      message: "`report_issue_delivery.summary` requires a non-empty string."
    };
  }

  if (status === "completed" && !prUrl) {
    return {
      ok: false,
      message: "`report_issue_delivery` requires `prUrl` when status is `completed`."
    };
  }

  if (status === "blocked" && !blockingReason) {
    return {
      ok: false,
      message:
        "`report_issue_delivery` requires `blockingReason` when status is `blocked`."
    };
  }

  return {
    ok: true,
    status,
    summary,
    prUrl,
    prNumber,
    branchName,
    blockingReason,
    testsSummary,
    rawPayload: record
  };
}

function getOptionalString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  if (nested == null) {
    return null;
  }
  return typeof nested === "string" && nested.trim() !== "" ? nested.trim() : null;
}

function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  return getOptionalString(value, key);
}

function toJsonValue(value: unknown) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}
