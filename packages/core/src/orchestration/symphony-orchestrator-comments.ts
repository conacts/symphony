import type { SymphonyJsonObject } from "../journal/symphony-run-journal-types.js";
import { asJsonObject } from "../internal/json.js";
import {
  issueBranchName,
  type SymphonyTrackerIssue
} from "../tracker/symphony-tracker.js";

export type SymphonyStartupFailureTransition =
  | {
      kind: "none";
    }
  | {
      kind: "moved";
      targetState: string;
    }
  | {
      kind: "failed";
      targetState: string;
      reason: string;
    };

export type SymphonyFailureCommentOptions = {
  rateLimits?: SymphonyJsonObject | null;
  startupFailureTransition?: SymphonyStartupFailureTransition;
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
  return [
    failureCommentTitle(outcome, reason),
    "",
    `Summary: ${failureCommentSummary(outcome, reason)}`,
    failureCommentDetailBlock(failureCommentDetails(reason, outcome, options)),
    "",
    ...failureCommentFollowUpLines(outcome, options.startupFailureTransition)
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

function failureCommentTitle(outcome: string, reason: string): string {
  if (outcome === "startup_failed" || outcome === "startup_failed_backlog") {
    return "Symphony agent startup failed.";
  }

  if (outcome === "paused_max_turns") {
    return "Symphony agent paused after reaching max turns.";
  }

  if (outcome === "rate_limited" || rateLimitReason(reason)) {
    return "Symphony agent paused after hitting a Codex rate limit.";
  }

  return "Symphony agent run failed.";
}

function failureCommentSummary(outcome: string, reason: string): string {
  if (outcome === "rate_limited" || rateLimitReason(reason)) {
    return "Codex hit a rate limit and ended the current run.";
  }

  return truncateReason(reason);
}

function failureCommentDetails(
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

  const transitionDetail = startupFailureTransitionDetail(
    options.startupFailureTransition
  );
  if (transitionDetail) {
    details.push(transitionDetail);
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

function failureCommentFollowUpLines(
  outcome: string,
  transition: SymphonyStartupFailureTransition | undefined
): string[] {
  if (outcome === "startup_failed" || outcome === "startup_failed_backlog") {
    return startupFailureFollowUpLines(transition);
  }

  if (outcome === "paused_max_turns") {
    return [
      "Symphony will start a fresh run automatically while the issue remains in an active state."
    ];
  }

  if (outcome === "rate_limited") {
    return [
      "Symphony will retry automatically after backoff while the issue remains in an active state."
    ];
  }

  return [
    "Symphony will retry automatically while the issue remains in an active state."
  ];
}

function startupFailureFollowUpLines(
  transition: SymphonyStartupFailureTransition | undefined
): string[] {
  if (transition?.kind === "moved") {
    return [
      "Symphony did not retry automatically.",
      `Symphony moved the issue to \`${transition.targetState}\`. After fixing the startup problem, move it back into an active state to request another run.`
    ];
  }

  if (transition?.kind === "failed") {
    return [
      "Symphony did not retry automatically.",
      `Symphony could not move the issue to \`${transition.targetState}\`, so manual state cleanup is required before the ticket is requeued.`
    ];
  }

  return [
    "Symphony did not retry automatically.",
    "After fixing the startup problem, move the issue back into an active state to request another run."
  ];
}

function startupFailureTransitionDetail(
  transition: SymphonyStartupFailureTransition | undefined
): string | null {
  if (transition?.kind !== "failed") {
    return null;
  }

  return truncateReason(
    `State transition to \`${transition.targetState}\` failed:\n${transition.reason}`
  );
}

function formatRateLimitDetail(
  reason: string,
  outcome: string,
  rateLimits: SymphonyJsonObject | null | undefined
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

function formatRateLimitsForComment(rateLimits: SymphonyJsonObject): string {
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
  bucket: SymphonyJsonObject | null
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
  credits: SymphonyJsonObject | null
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
