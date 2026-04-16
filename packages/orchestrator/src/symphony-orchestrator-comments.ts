import type { JsonObject } from "@symphony/contracts";
import type { WorkspaceCleanupMode } from "@symphony/workspace";
import { asJsonObject } from "./internal/json.js";
import {
  issueBranchName,
  type SymphonyTrackerIssue
} from "@symphony/tracker";

type SymphonyFailureCommentOptions = {
  rateLimits?: JsonObject | null;
  expectedTrackerState?: string | null;
  workspaceCleanupMode?: WorkspaceCleanupMode | null;
};

export function claimTransitionCommentBody(
  issue: SymphonyTrackerIssue,
  targetState: string
): string {
  return [
    "Symphony status update.",
    "",
    `State: \`${targetState}\``,
    `What changed: picked up the ticket and moved it from \`${issue.state}\` to \`${targetState}\`.`,
    `Branch: \`${issueBranchName(issue.identifier)}\``,
    "Next update: Symphony will leave another status note when it hits a blocker, opens the first PR, or hands the ticket off for review."
  ].join("\n");
}

export function buildFailureCommentBody(
  issue: SymphonyTrackerIssue,
  reason: string,
  outcome: string,
  options: SymphonyFailureCommentOptions = {}
): string {
  const actionDirective = buildFailureActionDirective(outcome);

  return [
    failureCommentTitle(issue, outcome, reason, options.expectedTrackerState),
    "",
    `State: \`${issue.state}\``,
    `What changed: ${failureCommentWhatChanged(outcome, reason)}`,
    failureCommentDetailBlock(
      failureCommentDetails(issue, reason, outcome, options)
    ),
    failureCommentWorkspacePolicyLine(options.workspaceCleanupMode),
    actionDirective.retryPolicy === null
      ? null
      : `Retry policy: ${actionDirective.retryPolicy}`,
    "",
    `Next step: ${actionDirective.nextStep}`,
    buildFailureRequeueLine({
      issue,
      requeueToState: actionDirective.requeueToState,
      expectedTrackerState: options.expectedTrackerState
    })
  ]
    .filter((line): line is string => typeof line === "string" && line !== "")
    .join("\n");
}

function truncateReason(reason: string, maxLength = 1_000): string {
  if (reason.length <= maxLength) {
    return reason;
  }

  return `${reason.slice(0, maxLength)}...`;
}

function failureCommentTitle(
  issue: SymphonyTrackerIssue,
  outcome: string,
  reason: string,
  expectedTrackerState: string | null | undefined
): string {
  if (outcome === "startup_failed") {
    return "Symphony agent startup failed.";
  }

  if (outcome === "paused_max_turns") {
    return issueMatchesExpectedTrackerState(issue, expectedTrackerState)
      ? "Symphony agent paused after reaching max turns."
      : "Symphony agent stopped after reaching max turns.";
  }

  if (outcome === "paused_stalled") {
    return issueMatchesExpectedTrackerState(issue, expectedTrackerState)
      ? "Symphony agent paused after the run stalled."
      : "Symphony agent stopped after the run stalled.";
  }

  if (outcome === "paused_provider_transient") {
    return issueMatchesExpectedTrackerState(issue, expectedTrackerState)
      ? "Symphony agent paused after repeated transient provider failures."
      : "Symphony agent stopped after repeated transient provider failures.";
  }

  if (outcome === "paused_failure") {
    return issueMatchesExpectedTrackerState(issue, expectedTrackerState)
      ? "Symphony agent paused after a runtime failure."
      : "Symphony agent stopped after a runtime failure.";
  }

  if (outcome === "blocked_repo") {
    return "Symphony agent reported a repo or workspace blocker.";
  }

  if (outcome === "blocked_merge") {
    return "Symphony merge automation reported a merge blocker.";
  }

  if (outcome === "blocked_merge_max_turns") {
    return "Symphony merge automation stopped after reaching max turns.";
  }

  if (outcome === "blocked_merge_stalled") {
    return "Symphony merge automation stalled.";
  }

  if (outcome === "blocked_merge_failure") {
    return "Symphony merge automation failed during an active run.";
  }

  if (outcome === "rate_limited" || rateLimitReason(reason)) {
    return issueMatchesExpectedTrackerState(issue, expectedTrackerState)
      ? "Symphony agent paused after hitting a Pi rate limit."
      : "Symphony agent stopped after hitting a Pi rate limit.";
  }

  return "Symphony agent run failed.";
}

