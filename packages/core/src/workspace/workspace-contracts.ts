import type { SymphonyWorkflowHooksConfig, SymphonyWorkflowWorkspaceConfig } from "../workflow/symphony-workflow.js";
import type { SymphonyWorkspaceContext } from "./workspace-identity.js";

export type WorkspaceContext = SymphonyWorkspaceContext;

export type WorkspaceBackendRunnerOptions = {
  env?: Record<string, string | undefined>;
  workerHost?: string | null;
};

export type WorkspaceManifestLifecyclePhase =
  | "bootstrap"
  | "migrate"
  | "seed"
  | "verify"
  | "cleanup";
export type WorkspaceManifestLifecyclePhaseStatus =
  | "completed"
  | "skipped"
  | "failed";
export type WorkspaceManifestLifecyclePhaseTrigger =
  | "workspace_lifetime"
  | "service_lifetime"
  | "readiness_lifetime"
  | "teardown";
export type WorkspaceManifestLifecyclePhaseSkipReason =
  | "no_steps"
  | "already_completed_for_current_lifetime"
  | "container_not_running";
export type WorkspaceManifestLifecycleStepStatus = "completed" | "failed";

export type WorkspaceManifestLifecycleStepRecord = {
  phase: WorkspaceManifestLifecyclePhase;
  name: string;
  command: string;
  cwd: string;
  timeoutMs: number | null;
  status: WorkspaceManifestLifecycleStepStatus;
  startedAt: string;
  endedAt: string;
  failureReason: string | null;
};

export type WorkspaceManifestLifecyclePhaseRecord = {
  phase: WorkspaceManifestLifecyclePhase;
  status: WorkspaceManifestLifecyclePhaseStatus;
  trigger: WorkspaceManifestLifecyclePhaseTrigger;
  startedAt: string | null;
  endedAt: string;
  skipReason: WorkspaceManifestLifecyclePhaseSkipReason | null;
  failureReason: string | null;
  steps: WorkspaceManifestLifecycleStepRecord[];
};

export type WorkspaceManifestLifecycleSummary = {
  phases: WorkspaceManifestLifecyclePhaseRecord[];
};

export type WorkspaceBackendEvent = {
  eventType: string;
  message: string;
  payload?: unknown;
  recordedAt?: string;
};

export type WorkspaceBackendEventRecorder = (
  event: WorkspaceBackendEvent
) => Promise<void> | void;

export type WorkspacePrepareInput = {
  context: WorkspaceContext;
  runId?: string | null;
  config: SymphonyWorkflowWorkspaceConfig;
  hooks: SymphonyWorkflowHooksConfig;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
} & WorkspaceBackendRunnerOptions;

export type WorkspaceBackendKind = "local" | "docker";
export type WorkspacePrepareDisposition = "created" | "reused";
export type WorkspaceContainerDisposition =
  | "started"
  | "reused"
  | "recreated"
  | "not_applicable";
export type WorkspaceNetworkDisposition = "created" | "reused" | "not_applicable";
export type WorkspaceNetworkRemovalDisposition =
  | "removed"
  | "missing"
  | "not_applicable";
export type WorkspaceServiceType = "postgres";
export type WorkspaceServiceDisposition = "created" | "reused" | "recreated";
export type WorkspaceServiceRemovalDisposition = "removed" | "missing";
export type WorkspaceHookKind = "after_create" | "before_run" | "after_run" | "before_remove";
export type WorkspaceHookOutcome = "skipped" | "completed" | "failed_ignored";
export type WorkspaceCleanupContainerDisposition =
  | "removed"
  | "missing"
  | "not_applicable";
export type WorkspaceRemovalDisposition = "removed" | "missing";

export type WorkspaceEnvBundleSummary = {
  source: "ambient" | "manifest";
  injectedKeys: string[];
  requiredHostKeys: string[];
  optionalHostKeys: string[];
  repoEnvPath: string | null;
  projectedRepoKeys: string[];
  requiredRepoKeys: string[];
  optionalRepoKeys: string[];
  staticBindingKeys: string[];
  runtimeBindingKeys: string[];
  serviceBindingKeys: string[];
};

export type WorkspaceEnvBundle = {
  source: WorkspaceEnvBundleSummary["source"];
  values: Record<string, string>;
  summary: WorkspaceEnvBundleSummary;
};

export type PreparedWorkspaceService = {
  key: string;
  type: WorkspaceServiceType;
  hostname: string;
  port: number;
  containerId: string | null;
  containerName: string;
  disposition: WorkspaceServiceDisposition;
};

