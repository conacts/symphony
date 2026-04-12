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

const symphonyRuntimeRepositoryBindingSourceSchema = z.enum([
  "manual",
  "bootstrap",
  "sync"
]);

const symphonyRuntimeGitHubCliAuthModeSchema = z.enum([
  "env",
  "mount",
  "none"
]);

const symphonyRuntimePiAuthModeSchema = z.enum([
  "provider_env",
  "auth_json",
  "none"
]);

export const symphonyRuntimeWorkflowPresetSelectionSchema = z.strictObject({
  presetId: nonEmptyStringSchema,
  source: z.enum([
    "registry_default",
    "runtime_manifest",
    "bootstrap_override"
  ]),
  repositoryKey: nullableNonEmptyStringSchema,
  manifestPath: nullableNonEmptyStringSchema
});

export const symphonyRuntimeBindingScopeSchema = z.strictObject({
  organizationId: nonEmptyStringSchema,
  linearWorkspaceIdentityId: nonEmptyStringSchema
});

export const symphonyRuntimeBootstrapRepositorySourceSchema =
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("admitted_source_repositories"),
      source: z.enum(["environment", "explicit"]),
      sourceRepos: z.array(nonEmptyStringSchema)
    }),
    z.strictObject({
      kind: z.literal("persisted_workspace_bindings"),
      source: z.literal("database"),
      sourceRepos: z.array(nonEmptyStringSchema),
      bindingScope: symphonyRuntimeBindingScopeSchema
    })
  ]);

export const symphonyRuntimeBootstrapBindingSchema = z.strictObject({
  kind: z.literal("workflow_binding"),
  repositorySource: symphonyRuntimeBootstrapRepositorySourceSchema,
  defaultRepositoryKey: nonEmptyStringSchema,
  manifestPath: nullableNonEmptyStringSchema,
  bindingScope: symphonyRuntimeBindingScopeSchema.nullable(),
  presetSelection: symphonyRuntimeWorkflowPresetSelectionSchema
});

export const symphonyRuntimeConfigRuntimeSchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  githubRepository: nonEmptyStringSchema,
  trackerKind: z.enum(["linear", "memory"]),
  trackerTeamKey: nullableNonEmptyStringSchema,
  agentHarness: nonEmptyStringSchema,
  workspaceRoot: nonEmptyStringSchema
});

export const symphonyRuntimeConfigCredentialsSchema = z.strictObject({
  linearApiKeyConfigured: z.boolean(),
  githubCliAuthMode: symphonyRuntimeGitHubCliAuthModeSchema,
  githubCliAuthEnvKey: nullableNonEmptyStringSchema,
  piAuthMode: symphonyRuntimePiAuthModeSchema,
  piProviderEnvKey: nullableNonEmptyStringSchema
});

export const symphonyRuntimeConfigRepositorySchema = z.strictObject({
  repositoryKey: nonEmptyStringSchema,
  repoRoot: nonEmptyStringSchema,
  linearTeamKey: nonEmptyStringSchema,
  manifestPath: nonEmptyStringSchema,
  promptPath: nonEmptyStringSchema
});

export const symphonyRuntimeConfigRepositoryTeamBindingSchema = z.strictObject({
  repositoryTeamBindingId: nonEmptyStringSchema,
  linearTeamIdentityId: nonEmptyStringSchema,
  linearTeamId: nonEmptyStringSchema,
  linearTeamKey: nonEmptyStringSchema,
  source: symphonyRuntimeRepositoryBindingSourceSchema
});

export const symphonyRuntimeConfigRepositoryProjectBindingSchema = z.strictObject({
  repositoryProjectBindingId: nonEmptyStringSchema,
  linearProjectIdentityId: nonEmptyStringSchema,
  linearProjectId: nonEmptyStringSchema,
  source: symphonyRuntimeRepositoryBindingSourceSchema
});

export const symphonyRuntimeConfigWorkspaceBindingRepositorySchema = z.strictObject({
  repositoryWorkspaceBindingId: nonEmptyStringSchema,
  githubInstallationIdentityId: nonEmptyStringSchema,
  githubRepositoryIdentityId: nonEmptyStringSchema,
  repositoryKey: nonEmptyStringSchema,
  linearWorkspaceIdentityId: nonEmptyStringSchema,
  source: symphonyRuntimeRepositoryBindingSourceSchema,
  teamBindings: z.array(symphonyRuntimeConfigRepositoryTeamBindingSchema),
  projectBindings: z.array(symphonyRuntimeConfigRepositoryProjectBindingSchema)
});

