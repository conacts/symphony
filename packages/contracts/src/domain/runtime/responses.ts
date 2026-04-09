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

export const symphonyRuntimeAgentTotalsSchema = symphonyRuntimeTokenTotalsSchema.extend({
  secondsRunning: z.number().nonnegative()
});

export const symphonyRuntimeWorkspaceExecutionTargetKindSchema = z.enum([
  "container"
]);

export const symphonyRuntimeWorkspaceMaterializationKindSchema = z.enum([
  "bind_mount",
  "volume"
]);

export const symphonyRuntimeWorkspacePrepareDispositionSchema = z.enum([
  "created",
  "reused"
]);

export const symphonyRuntimeWorkspaceContainerDispositionSchema = z.enum([
  "started",
  "reused",
  "recreated"
]);

const symphonyRuntimeWorkspaceNetworkDispositionSchema = z.enum([
  "created",
  "reused",
  "not_applicable"
]);

const symphonyRuntimeWorkspaceServiceTypeSchema = z.enum(["postgres"]);

const symphonyRuntimeWorkspaceServiceDispositionSchema = z.enum([
  "created",
  "reused",
  "recreated"
]);

const symphonyRuntimeWorkspaceEnvBundleSummarySchema = z.strictObject({
  source: z.enum(["ambient", "manifest"]),
  injectedKeys: z.array(nonEmptyStringSchema),
  requiredHostKeys: z.array(nonEmptyStringSchema),
  optionalHostKeys: z.array(nonEmptyStringSchema),
  repoEnvPath: nullableNonEmptyStringSchema,
  projectedRepoKeys: z.array(nonEmptyStringSchema),
  requiredRepoKeys: z.array(nonEmptyStringSchema),
  optionalRepoKeys: z.array(nonEmptyStringSchema),
  staticBindingKeys: z.array(nonEmptyStringSchema),
  runtimeBindingKeys: z.array(nonEmptyStringSchema),
  serviceBindingKeys: z.array(nonEmptyStringSchema)
});

const symphonyRuntimeWorkspaceServiceSchema = z.strictObject({
  key: nonEmptyStringSchema,
  type: symphonyRuntimeWorkspaceServiceTypeSchema,
  hostname: nonEmptyStringSchema,
  port: z.number().int().positive(),
  containerId: nullableNonEmptyStringSchema,
  containerName: nonEmptyStringSchema,
  disposition: symphonyRuntimeWorkspaceServiceDispositionSchema
});

export const symphonyRuntimeWorkspaceManifestLifecyclePhaseSchema = z.enum([
  "bootstrap",
  "migrate",
  "seed",
  "verify",
  "cleanup"
]);

export const symphonyRuntimeWorkspaceManifestLifecyclePhaseStatusSchema = z.enum([
  "completed",
  "skipped",
  "failed"
]);

export const symphonyRuntimeWorkspaceManifestLifecyclePhaseTriggerSchema = z.enum([
  "workspace_lifetime",
  "service_lifetime",
  "readiness_lifetime",
  "teardown"
]);

export const symphonyRuntimeWorkspaceManifestLifecyclePhaseSkipReasonSchema = z.enum([
  "no_steps",
  "already_completed_for_current_lifetime",
  "container_not_running"
]);

export const symphonyRuntimeWorkspaceManifestLifecycleStepStatusSchema = z.enum([
  "completed",
  "failed"
]);

export const symphonyRuntimeWorkspaceManifestLifecycleStepSchema = z.strictObject({
  phase: symphonyRuntimeWorkspaceManifestLifecyclePhaseSchema,
  name: nonEmptyStringSchema,
  command: nonEmptyStringSchema,
  cwd: nonEmptyStringSchema,
  timeoutMs: z.number().int().positive().nullable(),
  status: symphonyRuntimeWorkspaceManifestLifecycleStepStatusSchema,
  startedAt: isoTimestampSchema,
  endedAt: isoTimestampSchema,
  failureReason: nullableNonEmptyStringSchema
});

export const symphonyRuntimeWorkspaceManifestLifecyclePhaseRecordSchema = z.strictObject({
  phase: symphonyRuntimeWorkspaceManifestLifecyclePhaseSchema,
  status: symphonyRuntimeWorkspaceManifestLifecyclePhaseStatusSchema,
  trigger: symphonyRuntimeWorkspaceManifestLifecyclePhaseTriggerSchema,
  startedAt: isoTimestampSchema.nullable(),
  endedAt: isoTimestampSchema,
  skipReason: symphonyRuntimeWorkspaceManifestLifecyclePhaseSkipReasonSchema.nullable(),
  failureReason: nullableNonEmptyStringSchema,
  steps: z.array(symphonyRuntimeWorkspaceManifestLifecycleStepSchema)
});

export const symphonyRuntimeWorkspaceManifestLifecycleSchema = z.strictObject({
  phases: z.array(symphonyRuntimeWorkspaceManifestLifecyclePhaseRecordSchema)
});

