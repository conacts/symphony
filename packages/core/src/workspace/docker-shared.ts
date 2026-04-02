import { createHash } from "node:crypto";
import type {
  SymphonyLoadedRuntimeManifest,
  SymphonyNormalizedRuntimePostgresService,
  SymphonyResolvedRuntimeService
} from "../runtime-manifest.js";
import type {
  PreparedWorkspaceService,
  WorkspaceBackendEventRecorder,
  WorkspaceManifestLifecyclePhase,
  WorkspaceManifestLifecyclePhaseRecord,
  WorkspaceManifestLifecyclePhaseSkipReason,
  WorkspaceManifestLifecyclePhaseTrigger,
  WorkspaceManifestLifecycleStepRecord,
  WorkspaceManifestLifecycleSummary
} from "./workspace-contracts.js";

export const defaultContainerWorkspacePath = "/home/agent/workspace";
export const defaultContainerNamePrefix = "symphony-workspace";
export const defaultDockerHomePath = "/tmp/symphony-home";
export const managedBackendLabelKey = "dev.symphony.workspace-backend";
export const managedBackendLabelValue = "docker";
export const managedWorkspaceKeyLabelKey = "dev.symphony.workspace-key";
export const managedIssueIdentifierLabelKey = "dev.symphony.issue-identifier";
export const managedMaterializationLabelKey = "dev.symphony.materialization";
export const managedKindLabelKey = "dev.symphony.managed-kind";
export const managedNetworkNameLabelKey = "dev.symphony.network-name";
export const managedServiceKeyLabelKey = "dev.symphony.service-key";
export const managedServiceTypeLabelKey = "dev.symphony.service-type";
export const managedServiceHostnameLabelKey = "dev.symphony.service-hostname";
export const managedServicePortLabelKey = "dev.symphony.service-port";
export const managedServiceMemoryMbLabelKey = "dev.symphony.service-memory-mb";
export const managedServiceCpuSharesLabelKey = "dev.symphony.service-cpu-shares";
export const managedWorkspaceContainerKind = "workspace_container";
export const managedWorkspaceNetworkKind = "workspace_network";
export const managedWorkspaceServiceKind = "workspace_service";
export const managedWorkspaceVolumeKind = "workspace_volume";
export const bindMaterializationKind = "bind_mount";
export const volumeMaterializationKind = "volume";
export const defaultPostgresMemoryMb = 512;
export const defaultPostgresCpuShares = 512;
export const defaultPostgresReadinessTimeoutMs = 15_000;
export const defaultPostgresReadinessIntervalMs = 500;
export const defaultPostgresReadinessRetries = 20;
export const dockerManifestLifecycleStateDirectoryName = ".symphony-runtime";
export const dockerManifestLifecycleStateSuffix = ".docker-manifest-lifecycle.json";

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
  containerNamePrefix?: string;
  shell?: string;
  materializationMode?: DockerWorkspaceMaterializationMode;
  runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
  commandRunner?: DockerWorkspaceCommandRunner;
  commandTimeoutMs?: number;
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
  networkName: string;
  materialization: DockerWorkspaceMaterializationDescriptor;
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

export type DockerManifestLifecyclePhaseRecord =
  WorkspaceManifestLifecyclePhaseRecord;

export type DockerManifestLifecycleStepRecord =
  WorkspaceManifestLifecycleStepRecord;

export type DockerManifestLifecycleSummary = WorkspaceManifestLifecycleSummary;

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

export function buildManagedNetworkLabels(
  descriptor: DockerWorkspaceDescriptor
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedKindLabelKey]: managedWorkspaceNetworkKind
  };
}

export function buildManagedServiceLabels(
  descriptor: DockerServiceDescriptor,
  networkName: string
): Record<string, string> {
  const resources = resolvePostgresResourceLimits(descriptor.service);

  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedKindLabelKey]: managedWorkspaceServiceKind,
    [managedServiceKeyLabelKey]: descriptor.key,
    [managedServiceTypeLabelKey]: "postgres",
    [managedServiceHostnameLabelKey]: descriptor.service.hostname,
    [managedServicePortLabelKey]: String(descriptor.service.port),
    [managedServiceMemoryMbLabelKey]: String(resources.memoryMb),
    [managedServiceCpuSharesLabelKey]: String(resources.cpuShares),
    [managedNetworkNameLabelKey]: networkName
  };
}

export function resolvePostgresResourceLimits(
  service: SymphonyNormalizedRuntimePostgresService
): {
  memoryMb: number;
  cpuShares: number;
} {
  return {
    memoryMb: service.resources?.memoryMb ?? defaultPostgresMemoryMb,
    cpuShares: service.resources?.cpuShares ?? defaultPostgresCpuShares
  };
}

export function dockerPostgresResourceFlags(
  service: SymphonyNormalizedRuntimePostgresService
): string[] {
  const resources = resolvePostgresResourceLimits(service);

  return [
    "--memory",
    `${resources.memoryMb}m`,
    "--cpu-shares",
    String(resources.cpuShares)
  ];
}

export function buildDockerContainerName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(prefix, workspaceKey);
}

export function buildDockerNetworkName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(`${prefix}-network`, workspaceKey);
}

export function buildDockerServiceContainerName(
  workspaceKey: string,
  serviceKey: string
): string {
  return buildDockerManagedName(`symphony-service-${serviceKey}`, workspaceKey);
}

export function buildDockerVolumeName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(`${prefix}-volume`, workspaceKey);
}

export function buildDockerManagedName(prefix: string, workspaceKey: string): string {
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
