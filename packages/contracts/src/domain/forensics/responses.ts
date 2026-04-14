import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import {
  symphonyAgentAnalyticsEventSchema,
  symphonyAgentUsageSchema
} from "../../core/agent-analytics.js";
import { jsonObjectSchema, jsonValueSchema } from "../../core/json.js";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema
} from "../../core/shared.js";
import {
  symphonyForensicsIssueFlagSchema,
  symphonyForensicsIssueSortBySchema,
  symphonyForensicsIssueSortDirectionSchema,
  symphonyForensicsIssueTimeRangeSchema,
  symphonyForensicsRunOutcomeSchema
} from "./requests.js";
import {
  symphonyRuntimeLaunchTargetSchema,
  symphonyRuntimeLogEntrySchema
} from "../runtime/responses.js";

const symphonyForensicsRuntimeRunStatusSchema = z.enum([
  "dispatching",
  "running",
  "finished",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
]);
const terminalRunStatuses = new Set([
  "finished",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
]);

const symphonyForensicsRuntimeTurnStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "stopped"
]);
const terminalTurnStatuses = new Set(["completed", "failed", "stopped"]);
const symphonyAgentRunStatusSchema = z.enum([
  "dispatching",
  "running",
  "completed",
  "paused",
  "failed",
  "startup_failed",
  "rate_limited",
  "stalled",
  "stopped"
]);
const authModes = z.enum(["auth_json", "api_key_env"]);
export const symphonyForensicsActiveHarnessSchema = z.literal("pi");
export const symphonyForensicsTimelineSourceSchema = z.enum([
  "orchestrator",
  "agent",
  "tracker",
  "workspace",
  "runtime"
]);
export const symphonyForensicsDeliveryStatusSchema = z.enum([
  "completed",
  "blocked",
  "partial"
]);
export const symphonyForensicsDeliveryReportSchema = z.strictObject({
  reportId: nonEmptyStringSchema,
  repositoryKey: nonEmptyStringSchema,
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  status: symphonyForensicsDeliveryStatusSchema,
  summary: nonEmptyStringSchema,
  prUrl: nullableNonEmptyStringSchema,
  prNumber: nullableNonEmptyStringSchema,
  branchName: nullableNonEmptyStringSchema,
  blockingReason: nullableNonEmptyStringSchema,
  testsSummary: nullableNonEmptyStringSchema,
  source: nonEmptyStringSchema,
  reportedAt: isoTimestampSchema,
  insertedAt: isoTimestampSchema
});

export const symphonyForensicsIssueSummarySchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  latestRunStartedAt: isoTimestampSchema.nullable(),
  latestRunId: nullableNonEmptyStringSchema,
  latestRunStatus: symphonyForensicsRuntimeRunStatusSchema.nullable(),
  latestRunOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
  runCount: z.number().int().nonnegative(),
  completedRunCount: z.number().int().nonnegative(),
  problemRunCount: z.number().int().nonnegative(),
  problemRate: z.number().min(0).max(1),
  latestProblemOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
  lastCompletedOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
  latestDeliveryStatus: symphonyForensicsDeliveryStatusSchema.nullable(),
  latestDeliveryReportedAt: isoTimestampSchema.nullable(),
  latestDeliveryRunId: nullableNonEmptyStringSchema,
  latestDeliveryPrUrl: nullableNonEmptyStringSchema,
  deliveredRunCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  latestRetryAttempt: z.number().int().nonnegative(),
  rateLimitedCount: z.number().int().nonnegative(),
  maxTurnsCount: z.number().int().nonnegative(),
  startupFailureCount: z.number().int().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalCachedInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  avgDurationSeconds: z.number().nonnegative(),
  avgTurns: z.number().nonnegative(),
  avgEvents: z.number().nonnegative(),
  latestErrorClass: nullableNonEmptyStringSchema,
  latestErrorMessage: nullableNonEmptyStringSchema,
  latestActivityAt: isoTimestampSchema.nullable(),
  flags: z.array(symphonyForensicsIssueFlagSchema),
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsRunSummarySchema = z.strictObject({
  runId: nonEmptyStringSchema,
  repositoryKey: nonEmptyStringSchema,
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  attempt: z.number().int().nonnegative().nullable(),
  runMode: z.enum(["implementation", "rework"]),
  status: symphonyForensicsRuntimeRunStatusSchema,
  outcome: symphonyForensicsRunOutcomeSchema.nullable(),
  agentHarness: symphonyForensicsActiveHarnessSchema.nullable().default(null),
  agentStatus: symphonyAgentRunStatusSchema.nullable(),
  agentFailureKind: nullableNonEmptyStringSchema,
  agentFailureOrigin: nullableNonEmptyStringSchema,
  agentFailureMessagePreview: nullableNonEmptyStringSchema,
  model: nullableNonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema,
  workspacePath: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema.nullable(),
  commitHashStart: nullableNonEmptyStringSchema,
  commitHashEnd: nullableNonEmptyStringSchema,
  turnCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  lastEventType: nullableNonEmptyStringSchema,
  lastEventAt: isoTimestampSchema.nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  errorClass: nullableNonEmptyStringSchema,
  errorMessage: nullableNonEmptyStringSchema,
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  deliveryStatus: symphonyForensicsDeliveryStatusSchema.nullable(),
  deliveryReportedAt: isoTimestampSchema.nullable(),
  deliveryPrUrl: nullableNonEmptyStringSchema,
  machineLoad: z.strictObject({
    sampleCount: z.number().int().positive(),
    maxCpuPercent: z.number().int().min(0).max(100).nullable(),
    avgCpuPercent: z.number().int().min(0).max(100).nullable(),
    maxMemoryPercent: z.number().int().min(0).max(100),
    avgMemoryPercent: z.number().int().min(0).max(100),
    maxDiskPercent: z.number().int().min(0).max(100).nullable(),
    avgDiskPercent: z.number().int().min(0).max(100).nullable(),
    hadHighCpu: z.boolean(),
    hadHighMemory: z.boolean(),
    hadHighDisk: z.boolean()
  }).nullable()
}).superRefine((value, context) => {
  if (value.eventCount > 0 && !value.lastEventAt) {
    context.addIssue({
      code: "custom",
      message: "Runs with events must include lastEventAt.",
      path: ["lastEventAt"]
    });
  }

  if (value.eventCount > 0 && !value.lastEventType) {
    context.addIssue({
      code: "custom",
      message: "Runs with events must include lastEventType.",
      path: ["lastEventType"]
    });
  }

  if (!value.status || !terminalRunStatuses.has(value.status)) {
    return;
  }

  if (!value.endedAt) {
    context.addIssue({
      code: "custom",
      message: "Terminal runs must include endedAt.",
      path: ["endedAt"]
    });
  }

  if (value.durationSeconds === null) {
    context.addIssue({
      code: "custom",
      message: "Terminal runs must include durationSeconds.",
      path: ["durationSeconds"]
    });
  }
});

export const symphonyForensicsIssueFiltersSchema = z.strictObject({
  limit: z.number().int().positive().nullable(),
  repo: nullableNonEmptyStringSchema,
  timeRange: symphonyForensicsIssueTimeRangeSchema,
  startedAfter: isoTimestampSchema.nullable(),
  startedBefore: isoTimestampSchema.nullable(),
  outcome: symphonyForensicsRunOutcomeSchema.nullable(),
  errorClass: nullableNonEmptyStringSchema,
  hasFlags: z.array(symphonyForensicsIssueFlagSchema),
  sortBy: symphonyForensicsIssueSortBySchema,
  sortDirection: symphonyForensicsIssueSortDirectionSchema
});

export const symphonyForensicsIssueTotalsSchema = z.strictObject({
  issueCount: z.number().int().nonnegative(),
  runCount: z.number().int().nonnegative(),
  completedRunCount: z.number().int().nonnegative(),
  problemRunCount: z.number().int().nonnegative(),
  rateLimitedCount: z.number().int().nonnegative(),
  maxTurnsCount: z.number().int().nonnegative(),
  startupFailureCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

export const symphonyForensicsIssueFacetsSchema = z.strictObject({
  repositories: z.array(nonEmptyStringSchema),
  outcomes: z.array(symphonyForensicsRunOutcomeSchema),
  errorClasses: z.array(nonEmptyStringSchema)
});

export const symphonyForensicsIssueListResultSchema = z.strictObject({
  issues: z.array(symphonyForensicsIssueSummarySchema),
  totals: symphonyForensicsIssueTotalsSchema,
  filters: symphonyForensicsIssueFiltersSchema,
  facets: symphonyForensicsIssueFacetsSchema
});

export const symphonyForensicsIssueDetailResultSchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  runs: z.array(symphonyForensicsRunSummarySchema),
  summary: z.strictObject({
    runCount: z.number().int().nonnegative(),
    latestProblemOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
    lastCompletedOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
    latestDeliveryStatus: symphonyForensicsDeliveryStatusSchema.nullable(),
    latestDeliveryReportedAt: isoTimestampSchema.nullable(),
    latestDeliveryPrUrl: nullableNonEmptyStringSchema,
    deliveredRunCount: z.number().int().nonnegative()
  }),
  filters: z.strictObject({
    limit: z.number().int().positive().nullable(),
    repo: nullableNonEmptyStringSchema
  })
});