export const symphonyRuntimeRunningEntrySchema = z.strictObject({
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  state: nonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema,
  workspacePath: nullableNonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  workspace: z.lazy(() => symphonyRuntimeWorkspaceSchema).nullable(),
  launchTarget: z.lazy(() => symphonyRuntimeLaunchTargetSchema).nullable(),
  turnCount: z.number().int().nonnegative(),
  lastEvent: nullableNonEmptyStringSchema,
  lastMessage: nullableNonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastEventAt: isoTimestampSchema.nullable(),
  tokens: symphonyRuntimeTokenTotalsSchema
});

export const symphonyRuntimeRetryEntrySchema = z.strictObject({
  trackerIssueId: nonEmptyStringSchema,
  issueIdentifier: nonEmptyStringSchema,
  attempt: z.number().int().positive(),
  dueAt: isoTimestampSchema.nullable(),
  error: nullableNonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema,
  workspacePath: nullableNonEmptyStringSchema,
  workspace: z.lazy(() => symphonyRuntimeWorkspaceSchema).nullable(),
  launchTarget: z.lazy(() => symphonyRuntimeLaunchTargetSchema).nullable()
});

export const symphonyRuntimeStateResultSchema = z.strictObject({
  counts: z.strictObject({
    running: z.number().int().nonnegative(),
    retrying: z.number().int().nonnegative()
  }),
  repositories: z
    .array(
      z.strictObject({
        repositoryKey: nonEmptyStringSchema,
        linear: z.strictObject({
          teamKey: nonEmptyStringSchema
        })
      })
    )
    .optional(),
  running: z.array(symphonyRuntimeRunningEntrySchema),
  retrying: z.array(symphonyRuntimeRetryEntrySchema),
  agentTotals: symphonyRuntimeAgentTotalsSchema,
  rateLimits: jsonObjectSchema.nullable()
});

export const symphonyRuntimeWorkspaceExecutionTargetSchema = z.discriminatedUnion(
  "kind",
  [
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
  backendKind: z.enum(["docker"]).nullable(),
  workerHost: nullableNonEmptyStringSchema,
  prepareDisposition: symphonyRuntimeWorkspacePrepareDispositionSchema.nullable(),
  executionTargetKind: symphonyRuntimeWorkspaceExecutionTargetKindSchema.nullable(),
  materializationKind: symphonyRuntimeWorkspaceMaterializationKindSchema.nullable(),
  hostRepoMetadataAvailable: z.boolean(),
  containerDisposition: symphonyRuntimeWorkspaceContainerDispositionSchema.nullable(),
  networkDisposition: symphonyRuntimeWorkspaceNetworkDispositionSchema.nullable(),
  hostPath: nullableNonEmptyStringSchema,
  runtimePath: nullableNonEmptyStringSchema,
  containerId: nullableNonEmptyStringSchema,
  containerName: nullableNonEmptyStringSchema,
  networkName: nullableNonEmptyStringSchema,
  services: z.array(symphonyRuntimeWorkspaceServiceSchema),
  envBundleSummary: symphonyRuntimeWorkspaceEnvBundleSummarySchema.nullable(),
  manifestLifecycle: symphonyRuntimeWorkspaceManifestLifecycleSchema.nullable(),
  path: nullableNonEmptyStringSchema,
  executionTarget: symphonyRuntimeWorkspaceExecutionTargetSchema.nullable(),
  materialization: symphonyRuntimeWorkspaceMaterializationSchema.nullable()
});

export const symphonyRuntimeLaunchTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("container"),
    hostLaunchPath: nonEmptyStringSchema,
    hostWorkspacePath: nullableNonEmptyStringSchema,
    runtimeWorkspacePath: nonEmptyStringSchema,
    containerId: nullableNonEmptyStringSchema,
    containerName: nonEmptyStringSchema,
    shell: nonEmptyStringSchema
  })
]);

const symphonyRuntimeAttemptsSchema = z.strictObject({
  restartCount: z.number().int().nonnegative(),
  currentRetryAttempt: z.number().int().nonnegative()
});

const symphonyRuntimeIssueStatusSchema = z.enum([
  "running",
  "retrying",
  "tracked"
]);

const symphonyRuntimeIssueRunningStateSchema = z.strictObject({
  workerHost: nullableNonEmptyStringSchema,
  workspacePath: nullableNonEmptyStringSchema,
  threadId: nullableNonEmptyStringSchema,
  launchTarget: symphonyRuntimeLaunchTargetSchema.nullable(),
  turnCount: z.number().int().nonnegative(),
  state: nonEmptyStringSchema,
  startedAt: isoTimestampSchema.nullable(),
  lastEvent: nullableNonEmptyStringSchema,
  lastMessage: nullableNonEmptyStringSchema,
  lastEventAt: isoTimestampSchema.nullable(),
  tokens: symphonyRuntimeTokenTotalsSchema
});

const symphonyRuntimeIssueRetryStateSchema = z.strictObject({
  attempt: z.number().int().positive(),
  dueAt: isoTimestampSchema.nullable(),
  error: nullableNonEmptyStringSchema,
  workerHost: nullableNonEmptyStringSchema,
  workspacePath: nullableNonEmptyStringSchema,
  launchTarget: symphonyRuntimeLaunchTargetSchema.nullable()
});

