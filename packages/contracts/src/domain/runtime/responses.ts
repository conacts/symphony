import { createEnvelopeSchema } from "@symphony/errors";
import { z } from "zod";
import { jsonObjectSchema, jsonValueSchema } from "../../core/json.js";
import {
  isoTimestampSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema
} from "../../core/shared.js";

export const symphonyRuntimeTokenTotalsSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

export const symphonyRuntimeCodexTotalsSchema = symphonyRuntimeTokenTotalsSchema.extend({
  secondsRunning: z.number().nonnegative()
});

export const symphonyRuntimeRunningEntrySchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  state: nonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional(),
  sessionId: nullableNonEmptyStringSchema.optional(),
  turnCount: z.number().int().nonnegative(),
  lastEvent: nullableNonEmptyStringSchema.optional(),
  lastMessage: nullableNonEmptyStringSchema.optional(),
  startedAt: isoTimestampSchema.nullable(),
  lastEventAt: isoTimestampSchema.nullable(),
  tokens: symphonyRuntimeTokenTotalsSchema
});

export const symphonyRuntimeRetryEntrySchema = z.strictObject({
  issueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  attempt: z.number().int().positive(),
  dueAt: isoTimestampSchema.nullable(),
  error: nullableNonEmptyStringSchema.optional(),
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional()
});

export const symphonyRuntimeStateResultSchema = z.strictObject({
  counts: z.strictObject({
    running: z.number().int().nonnegative(),
    retrying: z.number().int().nonnegative()
  }),
  running: z.array(symphonyRuntimeRunningEntrySchema),
  retrying: z.array(symphonyRuntimeRetryEntrySchema),
  codexTotals: symphonyRuntimeCodexTotalsSchema,
  rateLimits: jsonObjectSchema.nullable()
});

export const symphonyRuntimeWorkspaceExecutionTargetSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("host_path"),
      path: nonEmptyStringSchema
    }),
    z.strictObject({
      kind: z.literal("container"),
      workspacePath: nonEmptyStringSchema,
      containerId: nullableNonEmptyStringSchema,
      containerName: nullableNonEmptyStringSchema,
      hostPath: nullableNonEmptyStringSchema
    })
  ]
);

export const symphonyRuntimeWorkspaceMaterializationSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("directory"),
      hostPath: nonEmptyStringSchema
    }),
    z.strictObject({
      kind: z.literal("bind_mount"),
      hostPath: nonEmptyStringSchema,
      containerPath: nonEmptyStringSchema
    }),
    z.strictObject({
      kind: z.literal("volume"),
      volumeName: nonEmptyStringSchema,
      containerPath: nonEmptyStringSchema,
      hostPath: nullableNonEmptyStringSchema
    })
  ]
);

export const symphonyRuntimeWorkspaceSchema = z.strictObject({
  backendKind: z.enum(["local", "docker"]).nullable(),
  path: nullableNonEmptyStringSchema,
  host: nullableNonEmptyStringSchema,
  executionTarget: symphonyRuntimeWorkspaceExecutionTargetSchema.nullable(),
  materialization: symphonyRuntimeWorkspaceMaterializationSchema.nullable()
});

export const symphonyRuntimeAttemptsSchema = z.strictObject({
  restartCount: z.number().int().nonnegative(),
  currentRetryAttempt: z.number().int().nonnegative()
});

export const symphonyRuntimeIssueStatusSchema = z.enum([
  "running",
  "retrying",
  "tracked"
]);

export const symphonyRuntimeIssueRunningStateSchema = z.strictObject({
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional(),
  sessionId: nullableNonEmptyStringSchema.optional(),
  turnCount: z.number().int().nonnegative(),
  state: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastEvent: nullableNonEmptyStringSchema.optional(),
  lastMessage: nullableNonEmptyStringSchema.optional(),
  lastEventAt: isoTimestampSchema.nullable(),
  tokens: symphonyRuntimeTokenTotalsSchema
});

export const symphonyRuntimeIssueRetryStateSchema = z.strictObject({
  attempt: z.number().int().positive(),
  dueAt: isoTimestampSchema.nullable(),
  error: nullableNonEmptyStringSchema.optional(),
  workerHost: nullableNonEmptyStringSchema.optional(),
  workspacePath: nullableNonEmptyStringSchema.optional()
});

export const symphonyRuntimeLogEntrySchema = z.strictObject({
  entryId: nonEmptyStringSchema,
  level: z.enum(["debug", "info", "warn", "error"]),
  source: nonEmptyStringSchema,
  eventType: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  issueId: nullableNonEmptyStringSchema,
  issueIdentifier: nullableNonEmptyStringSchema,
  runId: nullableNonEmptyStringSchema,
  payload: jsonValueSchema,
  recordedAt: isoTimestampSchema
});

export const symphonyRuntimeTrackedIssueSchema = z.strictObject({
  title: nonEmptyStringSchema,
  state: nonEmptyStringSchema,
  branchName: nullableNonEmptyStringSchema,
  url: z.string().url().nullable(),
  projectName: nullableNonEmptyStringSchema,
  projectSlug: nullableNonEmptyStringSchema,
  teamKey: nullableNonEmptyStringSchema
});

