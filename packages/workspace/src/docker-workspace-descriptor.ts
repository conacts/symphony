import { sanitizeSymphonyIssueIdentifier, type SymphonyWorkspaceContext } from "./workspace-identity.js";
import { resolveManagedWorkspacePath } from "./workspace-paths.js";
import {
  bindMaterializationKind,
  buildDockerContainerName,
  buildDockerVolumeName,
  volumeMaterializationKind,
  workspaceDescriptorHostPath,
  type DockerWorkspaceDescriptor,
  type DockerWorkspaceMaterializationDescriptor,
  type DockerWorkspaceMaterializationMode
} from "./docker-shared.js";
import type {
  PreparedWorkspace,
  PreparedWorkspaceService,
  WorkspaceCleanupInput,
  WorkspacePrepareInput
} from "./workspace-contracts.js";

export async function createDockerWorkspaceDescriptor(
  context: SymphonyWorkspaceContext,
  config: WorkspacePrepareInput["config"],
  containerNamePrefix: string,
  materializationMode: DockerWorkspaceMaterializationMode
): Promise<DockerWorkspaceDescriptor> {
  const workspaceKey = sanitizeSymphonyIssueIdentifier(context.issueIdentifier);
  const materialization: DockerWorkspaceMaterializationDescriptor =
    materializationMode === volumeMaterializationKind
      ? {
          kind: volumeMaterializationKind,
          hostPath: null,
          volumeName: buildDockerVolumeName(containerNamePrefix, workspaceKey)
        }
      : {
          kind: bindMaterializationKind,
          hostPath: await resolveManagedWorkspacePath(
            context.issueIdentifier,
            config.root,
            true
          ),
          volumeName: null
        };

  return {
    issueIdentifier: context.issueIdentifier,
    workspaceKey,
    containerName: buildDockerContainerName(containerNamePrefix, workspaceKey),
    networkName: null,
    materialization
  };
}

export async function resolveCleanupDescriptor(
  input: WorkspaceCleanupInput,
  containerNamePrefix: string,
  materializationMode: DockerWorkspaceMaterializationMode
): Promise<DockerWorkspaceDescriptor> {
  const workspace = input.workspace;
  const workspaceKey =
    workspace?.workspaceKey ??
    sanitizeSymphonyIssueIdentifier(input.issueIdentifier);
  const materialization: DockerWorkspaceMaterializationDescriptor =
    workspace?.materialization.kind === "bind_mount"
      ? {
          kind: bindMaterializationKind,
          hostPath: workspace.materialization.hostPath,
          volumeName: null
        }
      : workspace?.materialization.kind === "volume"
        ? {
            kind: volumeMaterializationKind,
            hostPath: null,
            volumeName: workspace.materialization.volumeName
          }
        : materializationMode === volumeMaterializationKind
          ? {
              kind: volumeMaterializationKind,
              hostPath: null,
              volumeName: buildDockerVolumeName(containerNamePrefix, workspaceKey)
            }
          : {
              kind: bindMaterializationKind,
              hostPath: await resolveManagedWorkspacePath(
                input.issueIdentifier,
                input.config.root,
                false
              ),
              volumeName: null
            };
  const containerName =
    workspace &&
    workspace.executionTarget.kind === "container" &&
    workspace.executionTarget.containerName
      ? workspace.executionTarget.containerName
      : buildDockerContainerName(containerNamePrefix, workspaceKey);

  return {
    issueIdentifier: input.issueIdentifier,
    workspaceKey,
    containerName,
    networkName: workspace?.networkName ?? null,
    materialization
  };
}

export function buildPreparedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  repositoryKey: string | null;
  containerId: string;
  workerHost: string | null;
  workspacePath: string;
  shell: string;
  created: boolean;
  containerDisposition: PreparedWorkspace["containerDisposition"];
  networkDisposition: PreparedWorkspace["networkDisposition"];
  networkName: string | null;
  services: PreparedWorkspaceService[];
  envBundle: PreparedWorkspace["envBundle"];
  manifestLifecycle: PreparedWorkspace["manifestLifecycle"];
  afterCreateHookOutcome: "skipped" | "completed";
}): PreparedWorkspace {
  return {
    issueIdentifier: input.descriptor.issueIdentifier,
    workspaceKey: input.descriptor.workspaceKey,
    repositoryKey: input.repositoryKey,
    backendKind: "docker",
    prepareDisposition: input.created ? "created" : "reused",
    containerDisposition: input.containerDisposition,
    networkDisposition: input.networkDisposition,
    afterCreateHookOutcome: input.afterCreateHookOutcome,
    executionTarget: {
      kind: "container",
      workspacePath: input.workspacePath,
      containerId: input.containerId,
      containerName: input.descriptor.containerName,
      hostPath: workspaceDescriptorHostPath(input.descriptor),
      shell: input.shell
    },
    materialization:
      input.descriptor.materialization.kind === bindMaterializationKind
        ? {
            kind: bindMaterializationKind,
            hostPath: input.descriptor.materialization.hostPath,
            containerPath: input.workspacePath
          }
        : {
            kind: volumeMaterializationKind,
            volumeName: input.descriptor.materialization.volumeName,
            containerPath: input.workspacePath,
            hostPath: null
          },
    networkName: input.networkName,
    services: input.services,
    envBundle: input.envBundle,
    manifestLifecycle: input.manifestLifecycle,
    path: null,
    created: input.created,
    workerHost: input.workerHost
  };
}
