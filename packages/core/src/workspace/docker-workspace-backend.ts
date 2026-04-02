import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  buildSymphonyRuntimePostgresConnectionString,
  resolveSymphonyRuntimeEnvBundle,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyNormalizedRuntimePostgresService,
  type SymphonyResolvedRuntimeService
} from "../runtime-manifest.js";
import {
  SymphonyWorkspaceError,
  sanitizeSymphonyIssueIdentifier,
  symphonyWorkspaceDirectoryName,
  type SymphonyWorkspaceContext
} from "./local-symphony-workspace-manager.js";
import type {
  PreparedWorkspace,
  PreparedWorkspaceService,
  WorkspaceBackend,
  WorkspaceCleanupResult,
  WorkspaceCleanupInput,
  WorkspaceCleanupService,
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
const managedKindLabelKey = "dev.symphony.managed-kind";
const managedNetworkNameLabelKey = "dev.symphony.network-name";
const managedServiceKeyLabelKey = "dev.symphony.service-key";
const managedServiceTypeLabelKey = "dev.symphony.service-type";
const managedServiceHostnameLabelKey = "dev.symphony.service-hostname";
const managedServicePortLabelKey = "dev.symphony.service-port";
const managedServiceMemoryMbLabelKey = "dev.symphony.service-memory-mb";
const managedServiceCpuSharesLabelKey = "dev.symphony.service-cpu-shares";
const managedWorkspaceContainerKind = "workspace_container";
const managedWorkspaceNetworkKind = "workspace_network";
const managedWorkspaceServiceKind = "workspace_service";
const bindMaterializationKind = "bind_mount";
const defaultPostgresMemoryMb = 512;
const defaultPostgresCpuShares = 512;
const defaultPostgresReadinessTimeoutMs = 15_000;
const defaultPostgresReadinessIntervalMs = 500;
const defaultPostgresReadinessRetries = 20;

export type DockerWorkspaceCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type DockerWorkspaceCommandRunner = (input: {
  args: string[];
  timeoutMs: number;
}) => Promise<DockerWorkspaceCommandResult>;

type DockerContainerPrepareDisposition = "started" | "reused" | "recreated";

export type DockerWorkspaceBackendOptions = {
  image: string;
  workspacePath?: string;
  containerNamePrefix?: string;
  shell?: string;
  runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
  commandRunner?: DockerWorkspaceCommandRunner;
  commandTimeoutMs?: number;
};

type DockerWorkspaceDescriptor = {
  issueIdentifier: string;
  workspaceKey: string;
  containerName: string;
  networkName: string;
  hostPath: string;
};

type DockerServiceDescriptor = {
  issueIdentifier: string;
  workspaceKey: string;
  key: string;
  service: SymphonyNormalizedRuntimePostgresService;
  containerName: string;
};

type DockerContainerInspectState = {
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

type DockerContainerMount = {
  type: string | null;
  source: string | null;
  destination: string | null;
  name: string | null;
};

type DockerContainerNetwork = {
  aliases: string[];
};

type DockerNetworkInspectState = {
  id: string;
  name: string;
  labels: Record<string, string>;
};

type DockerPostgresProvision = {
  summary: PreparedWorkspaceService;
  connection: SymphonyResolvedRuntimeService;
  initRequired: boolean;
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
  const runtimeManifest = options.runtimeManifest ?? null;
  const commandRunner = options.commandRunner ?? defaultDockerWorkspaceCommandRunner;
  const configuredCommandTimeoutMs = options.commandTimeoutMs ?? null;

  return {
    kind: "docker",
    async prepareWorkspace(input) {
      const descriptor = await createDockerWorkspaceDescriptor(
        input.context,
        input.config,
        containerNamePrefix
      );
      const timeoutMs = resolveDockerTimeoutMs(
        configuredCommandTimeoutMs,
        input.hooks.timeoutMs
      );
      const created = await ensureMaterializedWorkspace(descriptor.hostPath);
      const network = runtimeManifest
        ? await ensureManagedNetwork({
            descriptor,
            commandRunner,
            timeoutMs
          })
        : null;
      const services = runtimeManifest
        ? await ensureManagedPostgresServices({
            runtimeManifest,
            descriptor,
            commandRunner,
            timeoutMs
          })
        : {
            summaries: [],
            connections: {},
            initServices: []
          };
      const container = await ensureManagedContainer({
        descriptor,
        image,
        workspacePath,
        shell,
        networkName: network?.network.name ?? null,
        commandRunner,
        timeoutMs
      });
      const envBundle = resolveDockerWorkspaceEnvBundle({
        runtimeManifest,
        environmentSource: input.env,
        issueIdentifier: input.context.issueIdentifier,
        workspaceKey: descriptor.workspaceKey,
        workspacePath,
        runId: input.runId ?? null,
        issueId: input.context.issueId,
        services: services.connections
      });

      for (const service of services.initServices) {
        await runManagedPostgresInitSteps({
          service,
          env: envBundle.values,
          commandRunner,
          timeoutMs: input.hooks.timeoutMs
        });
      }

      let afterCreateHookOutcome: "skipped" | "completed" = "skipped";

      const workspace = buildPreparedWorkspace({
        descriptor,
        containerId: container.container.id,
        workerHost: input.workerHost ?? null,
        workspacePath,
        shell,
        created,
        containerDisposition: container.disposition,
        networkDisposition: network?.disposition ?? "not_applicable",
        networkName: network?.network.name ?? null,
        services: services.summaries,
        envBundle,
        afterCreateHookOutcome:
          created && input.hooks.afterCreate ? "completed" : "skipped"
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
          env: envBundle.values
        });
        afterCreateHookOutcome = "completed";
      }

      return {
        ...workspace,
        afterCreateHookOutcome
      };
    },

    async runBeforeRun(input) {
      if (!input.hooks.beforeRun) {
        return {
          hookKind: "before_run",
          outcome: "skipped"
        };
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
        env: input.workspace.envBundle.values
      });

      return {
        hookKind: "before_run",
        outcome: "completed"
      };
    },

    async runAfterRun(input) {
      if (!input.hooks.afterRun) {
        return {
          hookKind: "after_run",
          outcome: "skipped"
        };
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
          env: input.workspace.envBundle.values
        });
        return {
          hookKind: "after_run",
          outcome: "completed"
        };
      } catch {
        return {
          hookKind: "after_run",
          outcome: "failed_ignored"
        };
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
      let beforeRemoveHookOutcome: WorkspaceCleanupResult["beforeRemoveHookOutcome"] =
        "skipped";
      let containerRemovalDisposition: WorkspaceCleanupResult["containerRemovalDisposition"] =
        "missing";
      let containerId: string | null = null;
      const serviceDescriptors = resolveCleanupServiceDescriptors(
        runtimeManifest,
        descriptor,
        input.workspace
      );
      const networkName = input.workspace?.networkName ?? descriptor.networkName;

      if (container) {
        assertManagedContainer(container, descriptor);
        containerId = container.id;
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
              env: input.workspace?.envBundle.values ?? input.env
            });
            beforeRemoveHookOutcome = "completed";
          } catch {
            beforeRemoveHookOutcome = "failed_ignored";
          }
        }

        containerRemovalDisposition = await removeDockerContainer(
          commandRunner,
          descriptor.containerName,
          descriptor,
          timeoutMs
        );
      } else if (input.hooks.beforeRemove) {
        beforeRemoveHookOutcome = "skipped";
      }

      const serviceCleanup = await removeManagedServiceContainers(
        commandRunner,
        serviceDescriptors,
        timeoutMs
      );
      const networkRemovalDisposition = runtimeManifest
        ? await removeDockerNetwork(
            commandRunner,
            descriptor.networkName,
            descriptor,
            timeoutMs
          )
        : "not_applicable";
      const workspaceRemovalDisposition = await removeMaterializedWorkspace(
        descriptor.hostPath
      );

      return {
        backendKind: "docker",
        workerHost: input.workerHost ?? null,
        hostPath: descriptor.hostPath,
        runtimePath:
          input.workspace?.executionTarget.kind === "container"
            ? input.workspace.executionTarget.workspacePath
            : workspacePath,
        containerId,
        containerName: descriptor.containerName,
        networkName: runtimeManifest ? networkName : null,
        networkRemovalDisposition,
        serviceCleanup,
        beforeRemoveHookOutcome,
        workspaceRemovalDisposition,
        containerRemovalDisposition
      };
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
    networkName: buildDockerNetworkName(containerNamePrefix, workspaceKey),
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
    networkName:
      workspace?.networkName ?? buildDockerNetworkName(containerNamePrefix, workspaceKey),
    hostPath
  };
}