function failureCommentWhatChanged(outcome: string, reason: string): string {
  if (outcome === "startup_failed") {
    return "Pi stopped before the run became active because startup failed.";
  }

  if (outcome === "rate_limited" || rateLimitReason(reason)) {
    return "Pi hit a rate limit and ended the current run.";
  }

  if (outcome === "paused_max_turns") {
    return "Pi stopped because the run reached the configured max-turn limit.";
  }

  if (outcome === "paused_stalled") {
    return "Pi stopped because the run stalled without visible activity.";
  }

  if (outcome === "paused_provider_transient") {
    return "Pi stopped after transient provider failures exhausted the automatic retry budget.";
  }

  if (outcome === "paused_failure") {
    return "Pi stopped because the runtime failed during an active run.";
  }

  if (outcome === "blocked_repo") {
    return "Pi stopped because active work hit a repo-side or task-side blocker that needs human intervention.";
  }

  if (outcome === "blocked_merge") {
    return "Pi stopped because merge automation reported a blocker that needs human intervention.";
  }

  if (outcome === "blocked_merge_max_turns") {
    return "Pi stopped because merge automation reached the configured max-turn limit.";
  }

  if (outcome === "blocked_merge_stalled") {
    return "Pi stopped because merge automation stalled without visible activity.";
  }

  if (outcome === "blocked_merge_failure") {
    return "Pi stopped because merge automation could not complete safely.";
  }

  return truncateReason(reason);
}

function failureCommentDetails(
  issue: SymphonyTrackerIssue,
  reason: string,
  outcome: string,
  options: SymphonyFailureCommentOptions
): string | null {
  const details: string[] = [];
  const primaryDetail =
    outcome === "rate_limited" || outcome === "paused_max_turns"
      ? null
      : truncateReason(reason);

  if (primaryDetail) {
    details.push(primaryDetail);
  }

  const trackerStateDetail = trackerStateMismatchDetail(
    issue,
    options.expectedTrackerState
  );
  if (trackerStateDetail) {
    details.push(trackerStateDetail);
  }

  const rateLimitDetail = formatRateLimitDetail(reason, outcome, options.rateLimits);
  if (rateLimitDetail) {
    details.push(rateLimitDetail);
  }

  if (details.length === 0) {
    return null;
  }

  return details.join("\n\n");
}

function failureCommentDetailBlock(details: string | null): string | null {
  if (!details) {
    return null;
  }

  return ["Details:", "```text", details, "```"].join("\n");
}

function failureCommentWorkspacePolicyLine(
  cleanupMode: WorkspaceCleanupMode | null | undefined
): string | null {
  if (cleanupMode === "preserve") {
    return "Workspace policy: preserve. Symphony keeps the issue workspace available for inspection or a deliberate rerun.";
  }

  if (cleanupMode === "destroy") {
    return "Workspace policy: destroy. Symphony cleans up the issue workspace after the run stops.";
  }

  return null;
}

type FailureActionDirective = {
  retryPolicy: string | null;
  nextStep: string;
  requeueToState: "Todo" | null;
};

function buildFailureActionDirective(
  outcome: string
): FailureActionDirective {
  if (outcome === "startup_failed") {
    return {
      retryPolicy: "Symphony did not retry automatically.",
      nextStep: "Fix the startup problem.",
      requeueToState: "Todo"
    };
  }

  if (outcome === "blocked_repo") {
    return {
      retryPolicy: "Symphony did not retry automatically.",
      nextStep: "Resolve the repo or workspace blocker.",
      requeueToState: "Todo"
    };
  }

  if (
    outcome === "blocked_merge" ||
    outcome === "blocked_merge_max_turns" ||
    outcome === "blocked_merge_stalled" ||
    outcome === "blocked_merge_failure"
  ) {
    return buildBlockedMergeActionDirective(outcome);
  }

  return buildPausedFailureActionDirective(outcome);
}

function buildPausedFailureActionDirective(
  outcome: string
): FailureActionDirective {
  switch (outcome) {
    case "paused_max_turns":
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep:
          "Review the preserved workspace and decide what remaining work should resume in the next run.",
        requeueToState: "Todo"
      };
    case "paused_stalled":
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep:
          "Inspect the preserved workspace and last visible activity to determine why the run stalled.",
        requeueToState: "Todo"
      };
    case "paused_provider_transient":
      return {
        retryPolicy: "Automatic retries were exhausted.",
        nextStep:
          "Resolve the provider problem that exhausted the retry budget.",
        requeueToState: "Todo"
      };
    case "rate_limited":
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep:
          "Wait for provider capacity to recover or adjust the account limits.",
        requeueToState: "Todo"
      };
    case "paused_failure":
    default:
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep:
          "Resolve the runtime or orchestration problem that failed the active run.",
        requeueToState: "Todo"
      };
  }
}

function buildBlockedMergeActionDirective(
  outcome: string
): FailureActionDirective {
  switch (outcome) {
    case "blocked_merge_max_turns":
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep:
          "Review the preserved workspace and merge state to decide what remaining work should resume in the next run.",
        requeueToState: "Todo"
      };
    case "blocked_merge_stalled":
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep:
          "Inspect the preserved workspace and merge state to determine why the merge run stalled.",
        requeueToState: "Todo"
      };
    case "blocked_merge_failure":
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep: "Resolve the merge problem that failed the active run.",
        requeueToState: "Todo"
      };
    case "blocked_merge":
    default:
      return {
        retryPolicy: "Symphony did not retry automatically.",
        nextStep: "Resolve the merge problem.",
        requeueToState: "Todo"
      };
  }
}