export const symphonyForensicsIssueTimelineEntrySchema = z.strictObject({
  entryId: nonEmptyStringSchema,
  repositoryKey: nonEmptyStringSchema,
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  runId: nullableNonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  source: symphonyForensicsTimelineSourceSchema,
  eventType: nonEmptyStringSchema,
  message: nullableNonEmptyStringSchema,
  payload: z.union([
    jsonObjectSchema,
    z.array(jsonValueSchema),
    z.string(),
    z.number(),
    z.boolean(),
    z.null()
  ]),
  recordedAt: isoTimestampSchema
});

export const symphonyForensicsIssueTimelineResultSchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  entries: z.array(symphonyForensicsIssueTimelineEntrySchema),
  filters: z.strictObject({
    limit: z.number().int().positive().nullable(),
    repo: nullableNonEmptyStringSchema
  })
});

const symphonyForensicsIssueExportSchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  latestRunStartedAt: isoTimestampSchema.nullable(),
  latestRunId: nullableNonEmptyStringSchema,
  latestRunStatus: symphonyForensicsRuntimeRunStatusSchema.nullable(),
  latestRunOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
  runCount: z.number().int().nonnegative(),
  latestProblemOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
  lastCompletedOutcome: symphonyForensicsRunOutcomeSchema.nullable(),
  latestDeliveryStatus: symphonyForensicsDeliveryStatusSchema.nullable(),
  latestDeliveryReportedAt: isoTimestampSchema.nullable(),
  latestDeliveryRunId: nullableNonEmptyStringSchema,
  latestDeliveryPrUrl: nullableNonEmptyStringSchema,
  deliveredRunCount: z.number().int().nonnegative(),
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

const symphonyForensicsRunDetailSchema = symphonyForensicsRunSummarySchema.safeExtend({
  threadId: nonEmptyStringSchema,
  processId: nullableNonEmptyStringSchema,
  providerId: nullableNonEmptyStringSchema,
  providerName: nullableNonEmptyStringSchema,
  reasoningEffort: nullableNonEmptyStringSchema,
  profile: nullableNonEmptyStringSchema,
  authMode: authModes.nullable(),
  providerEnvKey: nullableNonEmptyStringSchema,
  launchTarget: symphonyRuntimeLaunchTargetSchema.nullable(),
  repoStart: jsonObjectSchema.nullable(),
  repoEnd: jsonObjectSchema.nullable(),
  metadata: jsonObjectSchema.nullable(),
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

const symphonyForensicsEventSchema = z.strictObject({
  eventId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  eventSequence: z.number().int().positive(),
  eventType: nonEmptyStringSchema,
  itemType: z
    .enum([
      "agent_message",
      "reasoning",
      "command_execution",
      "file_change",
      "mcp_tool_call",
      "web_search",
      "todo_list",
      "error"
    ])
    .nullable(),
  itemStatus: z.enum(["in_progress", "completed", "failed"]).nullable(),
  recordedAt: isoTimestampSchema,
  payload: symphonyAgentAnalyticsEventSchema,
  payloadTruncated: z.boolean(),
  payloadBytes: z.number().int().nonnegative().nullable(),
  summary: nullableNonEmptyStringSchema,
  threadId: nonEmptyStringSchema,
  agentTurnId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema
});

const symphonyForensicsTurnSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  turnSequence: z.number().int().positive(),
  threadId: nonEmptyStringSchema,
  agentTurnId: nullableNonEmptyStringSchema,
  promptText: nonEmptyStringSchema,
  status: symphonyForensicsRuntimeTurnStatusSchema,
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema.nullable(),
  usage: symphonyAgentUsageSchema.nullable(),
  metadata: jsonObjectSchema.nullable(),
  insertedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  eventCount: z.number().int().nonnegative(),
  events: z.array(symphonyForensicsEventSchema)
}).superRefine((value, context) => {
  if (!value.status || !terminalTurnStatuses.has(value.status)) {
    return;
  }

  if (!value.endedAt) {
    context.addIssue({
      code: "custom",
      message: "Terminal turns must include endedAt.",
      path: ["endedAt"]
    });
  }
});