export const symphonyRuntimeConfigWorkspaceBindingCatalogSchema = z.strictObject({
  organizationId: nonEmptyStringSchema,
  linearWorkspaceIdentityId: nonEmptyStringSchema,
  repositories: z.array(symphonyRuntimeConfigWorkspaceBindingRepositorySchema)
});

export const symphonyRuntimeConfigResultSchema = z.strictObject({
  runtime: symphonyRuntimeConfigRuntimeSchema,
  credentials: symphonyRuntimeConfigCredentialsSchema,
  bootstrap: symphonyRuntimeBootstrapBindingSchema,
  admittedRepositories: z.array(symphonyRuntimeConfigRepositorySchema),
  bindingCatalog: symphonyRuntimeConfigWorkspaceBindingCatalogSchema.nullable()
});

export const symphonyRuntimeWorkspaceExecutionTargetSchema = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("container"),
      workspacePath: nonEmptyStringSchema,
      containerId: nullableNonEmptyStringSchema,
      containerName: nullableNonEmptyStringSchema,
      hostPath: nullableNonEmptyStringSchema,
      user: nonEmptyStringSchema
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
    shell: nonEmptyStringSchema,
    user: nonEmptyStringSchema
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

const symphonyRuntimeWorkflowSignalSourceSchema = z.enum([
  "tracker",
  "runtime",
  "review",
  "ci",
  "operator",
  "router"
]);

export const symphonyRuntimeWorkflowComparisonSignalSchema = z.strictObject({
  id: nonEmptyStringSchema,
  type: nonEmptyStringSchema,
  source: symphonyRuntimeWorkflowSignalSourceSchema,
  occurredAt: isoTimestampSchema,
  causationId: nullableNonEmptyStringSchema,
  correlationId: nullableNonEmptyStringSchema,
  payload: jsonValueSchema
});

export const symphonyRuntimeWorkflowComparisonCandidateSchema = z.strictObject({
  candidateId: nonEmptyStringSchema,
  finalNode: nullableNonEmptyStringSchema,
  terminal: z.boolean(),
  pendingCommandCount: z.number().int().nonnegative(),
  reasonCodes: z.array(nonEmptyStringSchema)
});

export const symphonyRuntimeWorkflowComparisonSummarySchema = z.strictObject({
  diverged: z.boolean(),
  finalNodeByCandidate: z.record(nonEmptyStringSchema, nullableNonEmptyStringSchema),
  reasonCodesByCandidate: z.record(nonEmptyStringSchema, z.array(nonEmptyStringSchema)),
  pendingCommandCountsByCandidate: z.record(
    nonEmptyStringSchema,
    z.number().int().nonnegative()
  )
});

