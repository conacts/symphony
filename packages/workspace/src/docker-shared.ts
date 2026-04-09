import { createHash } from "node:crypto";
import { defaultRuntimeDbSnapshotName } from "@symphony/db";
import type {
  SymphonyLoadedRuntimeManifest,
  SymphonyNormalizedRuntimePostgresService,
  SymphonyResolvedRuntimeService
} from "@symphony/runtime-contract";
import type {
  PreparedWorkspaceService,
  WorkspaceBackendEventRecorder,
  WorkspaceManifestLifecyclePhase,
  WorkspaceManifestLifecyclePhaseSkipReason,
  WorkspaceManifestLifecyclePhaseTrigger,
} from "./workspace-contracts.js";

export const defaultContainerWorkspacePath = "/workspace";
const defaultContainerNamePrefix = "symphony-workspace";
export const defaultDockerHomePath = "/home/agent";
export const defaultContainerSourceRepoPath = "/home/agent/source-repo";
export const managedBackendLabelKey = "dev.symphony.workspace-backend";
export const managedBackendLabelValue = "docker";
export const managedWorkspaceKeyLabelKey = "dev.symphony.workspace-key";
export const managedIssueIdentifierLabelKey = "dev.symphony.issue-identifier";
export const managedMaterializationLabelKey = "dev.symphony.materialization";
export const managedKindLabelKey = "dev.symphony.managed-kind";
const managedNetworkNameLabelKey = "dev.symphony.network-name";
export const managedServiceTypeLabelKey = "dev.symphony.service-type";
export const managedServicePortLabelKey = "dev.symphony.service-port";
export const managedHostFileMountsHashLabelKey = "dev.symphony.host-file-mounts-hash";
export const managedWorkspaceContainerKind = "workspace_container";
export const managedWorkspacePreflightKind = "workspace_preflight";
export const managedWorkspaceNetworkKind = "workspace_network";
export const managedSharedServiceKind = "shared_service";
export const managedWorkspaceVolumeKind = "workspace_volume";
export const bindMaterializationKind = "bind_mount";
export const volumeMaterializationKind = "volume";
export const defaultPostgresReadinessTimeoutMs = 15_000;
export const defaultPostgresReadinessIntervalMs = 500;
export const defaultPostgresReadinessRetries = 20;
export const dockerManifestLifecycleStateDirectoryName = ".symphony-runtime";
export const dockerManifestLifecycleStateSuffix = ".docker-manifest-lifecycle.json";
export const defaultRuntimeDbSnapshotFileName = defaultRuntimeDbSnapshotName;
export const defaultRuntimeDbSnapshotEnvKey = "SYMPHONY_RUNTIME_DB_SNAPSHOT";

export type DockerWorkspaceCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type DockerWorkspaceCommandRunner = (input: {
  args: string[];
  timeoutMs: number;
}) => Promise<DockerWorkspaceCommandResult>;

export type DockerWorkspaceBackendOptions = {
  image: string;
  workspacePath?: string;
  sourceRepoPath?: string;
  containerNamePrefix?: string;
  shell?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  containerEnv?: Record<string, string>;
  materializationMode?: DockerWorkspaceMaterializationMode;
  runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
  sharedPostgres?: DockerSharedPostgresOptions | null;
  hostFileMounts?: DockerWorkspaceHostFileMount[];
  commandRunner?: DockerWorkspaceCommandRunner;
  commandTimeoutMs?: number;
  /**
   * Path to the runtime database file to snapshot into the workspace.
   * When provided, a read-only copy of the database is placed in the workspace
   * for agent inspection.
   */
  runtimeDbSnapshotPath?: string | null;
};

export type DockerSharedPostgresOptions = {
  containerName: string;
  image: string;
  host: string;
  hostPort: number;
  containerPort: number;
  adminDatabase: string;
  adminUsername: string;
  adminPassword: string;
  databasePrefix?: string;
  rolePrefix?: string;
};

export type DockerWorkspaceMaterializationMode =
  | typeof bindMaterializationKind
  | typeof volumeMaterializationKind;

export type DockerWorkspaceMaterializationDescriptor =
  | {
      kind: typeof bindMaterializationKind;
      hostPath: string;
      volumeName: null;
    }
  | {
      kind: typeof volumeMaterializationKind;
      hostPath: null;
      volumeName: string;
    };

