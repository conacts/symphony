import type { SymphonyIssueDeliveryReportStore } from "@symphony/db";
import type { SymphonyTracker } from "@symphony/tracker";

export const deliveryTransitionState = "In Review";

export type RuntimeToolExecutionResult = {
  success: boolean;
  output: string;
  contentItems: Array<{
    type: "inputText";
    text: string;
  }>;
};

export type RuntimeDeliveryReportResult = {
  reportId: string;
  status: "completed" | "blocked" | "partial";
  summary: string;
  prUrl: string | null;
  blockingReason: string | null;
};

type DeliveryTransitionResult = {
  attempted: boolean;
  targetState: string | null;
  success: boolean;
  reason: string | null;
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

type NormalizedSpikeResultArguments = {
  summary: string;
  details: string;
  targetState: string | null;
  rawPayload: unknown;
};

type NormalizedCancelArguments = {
  reason: string;
  targetState: string;
  rawPayload: unknown;
};

export async function executeDeliveryReportTool(
  executionContext: {
    tracker: SymphonyTracker;
    deliveryReports: SymphonyIssueDeliveryReportStore;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
    runId: string | null;
    turnId: string | null;
    onDeliveryReportRecorded?(delivery: RuntimeDeliveryReportResult): void;
  },
  rawArguments: unknown
): Promise<RuntimeToolExecutionResult> {
  if (!executionContext.runId) {
    return buildToolErrorResult({
      message:
        "`symphony tool finish` requires an active persisted run. Symphony could not resolve the current run id."
    });
  }

  const deliveryArguments = normalizeDeliveryReportArguments(rawArguments);
  if (!deliveryArguments.ok) {
    return buildToolErrorResult({
      message: deliveryArguments.message
    });
  }

  try {
    const reportId = await executionContext.deliveryReports.record({
      issueId: executionContext.issue.id,
      issueIdentifier: executionContext.issue.identifier,
      runId: executionContext.runId,
      turnId: executionContext.turnId,
      status: deliveryArguments.status,
      summary: deliveryArguments.summary,
      prUrl: deliveryArguments.prUrl,
      prNumber: deliveryArguments.prNumber,
      branchName: deliveryArguments.branchName,
      blockingReason: deliveryArguments.blockingReason,
      testsSummary: deliveryArguments.testsSummary,
      source: "pi",
      payload: toJsonValue(deliveryArguments.rawPayload)
    });

    const deliveryResult: RuntimeDeliveryReportResult = {
      reportId,
      status: deliveryArguments.status,
      summary: deliveryArguments.summary,
      prUrl: deliveryArguments.prUrl,
      blockingReason: deliveryArguments.blockingReason
    };
    executionContext.onDeliveryReportRecorded?.(deliveryResult);

    const issueStateTransition = await transitionDeliveredIssueToInReviewIfNeeded(
      executionContext,
      deliveryArguments.status
    );

    return buildToolSuccessResult({
      reportId,
      issueIdentifier: executionContext.issue.identifier,
      runId: executionContext.runId,
      status: deliveryArguments.status,
      prUrl: deliveryArguments.prUrl,
      branchName: deliveryArguments.branchName,
      recorded: true,
      issueStateTransition
    });
  } catch (error) {
    return buildToolErrorResult({
      message:
        error instanceof Error ? error.message : "Failed to record the issue delivery report."
    });
  }
}

export async function executeSpikeResultTool(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
    defaultTargetState: string | null;
  },
  rawArguments: unknown
): Promise<RuntimeToolExecutionResult> {
  const spikeArguments = normalizeSpikeResultArguments(rawArguments);
  if (!spikeArguments.ok) {
    return buildToolErrorResult({
      message: spikeArguments.message
    });
  }

  const targetState =
    spikeArguments.targetState ?? normalizeOptionalText(executionContext.defaultTargetState);
  if (!targetState) {
    return buildToolErrorResult({
      message:
        "`symphony tool spike-result` requires a target state. Provide `state` explicitly or configure a default pause state."
    });
  }

  try {
    const commentBody = renderSpikeResultComment({
      summary: spikeArguments.summary,
      details: spikeArguments.details
    });
    await executionContext.tracker.createComment(executionContext.issue.id, commentBody);

    const issueStateTransition = await transitionIssueStateIfNeeded(
      executionContext,
      targetState
    );

    return buildToolResult(issueStateTransition.success, {
      commentPosted: true,
      issueIdentifier: executionContext.issue.identifier,
      summary: spikeArguments.summary,
      targetState,
      issueStateTransition
    });
  } catch (error) {
    return buildToolErrorResult({
      message: error instanceof Error ? error.message : "Failed to submit the spike result."
    });
  }
}

export async function executeCancelTool(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
    defaultTargetState: string;
  },
  rawArguments: unknown
): Promise<RuntimeToolExecutionResult> {
  const cancelArguments = normalizeCancelArguments(
    rawArguments,
    executionContext.defaultTargetState
  );
  if (!cancelArguments.ok) {
    return buildToolErrorResult({
      message: cancelArguments.message
    });
  }

  try {
    await executionContext.tracker.createComment(
      executionContext.issue.id,
      renderCancelComment({
        reason: cancelArguments.reason
      })
    );

    const issueStateTransition = await transitionIssueStateIfNeeded(
      executionContext,
      cancelArguments.targetState
    );

    return buildToolResult(issueStateTransition.success, {
      canceled: true,
      issueIdentifier: executionContext.issue.identifier,
      reason: cancelArguments.reason,
      targetState: cancelArguments.targetState,
      issueStateTransition
    });
  } catch (error) {
    return buildToolErrorResult({
      message: error instanceof Error ? error.message : "Failed to cancel the issue."
    });
  }
}

