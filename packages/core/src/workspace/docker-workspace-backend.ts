import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  SymphonyWorkspaceError,
  sanitizeSymphonyIssueIdentifier,
  symphonyWorkspaceDirectoryName,
  type SymphonyWorkspaceContext
} from "./local-symphony-workspace-manager.js";
import type {
  PreparedWorkspace,
  WorkspaceBackend,
  WorkspaceCleanupInput,
  WorkspacePrepareInput
} from "./workspace-backend.js";

const defaultContainerWorkspacePath = "/home/agent/workspace";
const defaultContainerNamePrefix = "symphony-workspace";
const defaultDockerHomePath = "/tmp/symphony-home";
const managedBackendLabelKey = "dev.symphony.workspace-backend";
const managedBackendLabelValue = "docker";
const managedWorkspaceKeyLabelKey = "dev.symphony.workspace-key";
const managedIssueIdentifierLabelKey = "dev.symphony.issue-identifier";
const managedMaterializationLabelKey = "dev.symphony.materialization";
const bindMaterializationKind = "bind_mount";

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
  commandRunner?: DockerWorkspaceCommandRunner;
  commandTimeoutMs?: number;
};

type DockerWorkspaceDescriptor = {
  issueIdentifier: string;
  workspaceKey: string;
  containerName: string;
  hostPath: string;
};

type DockerContainerInspectState = {
  id: string;
  name: string;
  image: string | null;
  running: boolean;
  status: string | null;
  labels: Record<string, string>;
  mounts: DockerContainerMount[];
};

type DockerContainerMount = {
  type: string | null;
  source: string | null;
  destination: string | null;
  name: string | null;
};

export function createDockerWorkspaceBackend(
  options: DockerWorkspaceBackendOptions
): WorkspaceBackend {
  const image = options.image.trim();
  if (image === "") {
    throw new TypeError("Docker workspace backends require a non-empty image.");
  }

  const workspacePath = normalizeNonEmptyString(
    options.workspacePath
  ) ?? defaultContainerWorkspacePath;
  const containerNamePrefix = normalizeContainerPrefix(
    options.containerNamePrefix
  );
  const shell = normalizeNonEmptyString(options.shell) ?? "sh";
  const commandRunner = options.commandRunner ?? defaultDockerWorkspaceCommandRunner;
  const configuredCommandTimeoutMs = options.commandTimeoutMs ?? null;

  return {
    async prepareWorkspace(input) {
      const descriptor = await createDockerWorkspaceDescriptor(
        input.context,
        input.config,
        containerNamePrefix
      );
      const created = await ensureMaterializedWorkspace(descriptor.hostPath);
      const container = await ensureManagedContainer({
        descriptor,
        image,
        workspacePath,
        shell,
        commandRunner,
        timeoutMs: resolveDockerTimeoutMs(
          configuredCommandTimeoutMs,
          input.hooks.timeoutMs
        )
      });

      const workspace = buildPreparedWorkspace({
        descriptor,
        containerId: container.id,
        workerHost: input.workerHost ?? null,
        workspacePath,
        created
      });

      if (created && input.hooks.afterCreate) {
        await runWorkspaceHookInContainer({
          commandRunner,
          timeoutMs: input.hooks.timeoutMs,
          shell,
          containerName: descriptor.containerName,
          workspacePath,
          command: input.hooks.afterCreate,
          context: input.context,
          workerHost: input.workerHost ?? null,
          env: input.env
        });
      }

      return workspace;
    },

    async runBeforeRun(input) {
      if (!input.hooks.beforeRun) {
        return;
      }

      const target = requireDockerExecutionTarget(input.workspace);
      await runWorkspaceHookInContainer({
        commandRunner,
        timeoutMs: input.hooks.timeoutMs,
        shell,
        containerName: requireDockerContainerName(input.workspace),
        workspacePath: target.workspacePath,
        command: input.hooks.beforeRun,
        context: input.context,
        workerHost: input.workerHost ?? null,
        env: input.env
      });
    },

    async runAfterRun(input) {
      if (!input.hooks.afterRun) {
        return;
      }

      try {
        const target = requireDockerExecutionTarget(input.workspace);
        await runWorkspaceHookInContainer({
          commandRunner,
          timeoutMs: input.hooks.timeoutMs,
          shell,
          containerName: requireDockerContainerName(input.workspace),
          workspacePath: target.workspacePath,
          command: input.hooks.afterRun,
          context: input.context,
          workerHost: input.workerHost ?? null,
          env: input.env
        });
      } catch {
        return;
      }
    },

    async cleanupWorkspace(input) {
      const descriptor = await resolveCleanupDescriptor(
        input,
        containerNamePrefix
      );
      const timeoutMs = resolveDockerTimeoutMs(
        configuredCommandTimeoutMs,
        input.hooks.timeoutMs
      );
      const container = await inspectDockerContainer(
        commandRunner,
        descriptor.containerName,
        timeoutMs
      );

      if (container) {
        assertManagedContainer(container, descriptor);
        const cleanupWorkspacePath =
          input.workspace?.executionTarget.kind === "container"
            ? input.workspace.executionTarget.workspacePath
            : workspacePath;

        if (input.hooks.beforeRemove && container.running) {
          try {
            await runWorkspaceHookInContainer({
              commandRunner,
              timeoutMs: input.hooks.timeoutMs,
              shell,
              containerName: descriptor.containerName,
              workspacePath: cleanupWorkspacePath,
              command: input.hooks.beforeRemove,
              context: {
                issueId: null,
                issueIdentifier: descriptor.issueIdentifier
              },
              workerHost: input.workerHost ?? null,
              env: input.env
            });
          } catch {
            // best effort
          }
        }

        await removeDockerContainer(
          commandRunner,
          descriptor.containerName,
          descriptor,
          timeoutMs
        );
      }

      await rm(descriptor.hostPath, {
        recursive: true,
        force: true
      });
    }
  };
}

