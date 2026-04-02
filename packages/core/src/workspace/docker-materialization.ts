import { mkdir, rm, stat } from "node:fs/promises";
import { isEnoent } from "../internal/errors.js";
import {
  dockerCommandError,
  dockerLabelFlags
} from "./docker-client.js";
import {
  buildManagedVolumeLabels,
  type DockerWorkspaceCommandRunner,
  type DockerWorkspaceDescriptor,
  workspaceDescriptorVolumeName
} from "./docker-shared.js";
import { inspectDockerVolume, removeDockerVolume, assertManagedVolume } from "./docker-inspect.js";
import { workspaceExists } from "./workspace-paths.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export async function ensureMaterializedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<boolean> {
  if (input.descriptor.materialization.kind === "bind_mount") {
    return await ensureBindMountedWorkspace(input.descriptor.materialization.hostPath);
  }

  return await ensureManagedVolume({
    descriptor: input.descriptor,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });
}

export async function removeMaterializedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<"removed" | "missing"> {
  if (input.descriptor.materialization.kind === "bind_mount") {
    return await removeBindMountedWorkspace(input.descriptor.materialization.hostPath);
  }

  return await removeDockerVolume(
    input.commandRunner,
    input.descriptor.materialization.volumeName,
    input.descriptor,
    input.timeoutMs
  );
}

async function ensureBindMountedWorkspace(
  workspacePath: string
): Promise<boolean> {
  try {
    const existing = await stat(workspacePath);
    if (existing.isDirectory()) {
      return false;
    }

    await rm(workspacePath, {
      recursive: true,
      force: true
    });
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }

  await mkdir(workspacePath, {
    recursive: true
  });

  return true;
}

async function removeBindMountedWorkspace(
  workspacePath: string
): Promise<"removed" | "missing"> {
  const existedBeforeDelete = await workspaceExists(workspacePath);

  await rm(workspacePath, {
    recursive: true,
    force: true
  });

  const existsAfterDelete = await workspaceExists(workspacePath);
  if (existsAfterDelete) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_remove_failed",
      `Docker workspace cleanup did not remove ${workspacePath}.`
    );
  }

  return existedBeforeDelete ? "removed" : "missing";
}

async function ensureManagedVolume(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<boolean> {
  const volumeName = workspaceDescriptorVolumeName(input.descriptor);
  if (!volumeName) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_volume_name",
      `Workspace ${input.descriptor.workspaceKey} does not define a managed volume name.`
    );
  }

  const existing = await inspectDockerVolume(
    input.commandRunner,
    volumeName,
    input.timeoutMs
  );

  if (existing) {
    assertManagedVolume(existing, input.descriptor);
    return false;
  }

  const labels = buildManagedVolumeLabels(input.descriptor);
  const args = [
    "volume",
    "create",
    ...dockerLabelFlags(labels),
    volumeName
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw dockerCommandError("volume create", args, result);
  }

  return true;
}