function buildFailureRequeueLine(input: {
  issue: SymphonyTrackerIssue;
  requeueToState: "Todo" | null;
  expectedTrackerState: string | null | undefined;
}): string | null {
  if (input.requeueToState === null) {
    return null;
  }

  if (
    hasExpectedTrackerState(input.expectedTrackerState) &&
    !issueMatchesExpectedTrackerState(input.issue, input.expectedTrackerState)
  ) {
    return `The issue is currently in \`${input.issue.state}\`. Manual state cleanup may be required before the ticket is requeued.`;
  }

  return `The issue is currently in \`${input.issue.state}\`. After completing the next step, move it to \`${input.requeueToState}\` to requeue.`;
}

function trackerStateMismatchDetail(
  issue: SymphonyTrackerIssue,
  expectedTrackerState: string | null | undefined
): string | null {
  if (
    !hasExpectedTrackerState(expectedTrackerState) ||
    issueMatchesExpectedTrackerState(issue, expectedTrackerState)
  ) {
    return null;
  }

  return `Tracker state mismatch: expected \`${expectedTrackerState}\`, actual \`${issue.state}\`.`;
}

function issueMatchesExpectedTrackerState(
  issue: SymphonyTrackerIssue,
  expectedTrackerState: string | null | undefined
): boolean {
  return (
    hasExpectedTrackerState(expectedTrackerState) &&
    normalizeStateName(issue.state) === normalizeStateName(expectedTrackerState)
  );
}

function hasExpectedTrackerState(
  expectedTrackerState: string | null | undefined
): expectedTrackerState is string {
  return (
    expectedTrackerState !== null &&
    expectedTrackerState !== undefined &&
    expectedTrackerState.trim() !== ""
  );
}

function formatRateLimitDetail(
  reason: string,
  outcome: string,
  rateLimits: JsonObject | null | undefined
): string | null {
  if (
    !rateLimits ||
    !(
      rateLimitReason(reason) ||
      outcome === "paused_max_turns" ||
      outcome === "rate_limited"
    )
  ) {
    return null;
  }

  return `Latest rate limits: ${formatRateLimitsForComment(rateLimits)}`;
}

function formatRateLimitsForComment(rateLimits: JsonObject): string {
  const parts = [
    stringOrNull(
      rateLimits.limit_id ??
        rateLimits.limitId ??
        rateLimits.limit_name ??
        rateLimits.limitName
    ),
    formatRateLimitBucketForComment("primary", asJsonObject(rateLimits.primary)),
    formatRateLimitBucketForComment("secondary", asJsonObject(rateLimits.secondary)),
    formatRateLimitCreditsForComment(asJsonObject(rateLimits.credits))
  ].filter((part): part is string => typeof part === "string" && part !== "");

  return parts.join("; ");
}

function formatRateLimitBucketForComment(
  label: string,
  bucket: JsonObject | null
): string | null {
  if (!bucket) {
    return null;
  }

  const remaining = stringOrNull(bucket.remaining);
  const limit = stringOrNull(bucket.limit);
  const resetInSeconds = stringOrNull(
    bucket.reset_in_seconds ?? bucket.resetInSeconds
  );
  const fragments = [
    remaining && limit ? `${remaining}/${limit} remaining` : null,
    resetInSeconds ? `reset ${resetInSeconds}s` : null
  ].filter((fragment): fragment is string => typeof fragment === "string");

  return fragments.length > 0 ? `${label}: ${fragments.join(", ")}` : null;
}

function formatRateLimitCreditsForComment(
  credits: JsonObject | null
): string | null {
  if (!credits) {
    return null;
  }

  const hasCredits = stringOrNull(credits.has_credits ?? credits.hasCredits);
  const unlimited = stringOrNull(credits.unlimited);
  const balance = stringOrNull(credits.balance);
  const fragments = [
    hasCredits ? `has_credits=${hasCredits}` : null,
    unlimited ? `unlimited=${unlimited}` : null,
    balance ? `balance=${balance}` : null
  ].filter((fragment): fragment is string => typeof fragment === "string");

  return fragments.length > 0 ? `credits: ${fragments.join(", ")}` : null;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function rateLimitReason(reason: string): boolean {
  const normalized = reason.toLowerCase();

  return (
    normalized.includes("rate limit") ||
    normalized.includes("rate_limit") ||
    normalized.includes("ratelimit") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate_limit_exceeded")
  );
}

function normalizeStateName(state: string): string {
  return state.trim().toLowerCase();
}
