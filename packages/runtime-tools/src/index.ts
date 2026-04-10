import type {
  SymphonyIssueDeliveryReportStore,
  SymphonyIssueTimelineStore
} from "@symphony/db";
import type { SymphonyTracker } from "@symphony/tracker";

export const deliveryTransitionState = "In Review";
export const blockedDeliveryTransitionState = "Blocked";
export const runtimeMergeResultEventType = "merge_result_reported";

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

export type RuntimeMergeResult = {
  status: "merged" | "blocked";
  summary: string;
  prUrl: string | null;
  mergeCommitSha: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
};

type DeliveryTransitionResult = {
  attempted: boolean;
  targetState: string | null;
  success: boolean;
  reason: string | null;
};

type RuntimeToolIssueStateTransitionCallbackInput = {
  issueIdentifier: string;
  targetState: string;
  recordedAt: string;
  attempted: boolean;
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

type NormalizedMergeResultArguments = {
  status: "merged" | "blocked";
  summary: string;
  prUrl: string | null;
  mergeCommitSha: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
  rawPayload: unknown;
};

/**
 * Record the explicit delivery boundary for implementation and rework runs.
 */
export async function executeDeliveryReportTool(
  executionContext: {
    tracker: SymphonyTracker;
    deliveryReports: SymphonyIssueDeliveryReportStore;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state?: string | null;
    };
    runId: string | null;
    turnId: string | null;
    blockedTargetState?: string | null;
    onDeliveryReportRecorded?(delivery: RuntimeDeliveryReportResult): void;
    onIssueStateTransition?(
      transition: RuntimeToolIssueStateTransitionCallbackInput
    ): void | Promise<void>;
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

    const issueStateTransition = await transitionDeliveryIssueStateIfNeeded(
      executionContext,
      deliveryArguments.status
    );
    await maybeNotifyIssueStateTransition({
      issueIdentifier: executionContext.issue.identifier,
      issueStateTransition,
      onIssueStateTransition: executionContext.onIssueStateTransition
    });

    return buildToolResult(
      deliveryToolSucceeded(deliveryArguments.status, issueStateTransition),
      {
      reportId,
      issueIdentifier: executionContext.issue.identifier,
      runId: executionContext.runId,
      status: deliveryArguments.status,
      prUrl: deliveryArguments.prUrl,
      branchName: deliveryArguments.branchName,
      recorded: true,
      issueStateTransition
      }
    );
  } catch (error) {
    return buildToolErrorResult({
      message:
        error instanceof Error ? error.message : "Failed to record the issue delivery report."
    });
  }
}

/**
 * Record an investigation-style outcome that should leave a detailed comment and park the issue in a
 * non-active state.
 */
export async function executeSpikeResultTool(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state?: string | null;
    };
    defaultTargetState: string | null;
    onIssueStateTransition?(
      transition: RuntimeToolIssueStateTransitionCallbackInput
    ): void | Promise<void>;
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
    await executionContext.tracker.createComment(
      executionContext.issue.trackerIssueId,
      commentBody
    );

    const issueStateTransition = await transitionIssueStateIfNeeded(
      executionContext,
      targetState
    );
    await maybeNotifyIssueStateTransition({
      issueIdentifier: executionContext.issue.identifier,
      issueStateTransition,
      onIssueStateTransition: executionContext.onIssueStateTransition
    });

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

/**
 * Cancel the active issue with an explicit human-readable reason.
 */
export async function executeCancelTool(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state?: string | null;
    };
    defaultTargetState: string;
    onIssueStateTransition?(
      transition: RuntimeToolIssueStateTransitionCallbackInput
    ): void | Promise<void>;
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
      executionContext.issue.trackerIssueId,
      renderCancelComment({
        reason: cancelArguments.reason
      })
    );

    const issueStateTransition = await transitionIssueStateIfNeeded(
      executionContext,
      cancelArguments.targetState
    );
    await maybeNotifyIssueStateTransition({
      issueIdentifier: executionContext.issue.identifier,
      issueStateTransition,
      onIssueStateTransition: executionContext.onIssueStateTransition
    });

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

/**
 * Record the explicit merge outcome for approved merge runs.
 */
