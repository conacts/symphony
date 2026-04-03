import { realpath } from "node:fs/promises";
import path from "node:path";
import { isEnoent } from "./internal/errors.js";
import { asRecord } from "./internal/records.js";
import type { WorkspaceCleanupResult } from "./workspace-contracts.js";
import {
  type DockerContainerInspectState,
  type DockerContainerMount,
  type DockerContainerNetwork,
  type DockerNetworkInspectState,
  type DockerVolumeInspectState,
  type DockerServiceDescriptor,
  type DockerWorkspaceCommandRunner,
  type DockerWorkspaceDescriptor,
  managedBackendLabelKey,
  managedBackendLabelValue,
  managedIssueIdentifierLabelKey,
  managedKindLabelKey,
  managedMaterializationLabelKey,
  managedNetworkNameLabelKey,
  managedServiceKeyLabelKey,
  managedServiceTypeLabelKey,
  managedWorkspaceContainerKind,
  managedWorkspaceKeyLabelKey,
  managedWorkspaceNetworkKind,
  managedWorkspaceServiceKind,
  managedWorkspaceVolumeKind,
  normalizeDockerContainerName,
  stringOrFallback,
  stringOrNull,
  workspaceDescriptorVolumeName
} from "./docker-shared.js";
import {
  dockerCommandError,
  isDockerMissingObject
} from "./docker-client.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export async function inspectDockerNetwork(
  commandRunner: DockerWorkspaceCommandRunner,
  networkName: string,
  timeoutMs: number
): Promise<DockerNetworkInspectState | null> {
  const args = ["network", "inspect", networkName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0) {
    if (isDockerMissingObject(result.stderr)) {
      return null;
    }

    throw dockerCommandError("network inspect", args, result);
  }

  return parseDockerNetworkInspectPayload(result.stdout, networkName);
}

export async function removeDockerNetwork(
  commandRunner: DockerWorkspaceCommandRunner,
  networkName: string,
  descriptor: DockerWorkspaceDescriptor,
  timeoutMs: number
): Promise<WorkspaceCleanupResult["networkRemovalDisposition"]> {
  const existing = await inspectDockerNetwork(commandRunner, networkName, timeoutMs);
  if (!existing) {
    return "missing";
  }

  assertManagedNetwork(existing, descriptor);

  const args = ["network", "rm", networkName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0 && !isDockerMissingObject(result.stderr)) {
    throw dockerCommandError("network rm", args, result);
  }

  return isDockerMissingObject(result.stderr) ? "missing" : "removed";
}

export async function inspectDockerVolume(
  commandRunner: DockerWorkspaceCommandRunner,
  volumeName: string,
  timeoutMs: number
): Promise<DockerVolumeInspectState | null> {
  const args = ["volume", "inspect", volumeName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0) {
    if (isDockerMissingObject(result.stderr)) {
      return null;
    }

    throw dockerCommandError("volume inspect", args, result);
  }

  return parseDockerVolumeInspectPayload(result.stdout, volumeName);
}

export async function removeDockerVolume(
  commandRunner: DockerWorkspaceCommandRunner,
  volumeName: string,
  descriptor: DockerWorkspaceDescriptor,
  timeoutMs: number
): Promise<WorkspaceCleanupResult["workspaceRemovalDisposition"]> {
  const existing = await inspectDockerVolume(commandRunner, volumeName, timeoutMs);
  if (!existing) {
    return "missing";
  }

  assertManagedVolume(existing, descriptor);

  const args = ["volume", "rm", volumeName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0 && !isDockerMissingObject(result.stderr)) {
    throw dockerCommandError("volume rm", args, result);
  }

  return isDockerMissingObject(result.stderr) ? "missing" : "removed";
}

export async function inspectDockerContainer(
  commandRunner: DockerWorkspaceCommandRunner,
  containerName: string,
  timeoutMs: number
): Promise<DockerContainerInspectState | null> {
  const args = ["inspect", "--type", "container", containerName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0) {
    if (isDockerMissingObject(result.stderr)) {
      return null;
    }

    throw dockerCommandError("inspect", args, result);
  }

  return parseDockerInspectPayload(result.stdout, containerName);
}

export function containerAttachedToNetwork(
  container: DockerContainerInspectState,
  networkName: string
): boolean {
  return networkName in container.networks;
}

export function containerHasNetworkAlias(
  container: DockerContainerInspectState,
  networkName: string,
  alias: string
): boolean {
  return container.networks[networkName]?.aliases.includes(alias) ?? false;
}