export const symphonyRuntimeIssueOperatorSchema = z.strictObject({
  refreshPath: nonEmptyStringSchema,
  refreshDelegatesTo: z.tuple([z.literal("poll"), z.literal("reconcile")]),
  githubPullRequestSearchUrl: z.string().url().nullable(),
  requeueDelegatesTo: z
    .array(z.enum(["linear", "github_rework_comment"]))
    .nonempty(),
  requeueCommand: nonEmptyStringSchema,
  requeueHelpText: nonEmptyStringSchema
});

export const symphonyRuntimeIssueResultSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema,
  issueId: nonEmptyStringSchema,
  status: symphonyRuntimeIssueStatusSchema,
  workspace: symphonyRuntimeWorkspaceSchema,
  attempts: symphonyRuntimeAttemptsSchema,
  running: symphonyRuntimeIssueRunningStateSchema.nullable(),
  retry: symphonyRuntimeIssueRetryStateSchema.nullable(),
  lastError: nullableNonEmptyStringSchema,
  tracked: symphonyRuntimeTrackedIssueSchema,
  operator: symphonyRuntimeIssueOperatorSchema
});

export const symphonyRuntimeRefreshResultSchema = z.strictObject({
  queued: z.boolean(),
  coalesced: z.boolean(),
  requestedAt: isoTimestampSchema,
  operations: z.tuple([z.literal("poll"), z.literal("reconcile")])
});

export const symphonyRuntimeLogsResultSchema = z.strictObject({
  logs: z.array(symphonyRuntimeLogEntrySchema),
  filters: z.strictObject({
    limit: z.number().int().positive().nullable(),
    issueIdentifier: nullableNonEmptyStringSchema
  })
});

export const symphonyRuntimeHealthResultSchema = z.strictObject({
  healthy: z.boolean(),
  db: z.strictObject({
    file: nonEmptyStringSchema,
    ready: z.boolean()
  }),
  poller: z.strictObject({
    running: z.boolean(),
    intervalMs: z.number().int().positive(),
    inFlight: z.boolean(),
    lastStartedAt: isoTimestampSchema.nullable(),
    lastCompletedAt: isoTimestampSchema.nullable(),
    lastSucceededAt: isoTimestampSchema.nullable(),
    lastError: nullableNonEmptyStringSchema
  })
});

export const symphonyRuntimeStateResponseSchema = createEnvelopeSchema(
  symphonyRuntimeStateResultSchema
);
export const symphonyRuntimeIssueResponseSchema = createEnvelopeSchema(
  symphonyRuntimeIssueResultSchema
);
export const symphonyRuntimeRefreshResponseSchema = createEnvelopeSchema(
  symphonyRuntimeRefreshResultSchema
);
export const symphonyRuntimeLogsResponseSchema = createEnvelopeSchema(
  symphonyRuntimeLogsResultSchema
);
export const symphonyRuntimeHealthResponseSchema = createEnvelopeSchema(
  symphonyRuntimeHealthResultSchema
);

export type SymphonyRuntimeTokenTotals = z.infer<typeof symphonyRuntimeTokenTotalsSchema>;
export type SymphonyRuntimeCodexTotals = z.infer<typeof symphonyRuntimeCodexTotalsSchema>;
export type SymphonyRuntimeRunningEntry = z.infer<typeof symphonyRuntimeRunningEntrySchema>;
export type SymphonyRuntimeRetryEntry = z.infer<typeof symphonyRuntimeRetryEntrySchema>;
export type SymphonyRuntimeStateResult = z.infer<typeof symphonyRuntimeStateResultSchema>;
export type SymphonyRuntimeWorkspaceExecutionTarget = z.infer<
  typeof symphonyRuntimeWorkspaceExecutionTargetSchema
>;
export type SymphonyRuntimeWorkspaceMaterialization = z.infer<
  typeof symphonyRuntimeWorkspaceMaterializationSchema
>;
export type SymphonyRuntimeWorkspace = z.infer<typeof symphonyRuntimeWorkspaceSchema>;
export type SymphonyRuntimeTrackedIssue = z.infer<typeof symphonyRuntimeTrackedIssueSchema>;
export type SymphonyRuntimeIssueOperator = z.infer<typeof symphonyRuntimeIssueOperatorSchema>;
export type SymphonyRuntimeIssueResult = z.infer<typeof symphonyRuntimeIssueResultSchema>;
export type SymphonyRuntimeRefreshResult = z.infer<typeof symphonyRuntimeRefreshResultSchema>;
export type SymphonyRuntimeLogEntry = z.infer<typeof symphonyRuntimeLogEntrySchema>;
export type SymphonyRuntimeLogsResult = z.infer<typeof symphonyRuntimeLogsResultSchema>;
export type SymphonyRuntimeHealthResult = z.infer<
  typeof symphonyRuntimeHealthResultSchema
>;