async function createDockerWorkspaceDescriptor(
  context: SymphonyWorkspaceContext,
  config: WorkspacePrepareInput["config"],
  containerNamePrefix: string
): Promise<DockerWorkspaceDescriptor> {
  const workspaceKey = sanitizeSymphonyIssueIdentifier(context.issueIdentifier);
  const hostPath = await resolveManagedWorkspacePath(
    context.issueIdentifier,
    config.root,
    true
  );

  return {
    issueIdentifier: context.issueIdentifier,
    workspaceKey,
    containerName: buildDockerContainerName(containerNamePrefix, workspaceKey),
    hostPath
  };
}

async function resolveCleanupDescriptor(
  input: WorkspaceCleanupInput,
  containerNamePrefix: string
): Promise<DockerWorkspaceDescriptor> {
  const workspace = input.workspace;
  const workspaceKey =
    workspace?.workspaceKey ??
    sanitizeSymphonyIssueIdentifier(input.issueIdentifier);
  const hostPath =
    workspace &&
    workspace.executionTarget.kind === "container" &&
    workspace.executionTarget.hostPath
      ? workspace.executionTarget.hostPath
      : workspace?.materialization.kind === "bind_mount"
        ? workspace.materialization.hostPath
        : await resolveManagedWorkspacePath(
            input.issueIdentifier,
            input.config.root,
            false
          );
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
    hostPath
  };
}

function buildPreparedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  containerId: string;
  workerHost: string | null;
  workspacePath: string;
  created: boolean;
}): PreparedWorkspace {
  return {
    issueIdentifier: input.descriptor.issueIdentifier,
    workspaceKey: input.descriptor.workspaceKey,
    backendKind: "docker",
    executionTarget: {
      kind: "container",
      workspacePath: input.workspacePath,
      containerId: input.containerId,
      containerName: input.descriptor.containerName,
      hostPath: input.descriptor.hostPath
    },
    materialization: {
      kind: "bind_mount",
      hostPath: input.descriptor.hostPath,
      containerPath: input.workspacePath
    },
    path: null,
    created: input.created,
    workerHost: input.workerHost
  };
}