export async function containerHasExpectedBindMount(
  container: DockerContainerInspectState,
  workspacePath: string,
  hostPath: string
): Promise<boolean> {
  for (const mount of container.mounts) {
    if (
      mount.type !== "bind" ||
      mount.destination !== workspacePath ||
      mount.source === null
    ) {
      continue;
    }

    if ((await canonicalizeExistingPath(mount.source)) === hostPath) {
      return true;
    }
  }

  return false;
}

export function containerHasExpectedVolumeMount(
  container: DockerContainerInspectState,
  workspacePath: string,
  volumeName: string
): boolean {
  return container.mounts.some(
    (mount) =>
      mount.type === "volume" &&
      mount.destination === workspacePath &&
      mount.name === volumeName
  );
}

export function assertManagedContainer(
  container: DockerContainerInspectState,
  descriptor: DockerWorkspaceDescriptor
): void {
  if (container.labels[managedBackendLabelKey] !== managedBackendLabelValue) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} exists but is not managed by Symphony.`
    );
  }

  if (container.labels[managedWorkspaceKeyLabelKey] !== descriptor.workspaceKey) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} is already assigned to workspace ${container.labels[managedWorkspaceKeyLabelKey]}.`
    );
  }

  if (
    container.labels[managedIssueIdentifierLabelKey] !== descriptor.issueIdentifier
  ) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} is already assigned to issue ${container.labels[managedIssueIdentifierLabelKey]}.`
    );
  }

  if (
    container.labels[managedMaterializationLabelKey] !== descriptor.materialization.kind
  ) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} uses unsupported materialization ${container.labels[managedMaterializationLabelKey]}.`
    );
  }

  if (container.labels[managedKindLabelKey] !== managedWorkspaceContainerKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} is not a managed Symphony workspace container.`
    );
  }
}

export function assertManagedVolume(
  volume: DockerVolumeInspectState,
  descriptor: DockerWorkspaceDescriptor
): void {
  const volumeName = workspaceDescriptorVolumeName(descriptor);

  if (!volumeName) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker volume ${volume.name} does not match bind-mounted workspace ${descriptor.containerName}.`
    );
  }

  if (volume.labels[managedBackendLabelKey] !== managedBackendLabelValue) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker volume ${volume.name} exists but is not managed by Symphony.`
    );
  }

  if (volume.labels[managedKindLabelKey] !== managedWorkspaceVolumeKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker volume ${volume.name} is not a managed Symphony workspace volume.`
    );
  }

  if (volume.labels[managedWorkspaceKeyLabelKey] !== descriptor.workspaceKey) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker volume ${volume.name} is already assigned to workspace ${volume.labels[managedWorkspaceKeyLabelKey]}.`
    );
  }

  if (volume.labels[managedIssueIdentifierLabelKey] !== descriptor.issueIdentifier) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker volume ${volume.name} is already assigned to issue ${volume.labels[managedIssueIdentifierLabelKey]}.`
    );
  }

  if (volume.labels[managedMaterializationLabelKey] !== descriptor.materialization.kind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker volume ${volume.name} uses unsupported materialization ${volume.labels[managedMaterializationLabelKey]}.`
    );
  }
}

export function assertManagedServiceContainer(
  container: DockerContainerInspectState,
  descriptor: DockerServiceDescriptor,
  networkName: string
): void {
  if (container.labels[managedBackendLabelKey] !== managedBackendLabelValue) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} exists but is not managed by Symphony.`
    );
  }

  if (container.labels[managedKindLabelKey] !== managedWorkspaceServiceKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is not a managed Symphony service container.`
    );
  }

  if (container.labels[managedServiceKeyLabelKey] !== descriptor.key) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is already assigned to service ${container.labels[managedServiceKeyLabelKey]}.`
    );
  }

  if (container.labels[managedWorkspaceKeyLabelKey] !== descriptor.workspaceKey) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is already assigned to workspace ${container.labels[managedWorkspaceKeyLabelKey]}.`
    );
  }

  if (
    container.labels[managedIssueIdentifierLabelKey] !== descriptor.issueIdentifier
  ) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is already assigned to issue ${container.labels[managedIssueIdentifierLabelKey]}.`
    );
  }

  if (container.labels[managedServiceTypeLabelKey] !== "postgres") {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} uses unsupported service type ${container.labels[managedServiceTypeLabelKey]}.`
    );
  }

  if (container.labels[managedNetworkNameLabelKey] !== networkName) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is attached to ${container.labels[managedNetworkNameLabelKey]} instead of ${networkName}.`
    );
  }
}