export type WorkspaceCleanupService = {
  key: string;
  type: WorkspaceServiceType;
  containerId: string | null;
  containerName: string;
  removalDisposition: WorkspaceServiceRemovalDisposition;
};

export type WorkspaceExecutionTarget =
  | {
      kind: "host_path";
      path: string;
    }
  | {
      kind: "container";
      workspacePath: string;
      containerId: string | null;
      containerName: string | null;
      hostPath: string | null;
      shell: string;
    };

export type WorkspaceMaterializationMetadata =
  | {
      kind: "directory";
      hostPath: string;
    }
  | {
      kind: "bind_mount";
      hostPath: string;
      containerPath: string;
    }
  | {
      kind: "volume";
      volumeName: string;
      containerPath: string;
      hostPath: string | null;
    };

export type PreparedWorkspace = {
  issueIdentifier: string;
  workspaceKey: string;
  backendKind: WorkspaceBackendKind;
  prepareDisposition: WorkspacePrepareDisposition;
  containerDisposition: WorkspaceContainerDisposition;
  networkDisposition: WorkspaceNetworkDisposition;
  afterCreateHookOutcome: Extract<WorkspaceHookOutcome, "skipped" | "completed">;
  executionTarget: WorkspaceExecutionTarget;
  materialization: WorkspaceMaterializationMetadata;
  networkName: string | null;
  services: PreparedWorkspaceService[];
  envBundle: WorkspaceEnvBundle;
  manifestLifecycle: WorkspaceManifestLifecycleSummary | null;
  path: string | null;
  created: boolean;
  workerHost: string | null;
};

export type WorkspaceHookResult = {
  hookKind: Extract<WorkspaceHookKind, "before_run" | "after_run">;
  outcome: WorkspaceHookOutcome;
};

export type WorkspaceCleanupResult = {
  backendKind: WorkspaceBackendKind;
  workerHost: string | null;
  hostPath: string | null;
  runtimePath: string | null;
  containerId: string | null;
  containerName: string | null;
  networkName: string | null;
  networkRemovalDisposition: WorkspaceNetworkRemovalDisposition;
  serviceCleanup: WorkspaceCleanupService[];
  beforeRemoveHookOutcome: WorkspaceHookOutcome;
  manifestLifecycleCleanup: WorkspaceManifestLifecyclePhaseRecord | null;
  workspaceRemovalDisposition: WorkspaceRemovalDisposition;
  containerRemovalDisposition: WorkspaceCleanupContainerDisposition;
};

export type WorkspaceLifecycleMetadata = {
  issueIdentifier: string;
  workspaceKey: string;
  backendKind: WorkspaceBackendKind;
  workerHost: string | null;
  executionTargetKind: WorkspaceExecutionTarget["kind"];
  materializationKind: WorkspaceMaterializationMetadata["kind"];
  hostRepoMetadataAvailable: boolean;
  prepareDisposition: WorkspacePrepareDisposition;
  containerDisposition: WorkspaceContainerDisposition;
  networkDisposition: WorkspaceNetworkDisposition;
  afterCreateHookOutcome: Extract<WorkspaceHookOutcome, "skipped" | "completed">;
  hostPath: string | null;
  runtimePath: string | null;
  containerId: string | null;
  containerName: string | null;
  networkName: string | null;
  services: PreparedWorkspaceService[];
  envBundleSummary: WorkspaceEnvBundleSummary;
  manifestLifecycle: WorkspaceManifestLifecycleSummary | null;
  path: string | null;
};

export type WorkspaceHookInput = {
  workspace: PreparedWorkspace;
  context: WorkspaceContext;
  hooks: SymphonyWorkflowHooksConfig;
} & WorkspaceBackendRunnerOptions;

export type WorkspaceCleanupInput = {
  issueIdentifier: string;
  runId?: string | null;
  config: SymphonyWorkflowWorkspaceConfig;
  hooks: SymphonyWorkflowHooksConfig;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
  workspace?: PreparedWorkspace | null;
} & WorkspaceBackendRunnerOptions;

export interface WorkspaceBackend {
  readonly kind: WorkspaceBackendKind;
  prepareWorkspace(input: WorkspacePrepareInput): Promise<PreparedWorkspace>;
  runBeforeRun(input: WorkspaceHookInput): Promise<WorkspaceHookResult>;
  runAfterRun(input: WorkspaceHookInput): Promise<WorkspaceHookResult>;
  cleanupWorkspace(input: WorkspaceCleanupInput): Promise<WorkspaceCleanupResult>;
}