async function ensureManagedContainer(input: {
  descriptor: DockerWorkspaceDescriptor;
  image: string;
  workspacePath: string;
  shell: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const existing = await inspectDockerContainer(
    input.commandRunner,
    input.descriptor.containerName,
    input.timeoutMs
  );

  if (!existing) {
    return await startManagedContainer(input);
  }

  assertManagedContainer(existing, input.descriptor);

  if (
    await canReuseContainer(
      existing,
      input.image,
      input.workspacePath,
      input.descriptor.hostPath
    )
  ) {
    return existing;
  }

  await removeDockerContainer(
    input.commandRunner,
    input.descriptor.containerName,
    input.descriptor,
    input.timeoutMs
  );

  return await startManagedContainer(input);
}

async function startManagedContainer(input: {
  descriptor: DockerWorkspaceDescriptor;
  image: string;
  workspacePath: string;
  shell: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const labels = buildManagedContainerLabels(input.descriptor);
  const args = [
    "run",
    "-d",
    "--name",
    input.descriptor.containerName,
    "--mount",
    `type=bind,src=${input.descriptor.hostPath},dst=${input.workspacePath}`,
    "--workdir",
    input.workspacePath,
    "--env",
    `HOME=${defaultDockerHomePath}`,
    ...hostUserFlags(),
    ...dockerLabelFlags(labels),
    "--entrypoint",
    input.shell,
    input.image,
    "-lc",
    'mkdir -p "$HOME" && while :; do sleep 3600; done'
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw dockerCommandError("run", args, result);
  }

  const containerId = result.stdout.trim();
  if (containerId === "") {
    throw new SymphonyWorkspaceError(
      "workspace_docker_invalid_container_id",
      `Docker run did not return a container id for ${input.descriptor.containerName}.`
    );
  }

  return {
    id: containerId,
    name: input.descriptor.containerName,
    image: input.image,
    running: true,
    status: "running",
    labels,
    mounts: [
      {
        type: "bind",
        source: input.descriptor.hostPath,
        destination: input.workspacePath,
        name: null
      }
    ]
  };
}

async function removeDockerContainer(
  commandRunner: DockerWorkspaceCommandRunner,
  containerName: string,
  descriptor: DockerWorkspaceDescriptor,
  timeoutMs: number
): Promise<void> {
  const existing = await inspectDockerContainer(commandRunner, containerName, timeoutMs);
  if (!existing) {
    return;
  }

  assertManagedContainer(existing, descriptor);

  const args = ["rm", "-f", containerName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0 && !isDockerMissingObject(result.stderr)) {
    throw dockerCommandError("rm", args, result);
  }
}

async function inspectDockerContainer(
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

async function runWorkspaceHookInContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  shell: string;
  containerName: string;
  workspacePath: string;
  command: string;
  context: SymphonyWorkspaceContext;
  workerHost: string | null;
  env: Record<string, string | undefined> | undefined;
}): Promise<void> {
  const args = [
    "exec",
    ...dockerEnvFlags(
      buildWorkspaceHookEnv(
        input.workspacePath,
        input.context,
        input.workerHost,
        input.env
      )
    ),
    "--workdir",
    input.workspacePath,
    input.containerName,
    input.shell,
    "-lc",
    input.command
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw new SymphonyWorkspaceError(
      "workspace_hook_failed",
      [
        `Workspace hook failed with exit code ${result.exitCode}.`,
        result.stdout,
        result.stderr
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }
}

function buildWorkspaceHookEnv(
  workspacePath: string,
  context: SymphonyWorkspaceContext,
  workerHost: string | null,
  env: Record<string, string | undefined> | undefined
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  merged.SYMPHONY_WORKSPACE_PATH = workspacePath;
  merged.SYMPHONY_ISSUE_IDENTIFIER = context.issueIdentifier;

  if (context.issueId) {
    merged.SYMPHONY_ISSUE_ID = context.issueId;
  }

  if (workerHost) {
    merged.SYMPHONY_WORKER_HOST = workerHost;
  }

  return merged;
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
  const mounts = Array.isArray(container.Mounts)
    ? container.Mounts.map(parseDockerMount)
    : [];

  return {
    id: stringOrFallback(container.Id, containerName),
    name: normalizeDockerContainerName(
      stringOrFallback(container.Name, containerName)
    ),
    image: stringOrNull(config?.Image),
    running: state?.Running === true,
    status: stringOrNull(state?.Status),
    labels,
    mounts
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

async function canReuseContainer(
  container: DockerContainerInspectState,
  image: string,
  workspacePath: string,
  hostPath: string
): Promise<boolean> {
  return (
    container.running &&
    container.image === image &&
    (await containerHasExpectedBindMount(container, workspacePath, hostPath))
  );
}

async function containerHasExpectedBindMount(
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

function assertManagedContainer(
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
    container.labels[managedMaterializationLabelKey] !== bindMaterializationKind
  ) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} uses unsupported materialization ${container.labels[managedMaterializationLabelKey]}.`
    );
  }
}

function buildManagedContainerLabels(
  descriptor: DockerWorkspaceDescriptor
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedMaterializationLabelKey]: bindMaterializationKind
  };
}

function buildDockerContainerName(
  prefix: string,
  workspaceKey: string
): string {
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

function normalizeContainerPrefix(prefix: string | undefined): string {
  const normalized =
    normalizeNonEmptyString(prefix)
      ?.toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[._-]+|[._-]+$/g, "") ?? defaultContainerNamePrefix;

  return normalized === "" ? defaultContainerNamePrefix : normalized;
}

async function ensureMaterializedWorkspace(workspacePath: string): Promise<boolean> {
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

async function resolveManagedWorkspacePath(
  issueIdentifier: string,
  root: string,
  ensureRootExists: boolean
): Promise<string> {
  const resolvedRoot = path.resolve(root);

  if (ensureRootExists) {
    await mkdir(resolvedRoot, {
      recursive: true
    });
  }

  const canonicalRoot = await canonicalizePath(resolvedRoot);
  const workspacePath = buildWorkspacePath(issueIdentifier, canonicalRoot);
  const rootPrefix = `${canonicalRoot}${path.sep}`;

  try {
    const canonicalWorkspace = await canonicalizePath(workspacePath);

    if (canonicalWorkspace === canonicalRoot) {
      throw new SymphonyWorkspaceError(
        "workspace_equals_root",
        "Workspace path must not equal the workspace root."
      );
    }

    if (!canonicalWorkspace.startsWith(rootPrefix)) {
      throw new SymphonyWorkspaceError(
        "workspace_outside_root",
        `Workspace path escaped the root: ${canonicalWorkspace}`
      );
    }

    return canonicalWorkspace;
  } catch (error) {
    if (isEnoent(error)) {
      return workspacePath;
    }

    throw error;
  }
}

function buildWorkspacePath(issueIdentifier: string, root: string): string {
  const resolvedRoot = path.resolve(root);
  const workspacePath = path.resolve(
    resolvedRoot,
    symphonyWorkspaceDirectoryName(issueIdentifier)
  );
  const rootPrefix = `${resolvedRoot}${path.sep}`;

  if (workspacePath === resolvedRoot) {
    throw new SymphonyWorkspaceError(
      "workspace_equals_root",
      "Workspace path must not equal the workspace root."
    );
  }

  if (!workspacePath.startsWith(rootPrefix)) {
    throw new SymphonyWorkspaceError(
      "workspace_outside_root",
      `Workspace path escaped the root: ${workspacePath}`
    );
  }

  return workspacePath;
}

async function canonicalizePath(targetPath: string): Promise<string> {
  return await realpath(targetPath);
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

function dockerCommandError(
  operation: string,
  args: string[],
  result: DockerWorkspaceCommandResult
): SymphonyWorkspaceError {
  return new SymphonyWorkspaceError(
    "workspace_docker_command_failed",
    [
      `docker ${operation} failed.`,
      `Command: docker ${args.join(" ")}`,
      result.stdout.trim(),
      result.stderr.trim()
    ]
      .filter((line) => line !== "")
      .join("\n")
  );
}

function dockerLabelFlags(labels: Record<string, string>): string[] {
  return Object.entries(labels).flatMap(([key, value]) => [
    "--label",
    `${key}=${value}`
  ]);
}

function dockerEnvFlags(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

function hostUserFlags(): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();

  if (typeof uid !== "number" || typeof gid !== "number") {
    return [];
  }

  return ["--user", `${uid}:${gid}`];
}

function requireDockerExecutionTarget(
  workspace: PreparedWorkspace
): Extract<PreparedWorkspace["executionTarget"], { kind: "container" }> {
  if (workspace.executionTarget.kind === "container") {
    return workspace.executionTarget;
  }

  throw new TypeError(
    "Docker workspace backends require a container execution target."
  );
}

function requireDockerContainerName(workspace: PreparedWorkspace): string {
  const target = requireDockerExecutionTarget(workspace);

  if (target.containerName) {
    return target.containerName;
  }

  throw new TypeError("Docker prepared workspaces require a container name.");
}

function resolveDockerTimeoutMs(
  configuredTimeoutMs: number | null,
  fallbackTimeoutMs: number
): number {
  return configuredTimeoutMs ?? fallbackTimeoutMs;
}

function normalizeNonEmptyString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeDockerContainerName(name: string): string {
  return name.replace(/^\/+/, "");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isDockerMissingObject(stderr: string): boolean {
  return /No such (?:object|container)/i.test(stderr);
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function defaultDockerWorkspaceCommandRunner(input: {
  args: string[];
  timeoutMs: number;
}): Promise<DockerWorkspaceCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("docker", input.args);

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new SymphonyWorkspaceError(
          "workspace_docker_timeout",
          `Docker command timed out after ${input.timeoutMs}ms.`
        )
      );
    }, input.timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new SymphonyWorkspaceError(
          "workspace_docker_unavailable",
          `Failed to start docker: ${error.message}`
        )
      );
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr
      });
    });
  });
}