export const symphonyRuntimeLogEntrySchema = z.strictObject({
  entryId: nonEmptyStringSchema,
  repositoryKey: nullableNonEmptyStringSchema,
  level: z.enum(["debug", "info", "warn", "error"]),
  source: nonEmptyStringSchema,
  eventType: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
  trackerIssueId: nullableNonEmptyStringSchema,
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
  requeueHelpText: nonEmptyStringSchema,
  pi: z.strictObject({
    defaultModel: nullableNonEmptyStringSchema,
    selectedModel: nullableNonEmptyStringSchema,
    availableModels: z.array(nonEmptyStringSchema),
    modelOverrideLabelPrefix: nonEmptyStringSchema,
    selectionHelpText: nonEmptyStringSchema
  })
});

export const symphonyRuntimeIssueResultSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema,
  trackerIssueId: nonEmptyStringSchema,
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
    repo: nullableNonEmptyStringSchema,
    issueIdentifier: nullableNonEmptyStringSchema
  })
});

export const symphonyRuntimeMachineLoadSnapshotSchema = z.strictObject({
  capturedAt: isoTimestampSchema,
  cpuPercent: z.number().int().min(0).max(100).nullable(),
  memoryUsedBytes: z.number().int().nonnegative(),
  memoryTotalBytes: z.number().int().positive(),
  memoryPercent: z.number().int().min(0).max(100),
  diskUsedBytes: z.number().int().nonnegative().nullable(),
  diskTotalBytes: z.number().int().positive().nullable(),
  diskPercent: z.number().int().min(0).max(100).nullable(),
  samplePath: nullableNonEmptyStringSchema
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
  }),
  machineLoad: symphonyRuntimeMachineLoadSnapshotSchema.nullable()
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
export type SymphonyRuntimeAgentTotals = z.infer<typeof symphonyRuntimeAgentTotalsSchema>;
export type SymphonyRuntimeRunningEntry = z.infer<typeof symphonyRuntimeRunningEntrySchema>;
export type SymphonyRuntimeRetryEntry = z.infer<typeof symphonyRuntimeRetryEntrySchema>;
export type SymphonyRuntimeStateResult = z.infer<typeof symphonyRuntimeStateResultSchema>;
export type SymphonyRuntimeWorkspaceExecutionTargetKind = z.infer<
  typeof symphonyRuntimeWorkspaceExecutionTargetKindSchema
>;
export type SymphonyRuntimeWorkspaceMaterializationKind = z.infer<
  typeof symphonyRuntimeWorkspaceMaterializationKindSchema
>;
export type SymphonyRuntimeWorkspacePrepareDisposition = z.infer<
  typeof symphonyRuntimeWorkspacePrepareDispositionSchema
>;
export type SymphonyRuntimeWorkspaceContainerDisposition = z.infer<
  typeof symphonyRuntimeWorkspaceContainerDispositionSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecyclePhase = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecyclePhaseSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecyclePhaseStatus = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecyclePhaseStatusSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecyclePhaseTrigger = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecyclePhaseTriggerSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecyclePhaseSkipReason = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecyclePhaseSkipReasonSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecycleStepStatus = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecycleStepStatusSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecycleStep = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecycleStepSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecyclePhaseRecord = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecyclePhaseRecordSchema
>;
export type SymphonyRuntimeWorkspaceManifestLifecycle = z.infer<
  typeof symphonyRuntimeWorkspaceManifestLifecycleSchema
>;
export type SymphonyRuntimeWorkspaceExecutionTarget = z.infer<
  typeof symphonyRuntimeWorkspaceExecutionTargetSchema
>;
export type SymphonyRuntimeWorkspaceMaterialization = z.infer<
  typeof symphonyRuntimeWorkspaceMaterializationSchema
>;
export type SymphonyRuntimeWorkspace = z.infer<typeof symphonyRuntimeWorkspaceSchema>;
export type SymphonyRuntimeLaunchTarget = z.infer<
  typeof symphonyRuntimeLaunchTargetSchema
>;
export type SymphonyRuntimeTrackedIssue = z.infer<typeof symphonyRuntimeTrackedIssueSchema>;
export type SymphonyRuntimeIssueOperator = z.infer<typeof symphonyRuntimeIssueOperatorSchema>;
export type SymphonyRuntimeIssueResult = z.infer<typeof symphonyRuntimeIssueResultSchema>;
export type SymphonyRuntimeRefreshResult = z.infer<typeof symphonyRuntimeRefreshResultSchema>;
export type SymphonyRuntimeLogEntry = z.infer<typeof symphonyRuntimeLogEntrySchema>;
export type SymphonyRuntimeLogsResult = z.infer<typeof symphonyRuntimeLogsResultSchema>;
export type SymphonyRuntimeMachineLoadSnapshot = z.infer<
  typeof symphonyRuntimeMachineLoadSnapshotSchema
>;
export type SymphonyRuntimeHealthResult = z.infer<
  typeof symphonyRuntimeHealthResultSchema
>;