function buildPreparedWorkspace(input: {
  descriptor: DockerWorkspaceDescriptor;
  containerId: string;
  workerHost: string | null;
  workspacePath: string;
  shell: string;
  created: boolean;
  containerDisposition: DockerContainerPrepareDisposition;
  networkDisposition: PreparedWorkspace["networkDisposition"];
  networkName: string | null;
  services: PreparedWorkspaceService[];
  envBundle: PreparedWorkspace["envBundle"];
  afterCreateHookOutcome: "skipped" | "completed";
}): PreparedWorkspace {
  return {
    issueIdentifier: input.descriptor.issueIdentifier,
    workspaceKey: input.descriptor.workspaceKey,
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
      hostPath: input.descriptor.hostPath,
      shell: input.shell
    },
    materialization: {
      kind: "bind_mount",
      hostPath: input.descriptor.hostPath,
      containerPath: input.workspacePath
    },
    networkName: input.networkName,
    services: input.services,
    envBundle: input.envBundle,
    path: null,
    created: input.created,
    workerHost: input.workerHost
  };
}

function resolveDockerWorkspaceEnvBundle(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest | null;
  environmentSource: Record<string, string | undefined> | undefined;
  issueIdentifier: string;
  workspaceKey: string;
  workspacePath: string;
  runId: string | null;
  issueId: string | null;
  services: Record<string, SymphonyResolvedRuntimeService>;
}): PreparedWorkspace["envBundle"] {
  if (!input.runtimeManifest) {
    return buildAmbientDockerWorkspaceEnvBundle(input.environmentSource);
  }

  return resolveSymphonyRuntimeEnvBundle({
    manifest: input.runtimeManifest.manifest,
    environmentSource: input.environmentSource ?? {},
    runtime: {
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      runId: input.runId,
      workspaceKey: input.workspaceKey,
      workspacePath: input.workspacePath,
      backendKind: "docker"
    },
    services: input.services,
    manifestPath: input.runtimeManifest.manifestPath
  });
}

