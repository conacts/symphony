import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import {
  symphonyCodexAnalyticsEventSchema,
  symphonyCodexUsageSchema
} from "../../core/codex-analytics.js";
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
  symphonyForensicsIssueTimeRangeSchema
} from "./requests.js";
import { symphonyRuntimeLogEntrySchema } from "../runtime/responses.js";

const terminalRunStatuses = new Set([
  "finished",
  "completed",
  "failed",
  "paused",
  "startup_failed",
  "rate_limited",
  "stalled"
]);

const terminalTurnStatuses = new Set(["completed", "failed"]);
const codexRunStatuses = z.enum([
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
const codexAuthModes = z.enum(["auth_json", "api_key_env"]);

export const symphonyForensicsIssueSummarySchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  latestRunStartedAt: isoTimestampSchema.nullable(),
  latestRunId: nullableNonEmptyStringSchema,
  latestRunStatus: nullableNonEmptyStringSchema,
  latestRunOutcome: nullableNonEmptyStringSchema,
  runCount: z.number().int().nonnegative(),
  completedRunCount: z.number().int().nonnegative(),
  problemRunCount: z.number().int().nonnegative(),
  problemRate: z.number().min(0).max(1),
  latestProblemOutcome: nullableNonEmptyStringSchema,
  lastCompletedOutcome: nullableNonEmptyStringSchema,
  retryCount: z.number().int().nonnegative(),
  latestRetryAttempt: z.number().int().nonnegative(),
  rateLimitedCount: z.number().int().nonnegative(),
  maxTurnsCount: z.number().int().nonnegative(),
  startupFailureCount: z.number().int().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
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
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  attempt: z.number().int().nonnegative().nullable(),
  status: nonEmptyStringSchema,
  outcome: nullableNonEmptyStringSchema,
  agentHarness: z.enum(["codex", "opencode", "pi"]).nullable().default(null),
  codexStatus: codexRunStatuses.nullable(),
  codexFailureKind: nullableNonEmptyStringSchema,
  codexFailureOrigin: nullableNonEmptyStringSchema,
  codexFailureMessagePreview: nullableNonEmptyStringSchema,
  codexModel: nullableNonEmptyStringSchema,
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
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
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
  timeRange: symphonyForensicsIssueTimeRangeSchema,
  startedAfter: isoTimestampSchema.nullable(),
  startedBefore: isoTimestampSchema.nullable(),
  outcome: nullableNonEmptyStringSchema,
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
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

export const symphonyForensicsIssueFacetsSchema = z.strictObject({
  outcomes: z.array(nonEmptyStringSchema),
  errorClasses: z.array(nonEmptyStringSchema)
});

export const symphonyForensicsIssueListResultSchema = z.strictObject({
  issues: z.array(symphonyForensicsIssueSummarySchema),
  totals: symphonyForensicsIssueTotalsSchema,
  filters: symphonyForensicsIssueFiltersSchema,
  facets: symphonyForensicsIssueFacetsSchema
});

export const symphonyForensicsIssueDetailResultSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema,
  runs: z.array(symphonyForensicsRunSummarySchema),
  summary: z.strictObject({
    runCount: z.number().int().nonnegative(),
    latestProblemOutcome: nullableNonEmptyStringSchema,
    lastCompletedOutcome: nullableNonEmptyStringSchema
  }),
  filters: z.strictObject({
    limit: z.number().int().positive().nullable()
  })
});

export const symphonyForensicsIssueTimelineEntrySchema = z.strictObject({
  entryId: nonEmptyStringSchema,
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  runId: nullableNonEmptyStringSchema,
  turnId: nullableNonEmptyStringSchema,
  source: z.enum(["orchestrator", "codex", "tracker", "workspace", "runtime"]),
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
  issueIdentifier: nonEmptyStringSchema,
  entries: z.array(symphonyForensicsIssueTimelineEntrySchema),
  filters: z.strictObject({
    limit: z.number().int().positive().nullable()
  })
});

export const symphonyForensicsIssueExportSchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  latestRunStartedAt: isoTimestampSchema.nullable(),
  latestRunId: nullableNonEmptyStringSchema,
  latestRunStatus: nullableNonEmptyStringSchema,
  latestRunOutcome: nullableNonEmptyStringSchema,
  runCount: z.number().int().nonnegative(),
  latestProblemOutcome: nullableNonEmptyStringSchema,
  lastCompletedOutcome: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsRunDetailSchema = symphonyForensicsRunSummarySchema.safeExtend({
  codexThreadId: nullableNonEmptyStringSchema,
  codexProviderId: nullableNonEmptyStringSchema,
  codexProviderName: nullableNonEmptyStringSchema,
  codexAuthMode: codexAuthModes.nullable(),
  codexProviderEnvKey: nullableNonEmptyStringSchema,
  repoStart: jsonObjectSchema.nullable(),
  repoEnd: jsonObjectSchema.nullable(),
  metadata: jsonObjectSchema.nullable(),
  insertedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable()
});

export const symphonyForensicsEventSchema = z.strictObject({
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
  payload: symphonyCodexAnalyticsEventSchema,
  payloadTruncated: z.boolean(),
  payloadBytes: z.number().int().nonnegative().nullable(),
  summary: nullableNonEmptyStringSchema,
  codexThreadId: nullableNonEmptyStringSchema,
  codexTurnId: nullableNonEmptyStringSchema,
  codexSessionId: nullableNonEmptyStringSchema,
  insertedAt: isoTimestampSchema
});

export const symphonyForensicsTurnSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  turnSequence: z.number().int().positive(),
  codexThreadId: nullableNonEmptyStringSchema,
  codexTurnId: nullableNonEmptyStringSchema,
  codexSessionId: nullableNonEmptyStringSchema,
  promptText: nonEmptyStringSchema,
  status: nonEmptyStringSchema,
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema.nullable(),
  usage: symphonyCodexUsageSchema.nullable(),
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
  turns: z.array(symphonyForensicsTurnSchema)
});

export const symphonyForensicsProblemRunsResultSchema = z.strictObject({
  problemRuns: z.array(symphonyForensicsRunSummarySchema),
  problemSummary: z.record(z.string(), z.number().int().nonnegative()),
  filters: z.strictObject({
    outcome: nullableNonEmptyStringSchema,
    issueIdentifier: nullableNonEmptyStringSchema,
    limit: z.number().int().positive().nullable()
  })
});

export const symphonyForensicsIssueForensicsBundleResultSchema = z.strictObject({
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
      outcome: nullableNonEmptyStringSchema,
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

export type SymphonyForensicsIssueSummary = z.infer<typeof symphonyForensicsIssueSummarySchema>;
export type SymphonyForensicsRunSummary = z.infer<typeof symphonyForensicsRunSummarySchema>;
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