export function normalizeDeliveryReportArguments(
  rawArguments: unknown
):
  | ({
      ok: true;
    } & NormalizedDeliveryReportArguments)
  | {
      ok: false;
      message: string;
    } {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    return {
      ok: false,
      message:
        "`symphony tool finish` expects an object with `status`, `summary`, and the relevant delivery fields."
    };
  }

  const record = rawArguments as Record<string, unknown>;
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
        "`symphony tool finish.status` must be one of `completed`, `blocked`, or `partial`."
    };
  }

  if (!summary) {
    return {
      ok: false,
      message: "`symphony tool finish.summary` requires a non-empty string."
    };
  }

  if (status === "completed" && !prUrl) {
    return {
      ok: false,
      message: "`symphony tool finish` requires `prUrl` when status is `completed`."
    };
  }

  if (status === "blocked" && !blockingReason) {
    return {
      ok: false,
      message:
        "`symphony tool finish` requires `blockingReason` when status is `blocked`."
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

export function normalizeSpikeResultArguments(
  rawArguments: unknown
):
  | ({
      ok: true;
    } & NormalizedSpikeResultArguments)
  | {
      ok: false;
      message: string;
    } {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    return {
      ok: false,
      message:
        "`symphony tool spike-result` expects an object with `summary`, `details`, and an optional `state`."
    };
  }

  const record = rawArguments as Record<string, unknown>;
  const summary = getString(record, "summary");
  const details = getString(record, "details");
  const targetState = getOptionalString(record, "state");

  if (!summary) {
    return {
      ok: false,
      message: "`symphony tool spike-result.summary` requires a non-empty string."
    };
  }

  if (!details) {
    return {
      ok: false,
      message: "`symphony tool spike-result.details` requires a non-empty string."
    };
  }

  return {
    ok: true,
    summary,
    details,
    targetState,
    rawPayload: record
  };
}

export function normalizeCancelArguments(
  rawArguments: unknown,
  defaultTargetState: string
):
  | ({
      ok: true;
    } & NormalizedCancelArguments)
  | {
      ok: false;
      message: string;
    } {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    return {
      ok: false,
      message:
        "`symphony tool cancel` expects an object with `reason` and an optional `state`."
    };
  }

  const record = rawArguments as Record<string, unknown>;
  const reason = getString(record, "reason");
  const targetState = getOptionalString(record, "state") ?? defaultTargetState;

  if (!reason) {
    return {
      ok: false,
      message: "`symphony tool cancel.reason` requires a non-empty string."
    };
  }

  if (!targetState || targetState.trim() === "") {
    return {
      ok: false,
      message:
        "`symphony tool cancel` requires a non-empty target state. Provide `state` explicitly or configure a default canceled state."
    };
  }

  return {
    ok: true,
    reason,
    targetState,
    rawPayload: record
  };
}

async function transitionDeliveredIssueToInReviewIfNeeded(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
  },
  status: "completed" | "blocked" | "partial"
): Promise<DeliveryTransitionResult> {
  if (status !== "completed") {
    return {
      attempted: false,
      targetState: null,
      success: false,
      reason: null
    };
  }

  return transitionIssueStateIfNeeded(executionContext, deliveryTransitionState);
}

async function transitionIssueStateIfNeeded(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      id: string;
      identifier: string;
      state?: string | null;
    };
  },
  targetState: string
): Promise<DeliveryTransitionResult> {
  if (normalizeOptionalText(executionContext.issue.state)?.toLowerCase() === targetState.toLowerCase()) {
    return {
      attempted: false,
      targetState,
      success: true,
      reason: null
    };
  }

  try {
    await executionContext.tracker.updateIssueState(executionContext.issue.id, targetState);
    return {
      attempted: true,
      targetState,
      success: true,
      reason: null
    };
  } catch (error) {
    return {
      attempted: true,
      targetState,
      success: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildToolSuccessResult(payload: Record<string, unknown>): RuntimeToolExecutionResult {
  return buildToolResult(true, payload);
}

function buildToolErrorResult(error: Record<string, unknown>): RuntimeToolExecutionResult {
  return buildToolResult(false, {
    error
  });
}

function buildToolResult(
  success: boolean,
  payload: Record<string, unknown>
): RuntimeToolExecutionResult {
  const serializedPayload = JSON.stringify(payload, null, 2);

  return {
    success,
    output: serializedPayload,
    contentItems: [
      {
        type: "inputText",
        text: serializedPayload
      }
    ]
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

function renderSpikeResultComment(input: {
  summary: string;
  details: string;
}): string {
  return [
    "## Spike Result",
    "",
    input.summary.trim(),
    "",
    input.details.trim()
  ].join("\n");
}

function renderCancelComment(input: { reason: string }): string {
  return [
    "## Cancellation",
    "",
    input.reason.trim()
  ].join("\n");
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toJsonValue(value: unknown) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}