function buildAmbientDockerWorkspaceEnvBundle(
  environmentSource: Record<string, string | undefined> | undefined
): PreparedWorkspace["envBundle"] {
  const values = Object.fromEntries(
    Object.entries(environmentSource ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );

  return {
    source: "ambient",
    values,
    summary: {
      source: "ambient",
      injectedKeys: Object.keys(values).sort(),
      requiredHostKeys: [],
      optionalHostKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    }
  };
}

async function ensureManagedNetwork(input: {
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<{
  network: DockerNetworkInspectState;
  disposition: PreparedWorkspace["networkDisposition"];
}> {
  const existing = await inspectDockerNetwork(
    input.commandRunner,
    input.descriptor.networkName,
    input.timeoutMs
  );

  if (existing) {
    assertManagedNetwork(existing, input.descriptor);
    return {
      network: existing,
      disposition: "reused"
    };
  }

  const labels = buildManagedNetworkLabels(input.descriptor);
  const args = [
    "network",
    "create",
    ...dockerLabelFlags(labels),
    input.descriptor.networkName
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw dockerCommandError("network create", args, result);
  }

  return {
    network: {
      id: result.stdout.trim() || input.descriptor.networkName,
      name: input.descriptor.networkName,
      labels
    },
    disposition: "created"
  };
}

async function ensureManagedPostgresServices(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  descriptor: DockerWorkspaceDescriptor;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<{
  summaries: PreparedWorkspaceService[];
  connections: Record<string, SymphonyResolvedRuntimeService>;
  initServices: DockerServiceDescriptor[];
}> {
  const descriptors = buildDockerServiceDescriptors(
    input.runtimeManifest,
    input.descriptor
  );
  const summaries: PreparedWorkspaceService[] = [];
  const connections: Record<string, SymphonyResolvedRuntimeService> = {};
  const initServices: DockerServiceDescriptor[] = [];

  for (const descriptor of descriptors) {
    const provision = await ensureManagedPostgresService({
      descriptor,
      networkName: input.descriptor.networkName,
      commandRunner: input.commandRunner,
      timeoutMs: input.timeoutMs
    });

    summaries.push(provision.summary);
    connections[descriptor.key] = provision.connection;

    if (provision.initRequired) {
      initServices.push(descriptor);
    }
  }

  return {
    summaries,
    connections,
    initServices
  };
}

function buildDockerServiceDescriptors(
  runtimeManifest: SymphonyLoadedRuntimeManifest,
  descriptor: DockerWorkspaceDescriptor
): DockerServiceDescriptor[] {
  return Object.entries(runtimeManifest.manifest.services).map(([key, service]) => {
    if (service.type !== "postgres") {
      throw new SymphonyWorkspaceError(
        "workspace_docker_unsupported_service",
        `Unsupported manifest service type ${service.type} for ${key}.`
      );
    }

    return {
      issueIdentifier: descriptor.issueIdentifier,
      workspaceKey: descriptor.workspaceKey,
      key,
      service,
      containerName: buildDockerServiceContainerName(descriptor.workspaceKey, key)
    };
  });
}

async function ensureManagedPostgresService(input: {
  descriptor: DockerServiceDescriptor;
  networkName: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerPostgresProvision> {
  const existing = await inspectDockerContainer(
    input.commandRunner,
    input.descriptor.containerName,
    input.timeoutMs
  );
  let container: DockerContainerInspectState;
  let disposition: PreparedWorkspaceService["disposition"];

  if (!existing) {
    container = await startManagedPostgresService(input);
    disposition = "created";
  } else {
    assertManagedServiceContainer(existing, input.descriptor, input.networkName);

    if (
      canReusePostgresService(existing, input.descriptor, input.networkName)
    ) {
      container = existing;
      disposition = "reused";
    } else {
      await removeDockerServiceContainer(
        input.commandRunner,
        input.descriptor,
        input.timeoutMs
      );
      container = await startManagedPostgresService(input);
      disposition = "recreated";
    }
  }

  await waitForManagedPostgresReadiness({
    commandRunner: input.commandRunner,
    descriptor: input.descriptor,
    timeoutMs: input.timeoutMs
  });

  return {
    summary: {
      key: input.descriptor.key,
      type: "postgres",
      hostname: input.descriptor.service.hostname,
      port: input.descriptor.service.port,
      containerId: container.id,
      containerName: input.descriptor.containerName,
      disposition
    },
    connection: {
      type: "postgres",
      serviceKey: input.descriptor.key,
      host: input.descriptor.service.hostname,
      port: input.descriptor.service.port,
      database: input.descriptor.service.database,
      username: input.descriptor.service.username,
      password: input.descriptor.service.password,
      connectionString: buildSymphonyRuntimePostgresConnectionString({
        host: input.descriptor.service.hostname,
        port: input.descriptor.service.port,
        database: input.descriptor.service.database,
        username: input.descriptor.service.username,
        password: input.descriptor.service.password
      })
    },
    initRequired: disposition !== "reused" && input.descriptor.service.init.length > 0
  };
}

async function runManagedPostgresInitSteps(input: {
  service: DockerServiceDescriptor;
  env: Record<string, string>;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<void> {
  for (const step of input.service.service.init) {
    if (step.cwd) {
      throw new SymphonyWorkspaceError(
        "workspace_docker_service_init_invalid_cwd",
        `Postgres init step ${step.name} for service ${input.service.key} cannot set cwd in this stage.`
      );
    }

    const args = [
      "exec",
      ...dockerEnvFlags(input.env),
      input.service.containerName,
      "sh",
      "-lc",
      step.run
    ];
    const result = await input.commandRunner({
      args,
      timeoutMs: step.timeoutMs ?? input.timeoutMs
    });

    if (result.exitCode !== 0) {
      throw new SymphonyWorkspaceError(
        "workspace_docker_service_init_failed",
        [
          `Postgres init step ${step.name} failed for service ${input.service.key}.`,
          result.stdout.trim(),
          result.stderr.trim()
        ]
          .filter((line) => line !== "")
          .join("\n")
      );
    }
  }
}

function resolveCleanupServiceDescriptors(
  runtimeManifest: SymphonyLoadedRuntimeManifest | null,
  descriptor: DockerWorkspaceDescriptor,
  workspace: PreparedWorkspace | null | undefined
): DockerServiceDescriptor[] {
  if (runtimeManifest) {
    return buildDockerServiceDescriptors(runtimeManifest, descriptor);
  }

  return (workspace?.services ?? []).map((service) => ({
    issueIdentifier: descriptor.issueIdentifier,
    workspaceKey: descriptor.workspaceKey,
    key: service.key,
    service: {
      type: "postgres",
      image: "postgres",
      hostname: service.hostname,
      port: service.port,
      database: "postgres",
      username: "postgres",
      password: "",
      init: []
    },
    containerName: service.containerName
  }));
}

async function removeManagedServiceContainers(
  commandRunner: DockerWorkspaceCommandRunner,
  descriptors: DockerServiceDescriptor[],
  timeoutMs: number
): Promise<WorkspaceCleanupService[]> {
  const cleanup: WorkspaceCleanupService[] = [];

  for (const descriptor of descriptors) {
    const existing = await inspectDockerContainer(
      commandRunner,
      descriptor.containerName,
      timeoutMs
    );
    const removalDisposition = existing
      ? await removeDockerServiceContainer(commandRunner, descriptor, timeoutMs)
      : "missing";

    cleanup.push({
      key: descriptor.key,
      type: "postgres",
      containerId: existing?.id ?? null,
      containerName: descriptor.containerName,
      removalDisposition
    });
  }

  return cleanup;
}

async function ensureManagedContainer(input: {
  descriptor: DockerWorkspaceDescriptor;
  image: string;
  workspacePath: string;
  shell: string;
  networkName: string | null;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<{
  container: DockerContainerInspectState;
  disposition: DockerContainerPrepareDisposition;
}> {
  const existing = await inspectDockerContainer(
    input.commandRunner,
    input.descriptor.containerName,
    input.timeoutMs
  );

  if (!existing) {
    return {
      container: await startManagedContainer(input),
      disposition: "started"
    };
  }

  assertManagedContainer(existing, input.descriptor);

  if (
    await canReuseContainer(
      existing,
      input.image,
      input.workspacePath,
      input.descriptor.hostPath,
      input.networkName
    )
  ) {
    return {
      container: existing,
      disposition: "reused"
    };
  }

  await removeDockerContainer(
    input.commandRunner,
    input.descriptor.containerName,
    input.descriptor,
    input.timeoutMs
  );

  return {
    container: await startManagedContainer(input),
    disposition: "recreated"
  };
}

async function startManagedContainer(input: {
  descriptor: DockerWorkspaceDescriptor;
  image: string;
  workspacePath: string;
  shell: string;
  networkName: string | null;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const labels = buildManagedContainerLabels(input.descriptor, input.networkName);
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
    ...(input.networkName ? ["--network", input.networkName] : []),
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
    env: {
      HOME: defaultDockerHomePath
    },
    mounts: [
      {
        type: "bind",
        source: input.descriptor.hostPath,
        destination: input.workspacePath,
        name: null
      }
    ],
    networks: input.networkName
      ? {
          [input.networkName]: {
            aliases: []
          }
        }
      : {}
  };
}

async function removeDockerContainer(
  commandRunner: DockerWorkspaceCommandRunner,
  containerName: string,
  descriptor: DockerWorkspaceDescriptor,
  timeoutMs: number
): Promise<"removed" | "missing"> {
  const existing = await inspectDockerContainer(commandRunner, containerName, timeoutMs);
  if (!existing) {
    return "missing";
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

  return isDockerMissingObject(result.stderr) ? "missing" : "removed";
}

async function startManagedPostgresService(input: {
  descriptor: DockerServiceDescriptor;
  networkName: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const labels = buildManagedServiceLabels(input.descriptor, input.networkName);
  const postgresEnv = {
    POSTGRES_DB: input.descriptor.service.database,
    POSTGRES_USER: input.descriptor.service.username,
    POSTGRES_PASSWORD: input.descriptor.service.password
  };
  const args = [
    "run",
    "-d",
    "--name",
    input.descriptor.containerName,
    "--network",
    input.networkName,
    "--network-alias",
    input.descriptor.service.hostname,
    ...dockerPostgresResourceFlags(input.descriptor.service),
    ...dockerLabelFlags(labels),
    ...dockerEnvFlags(postgresEnv),
    input.descriptor.service.image,
    "postgres",
    "-p",
    String(input.descriptor.service.port)
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
    image: input.descriptor.service.image,
    running: true,
    status: "running",
    labels,
    env: postgresEnv,
    mounts: [],
    networks: {
      [input.networkName]: {
        aliases: [input.descriptor.service.hostname]
      }
    }
  };
}

async function removeDockerServiceContainer(
  commandRunner: DockerWorkspaceCommandRunner,
  descriptor: DockerServiceDescriptor,
  timeoutMs: number
): Promise<"removed" | "missing"> {
  const existing = await inspectDockerContainer(
    commandRunner,
    descriptor.containerName,
    timeoutMs
  );
  if (!existing) {
    return "missing";
  }

  if (existing.labels[managedBackendLabelKey] !== managedBackendLabelValue) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} exists but is not managed by Symphony.`
    );
  }

  if (existing.labels[managedKindLabelKey] !== managedWorkspaceServiceKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is not a managed Symphony service container.`
    );
  }

  if (existing.labels[managedServiceKeyLabelKey] !== descriptor.key) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is already assigned to service ${existing.labels[managedServiceKeyLabelKey]}.`
    );
  }

  if (existing.labels[managedWorkspaceKeyLabelKey] !== descriptor.workspaceKey) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is already assigned to workspace ${existing.labels[managedWorkspaceKeyLabelKey]}.`
    );
  }

  if (
    existing.labels[managedIssueIdentifierLabelKey] !== descriptor.issueIdentifier
  ) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker service container ${descriptor.containerName} is already assigned to issue ${existing.labels[managedIssueIdentifierLabelKey]}.`
    );
  }

  const args = ["rm", "-f", descriptor.containerName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0 && !isDockerMissingObject(result.stderr)) {
    throw dockerCommandError("rm", args, result);
  }

  return isDockerMissingObject(result.stderr) ? "missing" : "removed";
}

async function inspectDockerNetwork(
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

async function removeDockerNetwork(
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

function containerAttachedToNetwork(
  container: DockerContainerInspectState,
  networkName: string
): boolean {
  return networkName in container.networks;
}

function containerHasNetworkAlias(
  container: DockerContainerInspectState,
  networkName: string,
  alias: string
): boolean {
  return container.networks[networkName]?.aliases.includes(alias) ?? false;
}

async function waitForManagedPostgresReadiness(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  descriptor: DockerServiceDescriptor;
  timeoutMs: number;
}): Promise<void> {
  const timeoutMs =
    input.descriptor.service.readiness?.timeoutMs ?? defaultPostgresReadinessTimeoutMs;
  const intervalMs =
    input.descriptor.service.readiness?.intervalMs ??
    defaultPostgresReadinessIntervalMs;
  const retries =
    input.descriptor.service.readiness?.retries ?? defaultPostgresReadinessRetries;
  let attempts = 0;
  let lastFailure = "Unknown readiness failure.";

  while (attempts < retries) {
    attempts += 1;

    const args = [
      "exec",
      "--env",
      `PGPASSWORD=${input.descriptor.service.password}`,
      "--env",
      `SYMPHONY_PG_PORT=${input.descriptor.service.port}`,
      "--env",
      `SYMPHONY_PG_USER=${input.descriptor.service.username}`,
      "--env",
      `SYMPHONY_PG_DATABASE=${input.descriptor.service.database}`,
      input.descriptor.containerName,
      "sh",
      "-lc",
      'pg_isready -h 127.0.0.1 -p "$SYMPHONY_PG_PORT" -U "$SYMPHONY_PG_USER" -d "$SYMPHONY_PG_DATABASE"'
    ];
    const result = await input.commandRunner({
      args,
      timeoutMs
    });

    if (result.exitCode === 0) {
      return;
    }

    lastFailure = [result.stdout.trim(), result.stderr.trim()]
      .filter((line) => line !== "")
      .join("\n");

    if (attempts < retries) {
      await sleep(intervalMs);
    }
  }

  throw new SymphonyWorkspaceError(
    "workspace_docker_service_readiness_failed",
    `Postgres service ${input.descriptor.key} failed readiness after ${retries} attempts: ${lastFailure}`
  );
}

async function canReuseContainer(
  container: DockerContainerInspectState,
  image: string,
  workspacePath: string,
  hostPath: string,
  networkName: string | null
): Promise<boolean> {
  return (
    container.running &&
    container.image === image &&
    (!networkName || containerAttachedToNetwork(container, networkName)) &&
    (await containerHasExpectedBindMount(container, workspacePath, hostPath))
  );
}

function canReusePostgresService(
  container: DockerContainerInspectState,
  descriptor: DockerServiceDescriptor,
  networkName: string
): boolean {
  const resources = resolvePostgresResourceLimits(descriptor.service);

  return (
    container.running &&
    container.image === descriptor.service.image &&
    container.env.POSTGRES_DB === descriptor.service.database &&
    container.env.POSTGRES_USER === descriptor.service.username &&
    container.env.POSTGRES_PASSWORD === descriptor.service.password &&
    container.labels[managedWorkspaceKeyLabelKey] === descriptor.workspaceKey &&
    container.labels[managedIssueIdentifierLabelKey] ===
      descriptor.issueIdentifier &&
    container.labels[managedServiceHostnameLabelKey] ===
      descriptor.service.hostname &&
    container.labels[managedServicePortLabelKey] ===
      String(descriptor.service.port) &&
    container.labels[managedServiceMemoryMbLabelKey] ===
      String(resources.memoryMb) &&
    container.labels[managedServiceCpuSharesLabelKey] ===
      String(resources.cpuShares) &&
    containerAttachedToNetwork(container, networkName) &&
    containerHasNetworkAlias(container, networkName, descriptor.service.hostname)
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

  if (container.labels[managedKindLabelKey] !== managedWorkspaceContainerKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${descriptor.containerName} is not a managed Symphony workspace container.`
    );
  }
}

function assertManagedServiceContainer(
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

function assertManagedNetwork(
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

function buildManagedContainerLabels(
  descriptor: DockerWorkspaceDescriptor,
  networkName: string | null
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedMaterializationLabelKey]: bindMaterializationKind,
    [managedKindLabelKey]: managedWorkspaceContainerKind,
    ...(networkName
      ? {
          [managedNetworkNameLabelKey]: networkName
        }
      : {})
  };
}

function buildManagedNetworkLabels(
  descriptor: DockerWorkspaceDescriptor
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedWorkspaceKeyLabelKey]: descriptor.workspaceKey,
    [managedIssueIdentifierLabelKey]: descriptor.issueIdentifier,
    [managedKindLabelKey]: managedWorkspaceNetworkKind
  };
}

function buildManagedServiceLabels(
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

function resolvePostgresResourceLimits(
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

function dockerPostgresResourceFlags(
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

function buildDockerContainerName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(prefix, workspaceKey);
}

function buildDockerNetworkName(
  prefix: string,
  workspaceKey: string
): string {
  return buildDockerManagedName(`${prefix}-network`, workspaceKey);
}

function buildDockerServiceContainerName(
  workspaceKey: string,
  serviceKey: string
): string {
  return buildDockerManagedName(`symphony-service-${serviceKey}`, workspaceKey);
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

async function removeMaterializedWorkspace(
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

async function workspaceExists(workspacePath: string): Promise<boolean> {
  try {
    await stat(workspacePath);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }

    throw error;
  }
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
      `Command: docker ${sanitizeDockerArgs(args).join(" ")}`,
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
  return /No such (?:object|container|network)/i.test(stderr);
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sanitizeDockerArgs(args: string[]): string[] {
  const sanitized = [...args];

  for (let index = 0; index < sanitized.length - 1; index += 1) {
    if (sanitized[index] !== "--env") {
      continue;
    }

    sanitized[index + 1] = redactDockerEnvAssignment(sanitized[index + 1] ?? "");
  }

  return sanitized;
}

function redactDockerEnvAssignment(assignment: string): string {
  const separator = assignment.indexOf("=");
  if (separator === -1) {
    return assignment;
  }

  const key = assignment.slice(0, separator);
  const value = assignment.slice(separator + 1);
  return `${key}=${shouldRedactDockerEnvValue(key) ? "<redacted>" : value}`;
}

function shouldRedactDockerEnvValue(key: string): boolean {
  return /(PASSWORD|TOKEN|SECRET|DATABASE_URL|API_KEY|PRIVATE_KEY)/i.test(key);
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
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