export async function executeMergeResultTool(
  executionContext: {
    tracker: SymphonyTracker;
    issueTimelineStore: SymphonyIssueTimelineStore;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state?: string | null;
    };
    runId: string | null;
    turnId: string | null;
    onMergeResultRecorded?(result: RuntimeMergeResult): void;
  },
  rawArguments: unknown
): Promise<RuntimeToolExecutionResult> {
  if (!executionContext.runId) {
    return buildToolErrorResult({
      message:
        "`symphony tool merge-result` requires an active persisted run. Symphony could not resolve the current run id."
    });
  }

  const mergeArguments = normalizeMergeResultArguments(rawArguments);
  if (!mergeArguments.ok) {
    return buildToolErrorResult({
      message: mergeArguments.message
    });
  }

  try {
    const mergeResult: RuntimeMergeResult = {
      status: mergeArguments.status,
      summary: mergeArguments.summary,
      prUrl: mergeArguments.prUrl,
      mergeCommitSha: mergeArguments.mergeCommitSha,
      blockingReason: mergeArguments.blockingReason,
      testsSummary: mergeArguments.testsSummary
    };

    await executionContext.tracker.createComment(
      executionContext.issue.trackerIssueId,
      renderMergeResultComment(mergeResult)
    );
    await executionContext.issueTimelineStore.record({
      issueIdentifier: executionContext.issue.identifier,
      runId: executionContext.runId,
      turnId: executionContext.turnId,
      source: "runtime",
      eventType: runtimeMergeResultEventType,
      message:
        mergeResult.status === "merged"
          ? "Recorded merge completion for the active approved run."
          : "Recorded blocked merge result for the active approved run.",
      payload: toJsonValue({
        ...mergeResult
      })
    });
    executionContext.onMergeResultRecorded?.(mergeResult);

    return buildToolSuccessResult({
      mergeResultRecorded: true,
      commentPosted: true,
      issueIdentifier: executionContext.issue.identifier,
      runId: executionContext.runId,
      ...mergeResult
    });
  } catch (error) {
    return buildToolErrorResult({
      message:
        error instanceof Error ? error.message : "Failed to record the merge result."
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

export function normalizeMergeResultArguments(
  rawArguments: unknown
):
  | ({
      ok: true;
    } & NormalizedMergeResultArguments)
  | {
      ok: false;
      message: string;
    } {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    return {
      ok: false,
      message:
        "`symphony tool merge-result` expects an object with `status`, `summary`, and the merge-result fields."
    };
  }

  const record = rawArguments as Record<string, unknown>;
  const status = getString(record, "status");
  const summary = getString(record, "summary");
  const prUrl = getOptionalString(record, "prUrl");
  const mergeCommitSha = getOptionalString(record, "mergeCommitSha");
  const blockingReason = getOptionalString(record, "blockingReason");
  const testsSummary = getOptionalString(record, "testsSummary");

  if (status !== "merged" && status !== "blocked") {
    return {
      ok: false,
      message:
        "`symphony tool merge-result.status` must be one of `merged` or `blocked`."
    };
  }

  if (!summary) {
    return {
      ok: false,
      message: "`symphony tool merge-result.summary` requires a non-empty string."
    };
  }

  if (status === "blocked" && !blockingReason) {
    return {
      ok: false,
      message:
        "`symphony tool merge-result` requires `blockingReason` when status is `blocked`."
    };
  }

  return {
    ok: true,
    status,
    summary,
    prUrl,
    mergeCommitSha,
    blockingReason,
    testsSummary,
    rawPayload: record
  };
}

async function transitionDeliveryIssueStateIfNeeded(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      trackerIssueId: string;
      identifier: string;
      state?: string | null;
    };
    blockedTargetState?: string | null;
  },
  status: "completed" | "blocked" | "partial"
): Promise<DeliveryTransitionResult> {
  let targetState: string | null = null;

  if (status === "completed") {
    targetState = deliveryTransitionState;
  } else if (status === "blocked") {
    targetState =
      normalizeOptionalText(executionContext.blockedTargetState) ??
      blockedDeliveryTransitionState;
  }

  if (!targetState) {
    return {
      attempted: false,
      targetState: null,
      success: false,
      reason: null
    };
  }

  return transitionIssueStateIfNeeded(executionContext, targetState);
}

function deliveryToolSucceeded(
  status: "completed" | "blocked" | "partial",
  issueStateTransition: DeliveryTransitionResult
): boolean {
  if (status === "partial") {
    return true;
  }

  return issueStateTransition.success;
}

async function transitionIssueStateIfNeeded(
  executionContext: {
    tracker: SymphonyTracker;
    issue: {
      trackerIssueId: string;
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
    await executionContext.tracker.updateIssueState(
      executionContext.issue.trackerIssueId,
      targetState
    );
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

async function maybeNotifyIssueStateTransition(input: {
  issueIdentifier: string;
  issueStateTransition: DeliveryTransitionResult;
  onIssueStateTransition?(
    transition: RuntimeToolIssueStateTransitionCallbackInput
  ): void | Promise<void>;
}): Promise<void> {
  if (
    !input.onIssueStateTransition ||
    !input.issueStateTransition.success ||
    !input.issueStateTransition.targetState
  ) {
    return;
  }

  await input.onIssueStateTransition({
    issueIdentifier: input.issueIdentifier,
    targetState: input.issueStateTransition.targetState,
    recordedAt: new Date().toISOString(),
    attempted: input.issueStateTransition.attempted,
    success: input.issueStateTransition.success,
    reason: input.issueStateTransition.reason
  });
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

function renderMergeResultComment(input: RuntimeMergeResult): string {
  const details = [
    `Status: ${input.status === "merged" ? "Merged" : "Blocked"}`,
    `Summary: ${input.summary.trim()}`,
    input.prUrl ? `PR: ${input.prUrl}` : null,
    input.mergeCommitSha ? `Merge commit: ${input.mergeCommitSha}` : null,
    input.testsSummary ? `Verification: ${input.testsSummary}` : null,
    input.blockingReason ? `Blocking reason: ${input.blockingReason}` : null
  ].filter((line): line is string => typeof line === "string" && line.trim() !== "");

  return ["## Merge Result", "", ...details].join("\n");
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