export const symphonyForensicsRunDetailResultSchema = z.strictObject({
  issue: symphonyForensicsIssueExportSchema,
  run: symphonyForensicsRunDetailSchema.safeExtend({
    turnCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    lastEventType: nullableNonEmptyStringSchema,
    lastEventAt: isoTimestampSchema.nullable()
  }),
  deliveryReport: symphonyForensicsDeliveryReportSchema.nullable(),
  turns: z.array(symphonyForensicsTurnSchema)
});

export const symphonyForensicsProblemRunsResultSchema = z.strictObject({
  problemRuns: z.array(symphonyForensicsRunSummarySchema),
  problemSummary: z.record(z.string(), z.number().int().nonnegative()),
  filters: z.strictObject({
    repo: nullableNonEmptyStringSchema,
    outcome: symphonyForensicsRunOutcomeSchema.nullable(),
    issueIdentifier: nullableNonEmptyStringSchema,
    limit: z.number().int().positive().nullable()
  })
});

export const symphonyForensicsSuccessMetricWindowSchema = z.strictObject({
  timeRange: symphonyForensicsIssueTimeRangeSchema,
  startedAfter: isoTimestampSchema.nullable(),
  startedBefore: isoTimestampSchema.nullable()
});

export const symphonyForensicsExecutiveSuccessMetricsSchema = z.strictObject({
  startedIssueCount: z.number().int().nonnegative(),
  deliveredIssueCount: z.number().int().nonnegative(),
  issueDeliveryRate: z.number().min(0).max(1),
  medianTokensPerDeliveredIssue: z.number().int().nonnegative().nullable(),
  medianTimeToDeliveredIssueSeconds: z.number().int().nonnegative().nullable(),
  deliveryRetryRate: z.number().min(0).max(1),
  maxTurnFailureRate: z.number().min(0).max(1)
});

export const symphonyForensicsDiagnosticSuccessMetricsSchema = z.strictObject({
  startedRunCount: z.number().int().nonnegative(),
  deliveredRunCount: z.number().int().nonnegative(),
  blockedIssueCount: z.number().int().nonnegative(),
  partialIssueCount: z.number().int().nonnegative(),
  missingDeliveryReportFailureCount: z.number().int().nonnegative(),
  startupFailureRate: z.number().min(0).max(1),
  rateLimitedRunRate: z.number().min(0).max(1),
  highMachinePressureRunRate: z.number().min(0).max(1),
  medianCachedInputShareDeliveredIssues: z.number().min(0).max(1).nullable()
});

export const symphonyForensicsSuccessMetricsDaySchema = z.strictObject({
  date: nonEmptyStringSchema,
  startedIssueCount: z.number().int().nonnegative(),
  deliveredIssueCount: z.number().int().nonnegative(),
  startedRunCount: z.number().int().nonnegative(),
  deliveredRunCount: z.number().int().nonnegative(),
  maxTurnFailureCount: z.number().int().nonnegative(),
  startupFailureCount: z.number().int().nonnegative(),
  rateLimitedRunCount: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

export const symphonyForensicsSuccessMetricsResultSchema = z.strictObject({
  window: symphonyForensicsSuccessMetricWindowSchema,
  executive: symphonyForensicsExecutiveSuccessMetricsSchema,
  diagnostics: symphonyForensicsDiagnosticSuccessMetricsSchema,
  daily: z.array(symphonyForensicsSuccessMetricsDaySchema)
});

export const symphonyForensicsIssueForensicsBundleResultSchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  issue: symphonyForensicsIssueSummarySchema,
  recentRuns: z.array(symphonyForensicsRunSummarySchema),
  distributions: z.strictObject({
    outcomes: z.record(z.string(), z.number().int().nonnegative()),
    errorClasses: z.record(z.string(), z.number().int().nonnegative()),
    timelineEvents: z.record(z.string(), z.number().int().nonnegative())
  }),
  latestFailure: z
    .strictObject({
      runId: nonEmptyStringSchema,
      startedAt: isoTimestampSchema.nullable(),
      outcome: symphonyForensicsRunOutcomeSchema.nullable(),
      errorClass: nullableNonEmptyStringSchema,
      errorMessage: nullableNonEmptyStringSchema,
      timelineEntries: z.array(symphonyForensicsIssueTimelineEntrySchema),
      runtimeLogs: z.array(symphonyRuntimeLogEntrySchema)
    })
    .nullable(),
  timeline: z.array(symphonyForensicsIssueTimelineEntrySchema),
  runtimeLogs: z.array(symphonyRuntimeLogEntrySchema),
  filters: symphonyForensicsIssueFiltersSchema
});