export function assertManagedNetwork(
  network: DockerNetworkInspectState,
  descriptor: DockerWorkspaceDescriptor
): void {
  if (network.labels[managedBackendLabelKey] !== managedBackendLabelValue) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker network ${descriptor.networkName} exists but is not managed by Symphony.`
    );
  }

  if (network.labels[managedKindLabelKey] !== managedWorkspaceNetworkKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker network ${descriptor.networkName} is not a managed Symphony workspace network.`
    );
  }

  if (network.labels[managedWorkspaceKeyLabelKey] !== descriptor.workspaceKey) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker network ${descriptor.networkName} is already assigned to workspace ${network.labels[managedWorkspaceKeyLabelKey]}.`
    );
  }

  if (
    network.labels[managedIssueIdentifierLabelKey] !== descriptor.issueIdentifier
  ) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker network ${descriptor.networkName} is already assigned to issue ${network.labels[managedIssueIdentifierLabelKey]}.`
    );
  }
}

function parseDockerInspectPayload(
  payload: string,
  containerName: string
): DockerContainerInspectState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_inspect_payload",
      `Failed to parse docker inspect output for ${containerName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_inspect_payload",
      `Docker inspect did not return container metadata for ${containerName}.`
    );
  }

  const container = asRecord(parsed[0]);
  if (!container) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_inspect_payload",
      `Docker inspect returned a non-object payload for ${containerName}.`
    );
  }

  const state = asRecord(container.State);
  const config = asRecord(container.Config);
  const labels = stringRecord(config?.Labels);
  const env = envRecord(config?.Env);
  const mounts = Array.isArray(container.Mounts)
    ? container.Mounts.map(parseDockerMount)
    : [];
  const networks = parseDockerNetworks(asRecord(asRecord(container.NetworkSettings)?.Networks));

  return {
    id: stringOrFallback(container.Id, containerName),
    name: normalizeDockerContainerName(
      stringOrFallback(container.Name, containerName)
    ),
    image: stringOrNull(config?.Image),
    running: state?.Running === true,
    status: stringOrNull(state?.Status),
    labels,
    env,
    mounts,
    networks
  };
}

function parseDockerNetworkInspectPayload(
  payload: string,
  networkName: string
): DockerNetworkInspectState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_network_payload",
      `Failed to parse docker network inspect output for ${networkName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_network_payload",
      `Docker network inspect did not return metadata for ${networkName}.`
    );
  }

  const network = asRecord(parsed[0]);
  if (!network) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_network_payload",
      `Docker network inspect returned a non-object payload for ${networkName}.`
    );
  }

  return {
    id: stringOrFallback(network.Id, networkName),
    name: stringOrFallback(network.Name, networkName),
    labels: stringRecord(network.Labels)
  };
}

function parseDockerVolumeInspectPayload(
  payload: string,
  volumeName: string
): DockerVolumeInspectState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_volume_payload",
      `Failed to parse docker volume inspect output for ${volumeName}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_volume_payload",
      `Docker volume inspect did not return metadata for ${volumeName}.`
    );
  }

  const volume = asRecord(parsed[0]);
  if (!volume) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_volume_payload",
      `Docker volume inspect returned a non-object payload for ${volumeName}.`
    );
  }

  return {
    name: stringOrFallback(volume.Name, volumeName),
    labels: stringRecord(volume.Labels)
  };
}

function parseDockerMount(value: unknown): DockerContainerMount {
  const record = asRecord(value);

  return {
    type: stringOrNull(record?.Type),
    source: stringOrNull(record?.Source),
    destination: stringOrNull(record?.Destination),
    name: stringOrNull(record?.Name)
  };
}

function parseDockerNetworks(
  networks: Record<string, unknown> | null
): Record<string, DockerContainerNetwork> {
  if (!networks) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(networks).map(([name, value]) => {
      const record = asRecord(value);
      const aliases = Array.isArray(record?.Aliases)
        ? record.Aliases.filter((entry): entry is string => typeof entry === "string")
        : [];

      return [
        name,
        {
          aliases
        }
      ];
    })
  );
}

function envRecord(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => {
        const separator = entry.indexOf("=");
        return separator === -1
          ? [entry, ""]
          : [entry.slice(0, separator), entry.slice(separator + 1)];
      })
  );
}

function stringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  const entries = Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  return Object.fromEntries(entries);
}

async function canonicalizeExistingPath(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (isEnoent(error)) {
      return path.resolve(targetPath);
    }

    throw error;
  }
}