export type DockerWorkspaceDescriptor = {
  issueIdentifier: string;
  workspaceKey: string;
  containerName: string;
  networkName: string | null;
  materialization: DockerWorkspaceMaterializationDescriptor;
};

export type DockerWorkspaceHostFileMount = {
  sourcePath: string;
  containerPath: string;
  readOnly?: boolean;
};

export type DockerServiceDescriptor = {
  issueIdentifier: string;
  workspaceKey: string;
  key: string;
  service: SymphonyNormalizedRuntimePostgresService;
  containerName: string;
};

export type DockerContainerMount = {
  type: string | null;
  source: string | null;
  destination: string | null;
  name: string | null;
};

export type DockerContainerNetwork = {
  aliases: string[];
};

export type DockerContainerInspectState = {
  id: string;
  name: string;
  image: string | null;
  running: boolean;
  status: string | null;
  labels: Record<string, string>;
  env: Record<string, string>;
  mounts: DockerContainerMount[];
  networks: Record<string, DockerContainerNetwork>;
};

export type DockerNetworkInspectState = {
  id: string;
  name: string;
  labels: Record<string, string>;
};

export type DockerVolumeInspectState = {
  name: string;
  labels: Record<string, string>;
};

export type DockerPostgresProvision = {
  summary: PreparedWorkspaceService;
  connection: SymphonyResolvedRuntimeService;
  initRequired: boolean;
};

export type DockerManifestLifecycleState = {
  schemaVersion: 1;
  workspaceLifetimeId: string;
  completedMarkers: Partial<Record<WorkspaceManifestLifecyclePhase, string>>;
};

export type DockerManifestLifecyclePhasePlan = {
  phase: WorkspaceManifestLifecyclePhase;
  steps: SymphonyLoadedRuntimeManifest["manifest"]["lifecycle"][WorkspaceManifestLifecyclePhase];
  trigger: WorkspaceManifestLifecyclePhaseTrigger;
  marker: string | null;
  skipReason: WorkspaceManifestLifecyclePhaseSkipReason | null;
};

export type DockerPrepareManifestLifecycleInput = {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  descriptor: DockerWorkspaceDescriptor;
  containerName: string;
  containerId: string;
  created: boolean;
  workspacePath: string;
  shell: string;
  env: Record<string, string>;
  services: PreparedWorkspaceService[];
  statePath: string;
  commandRunner: DockerWorkspaceCommandRunner;
  defaultTimeoutMs: number;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
};

export function buildManagedContainerLabels(
  descriptor: DockerWorkspaceDescriptor,
  networkName: string | null
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedMaterializationLabelKey]: descriptor.materialization.kind,
    [managedKindLabelKey]: managedWorkspaceContainerKind,
    ...(networkName
      ? {
          [managedNetworkNameLabelKey]: networkName
        }
      : {})
  };
}

export function buildManagedVolumeLabels(
  descriptor: DockerWorkspaceDescriptor
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedMaterializationLabelKey]: descriptor.materialization.kind,
    [managedKindLabelKey]: managedWorkspaceVolumeKind
  };
}

export function buildDockerContainerName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(prefix, workspaceKey);
}

export function buildDockerVolumeName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(`${prefix}-volume`, workspaceKey);
}

function buildDockerManagedName(prefix: string, workspaceKey: string): string {
  const readable =
    workspaceKey
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 48) || "workspace";
  const suffix = createHash("sha256")
    .update(workspaceKey)
    .digest("hex")
    .slice(0, 8);

  return `${prefix}-${readable}-${suffix}`;
}

export function normalizeContainerPrefix(prefix: string | undefined): string {
  const normalized =
    normalizeNonEmptyString(prefix)
      ?.toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "") ?? defaultContainerNamePrefix;

  return normalized === "" ? defaultContainerNamePrefix : normalized;
}

export function normalizeNonEmptyString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeDockerContainerName(name: string): string {
  return name.replace(/^\/+/, "");
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

export function workspaceDescriptorHostPath(
  descriptor: DockerWorkspaceDescriptor
): string | null {
  return descriptor.materialization.kind === bindMaterializationKind
    ? descriptor.materialization.hostPath
    : null;
}

export function workspaceDescriptorVolumeName(
  descriptor: DockerWorkspaceDescriptor
): string | null {
  return descriptor.materialization.kind === volumeMaterializationKind
    ? descriptor.materialization.volumeName
    : null;
}