export const symphonyRuntimeWorkflowComparisonResultSchema = z.strictObject({
  workflow: z.strictObject({
    workflowId: nonEmptyStringSchema,
    repositoryKey: nonEmptyStringSchema,
    issueIdentifier: nonEmptyStringSchema,
    routerPresetId: nonEmptyStringSchema,
    routerName: nonEmptyStringSchema,
    routerVersion: nonEmptyStringSchema,
    insertedAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema
  }),
  replay: z.strictObject({
    recordedEventCount: z.number().int().nonnegative(),
    recordedSignalCount: z.number().int().nonnegative(),
    signals: z.array(symphonyRuntimeWorkflowComparisonSignalSchema)
  }),
  comparedPresetIds: z.array(nonEmptyStringSchema).nonempty(),
  entries: z.array(symphonyRuntimeWorkflowComparisonCandidateSchema).nonempty(),
  summary: symphonyRuntimeWorkflowComparisonSummarySchema
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

export const symphonyRuntimeTrackerStateObservationDispositionSchema = z.enum([
  "observed",
  "skipped",
  "ignored"
]);

export const symphonyRuntimeTrackerStateObservationResultSchema = z.strictObject({
  issueIdentifier: nonEmptyStringSchema,
  observedTrackerState: nonEmptyStringSchema,
  workflowTrackerState: nullableNonEmptyStringSchema,
  observed: z.boolean(),
  disposition: symphonyRuntimeTrackerStateObservationDispositionSchema,
  recordedAt: isoTimestampSchema
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
export const symphonyRuntimeTrackerStateObservationResponseSchema = createEnvelopeSchema(
  symphonyRuntimeTrackerStateObservationResultSchema
);
export const symphonyRuntimeWorkflowComparisonResponseSchema = createEnvelopeSchema(
  symphonyRuntimeWorkflowComparisonResultSchema
);
export const symphonyRuntimeLogsResponseSchema = createEnvelopeSchema(
  symphonyRuntimeLogsResultSchema
);
export const symphonyRuntimeHealthResponseSchema = createEnvelopeSchema(
  symphonyRuntimeHealthResultSchema
);
export const symphonyRuntimeConfigResponseSchema = createEnvelopeSchema(
  symphonyRuntimeConfigResultSchema
);

export type SymphonyRuntimeTokenTotals = z.infer<typeof symphonyRuntimeTokenTotalsSchema>;
export type SymphonyRuntimeAgentTotals = z.infer<typeof symphonyRuntimeAgentTotalsSchema>;
export type SymphonyRuntimeRunningEntry = z.infer<typeof symphonyRuntimeRunningEntrySchema>;
export type SymphonyRuntimeRetryEntry = z.infer<typeof symphonyRuntimeRetryEntrySchema>;
export type SymphonyRuntimeStateResult = z.infer<typeof symphonyRuntimeStateResultSchema>;
export type SymphonyRuntimeWorkflowPresetSelection = z.infer<
  typeof symphonyRuntimeWorkflowPresetSelectionSchema
>;
export type SymphonyRuntimeBindingScope = z.infer<
  typeof symphonyRuntimeBindingScopeSchema
>;
export type SymphonyRuntimeBootstrapRepositorySource = z.infer<
  typeof symphonyRuntimeBootstrapRepositorySourceSchema
>;
export type SymphonyRuntimeBootstrapBinding = z.infer<
  typeof symphonyRuntimeBootstrapBindingSchema
>;
export type SymphonyRuntimeConfigRuntime = z.infer<
  typeof symphonyRuntimeConfigRuntimeSchema
>;
export type SymphonyRuntimeConfigCredentials = z.infer<
  typeof symphonyRuntimeConfigCredentialsSchema
>;
export type SymphonyRuntimeConfigRepository = z.infer<
  typeof symphonyRuntimeConfigRepositorySchema
>;
export type SymphonyRuntimeConfigRepositoryTeamBinding = z.infer<
  typeof symphonyRuntimeConfigRepositoryTeamBindingSchema
>;
export type SymphonyRuntimeConfigRepositoryProjectBinding = z.infer<
  typeof symphonyRuntimeConfigRepositoryProjectBindingSchema
>;
export type SymphonyRuntimeConfigWorkspaceBindingRepository = z.infer<
  typeof symphonyRuntimeConfigWorkspaceBindingRepositorySchema
>;
export type SymphonyRuntimeConfigWorkspaceBindingCatalog = z.infer<
  typeof symphonyRuntimeConfigWorkspaceBindingCatalogSchema
>;
export type SymphonyRuntimeConfigResult = z.infer<
  typeof symphonyRuntimeConfigResultSchema
>;
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
export type SymphonyRuntimeTrackerStateObservationDisposition = z.infer<
  typeof symphonyRuntimeTrackerStateObservationDispositionSchema
>;
export type SymphonyRuntimeTrackerStateObservationResult = z.infer<
  typeof symphonyRuntimeTrackerStateObservationResultSchema
>;
export type SymphonyRuntimeWorkflowComparisonSignal = z.infer<
  typeof symphonyRuntimeWorkflowComparisonSignalSchema
>;
export type SymphonyRuntimeWorkflowComparisonCandidate = z.infer<
  typeof symphonyRuntimeWorkflowComparisonCandidateSchema
>;
export type SymphonyRuntimeWorkflowComparisonSummary = z.infer<
  typeof symphonyRuntimeWorkflowComparisonSummarySchema
>;
export type SymphonyRuntimeWorkflowComparisonResult = z.infer<
  typeof symphonyRuntimeWorkflowComparisonResultSchema
>;
export type SymphonyRuntimeLogEntry = z.infer<typeof symphonyRuntimeLogEntrySchema>;
export type SymphonyRuntimeLogsResult = z.infer<typeof symphonyRuntimeLogsResultSchema>;
export type SymphonyRuntimeMachineLoadSnapshot = z.infer<
  typeof symphonyRuntimeMachineLoadSnapshotSchema
>;
export type SymphonyRuntimeHealthResult = z.infer<
  typeof symphonyRuntimeHealthResultSchema
>;