export const symphonyForensicsIssueListResponseSchema = createEnvelopeSchema(
  symphonyForensicsIssueListResultSchema
);
export const symphonyForensicsIssueDetailResponseSchema = createEnvelopeSchema(
  symphonyForensicsIssueDetailResultSchema
);
export const symphonyForensicsIssueForensicsBundleResponseSchema = createEnvelopeSchema(
  symphonyForensicsIssueForensicsBundleResultSchema
);
export const symphonyForensicsRunDetailResponseSchema = createEnvelopeSchema(
  symphonyForensicsRunDetailResultSchema
);
export const symphonyForensicsProblemRunsResponseSchema = createEnvelopeSchema(
  symphonyForensicsProblemRunsResultSchema
);
export const symphonyForensicsIssueTimelineResponseSchema = createEnvelopeSchema(
  symphonyForensicsIssueTimelineResultSchema
);
export const symphonyForensicsSuccessMetricsResponseSchema = createEnvelopeSchema(
  symphonyForensicsSuccessMetricsResultSchema
);

export type SymphonyForensicsIssueSummary = z.infer<typeof symphonyForensicsIssueSummarySchema>;
export type SymphonyForensicsRunSummary = z.infer<typeof symphonyForensicsRunSummarySchema>;
export type SymphonyForensicsDeliveryStatus = z.infer<
  typeof symphonyForensicsDeliveryStatusSchema
>;
export type SymphonyForensicsDeliveryReport = z.infer<
  typeof symphonyForensicsDeliveryReportSchema
>;
export type SymphonyForensicsIssueFilters = z.infer<typeof symphonyForensicsIssueFiltersSchema>;
export type SymphonyForensicsIssueTotals = z.infer<typeof symphonyForensicsIssueTotalsSchema>;
export type SymphonyForensicsIssueFacets = z.infer<typeof symphonyForensicsIssueFacetsSchema>;
export type SymphonyForensicsIssueListResult = z.infer<
  typeof symphonyForensicsIssueListResultSchema
>;
export type SymphonyForensicsIssueDetailResult = z.infer<
  typeof symphonyForensicsIssueDetailResultSchema
>;
export type SymphonyForensicsIssueTimelineEntry = z.infer<
  typeof symphonyForensicsIssueTimelineEntrySchema
>;
export type SymphonyForensicsIssueTimelineResult = z.infer<
  typeof symphonyForensicsIssueTimelineResultSchema
>;
export type SymphonyForensicsRunDetailResult = z.infer<
  typeof symphonyForensicsRunDetailResultSchema
>;
export type SymphonyForensicsProblemRunsResult = z.infer<
  typeof symphonyForensicsProblemRunsResultSchema
>;
export type SymphonyForensicsIssueForensicsBundleResult = z.infer<
  typeof symphonyForensicsIssueForensicsBundleResultSchema
>;
export type SymphonyForensicsSuccessMetricWindow = z.infer<
  typeof symphonyForensicsSuccessMetricWindowSchema
>;
export type SymphonyForensicsExecutiveSuccessMetrics = z.infer<
  typeof symphonyForensicsExecutiveSuccessMetricsSchema
>;
export type SymphonyForensicsDiagnosticSuccessMetrics = z.infer<
  typeof symphonyForensicsDiagnosticSuccessMetricsSchema
>;
export type SymphonyForensicsSuccessMetricsDay = z.infer<
  typeof symphonyForensicsSuccessMetricsDaySchema
>;
export type SymphonyForensicsSuccessMetricsResult = z.infer<
  typeof symphonyForensicsSuccessMetricsResultSchema
>;
