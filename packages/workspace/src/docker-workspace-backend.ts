import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSymphonyRuntimePostgresConnectionString,
  resolveSymphonyRuntimeEnvBundle,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyResolvedRuntimeService
} from "@symphony/runtime-contract";
import { isEnoent } from "./internal/errors.js";
import { asRecord } from "./internal/records.js";
import {
  SymphonyWorkspaceError,
  sanitizeSymphonyIssueIdentifier,
  type SymphonyWorkspaceContext
} from "./workspace-identity.js";
import { resolveManagedWorkspacePath } from "./workspace-paths.js";
import {
  dockerCommandError,
  dockerEnvFlags,
  dockerLabelFlags,
  hostUserFlags,
  isDockerMissingObject,
  resolveDockerTimeoutMs,
  sleep,
  shouldRedactDockerEnvValue,
  defaultDockerWorkspaceCommandRunner
} from "./docker-client.js";
import {
  assertManagedContainer,
  assertManagedNetwork,
  assertManagedServiceContainer,
  containerAttachedToNetwork,
  containerHasExpectedBindMount,
  containerHasExpectedVolumeMount,
  containerHasNetworkAlias,
  inspectDockerContainer,
  inspectDockerNetwork,
  removeDockerNetwork
} from "./docker-inspect.js";
import {
  runWorkspaceHookInContainer
} from "./docker-hooks.js";
import {
  ensureMaterializedWorkspace,
  removeMaterializedWorkspace
} from "./docker-materialization.js";
import {
  buildDockerContainerName,
  buildDockerNetworkName,
  buildDockerServiceContainerName,
  buildDockerVolumeName,
  buildManagedContainerLabels,
  buildManagedNetworkLabels,
  buildManagedServiceLabels,
  bindMaterializationKind,
  defaultContainerSourceRepoPath,
  defaultContainerWorkspacePath,
  defaultDockerHomePath,
  defaultPostgresReadinessIntervalMs,
  defaultPostgresReadinessRetries,
  defaultPostgresReadinessTimeoutMs,
  dockerManifestLifecycleStateDirectoryName,
  dockerManifestLifecycleStateSuffix,
  dockerPostgresResourceFlags,
  managedBackendLabelKey,
  managedBackendLabelValue,
  managedIssueIdentifierLabelKey,
  managedKindLabelKey,
  managedServiceKeyLabelKey,
  managedServiceCpuSharesLabelKey,
  managedServiceHostnameLabelKey,
  managedServiceMemoryMbLabelKey,
  managedServicePortLabelKey,
  managedHostFileMountsHashLabelKey,
  managedWorkspaceKeyLabelKey,
  managedWorkspaceServiceKind,
  normalizeContainerPrefix,
  normalizeNonEmptyString,
  resolvePostgresResourceLimits,
  volumeMaterializationKind,
  type DockerContainerInspectState,
  type DockerWorkspaceHostFileMount,
  type DockerManifestLifecyclePhasePlan,
  type DockerManifestLifecycleState,
  type DockerWorkspaceMaterializationDescriptor,
  type DockerWorkspaceMaterializationMode,
  type DockerNetworkInspectState,
  type DockerPostgresProvision,
  type DockerPrepareManifestLifecycleInput,
  type DockerServiceDescriptor,
  type DockerWorkspaceBackendOptions,
  type DockerWorkspaceCommandRunner,
  type DockerWorkspaceDescriptor,
  workspaceDescriptorHostPath
} from "./docker-shared.js";
import type {
  PreparedWorkspace,
  PreparedWorkspaceService,
  WorkspaceBackend,
  WorkspaceBackendEventRecorder,
  WorkspaceCleanupResult,
  WorkspaceCleanupInput,
  WorkspaceCleanupService,
  WorkspaceManifestLifecyclePhase,
  WorkspaceManifestLifecyclePhaseRecord,
  WorkspaceManifestLifecyclePhaseSkipReason,
  WorkspaceManifestLifecyclePhaseTrigger,
  WorkspaceManifestLifecycleStepRecord,
  WorkspaceManifestLifecycleSummary,
  WorkspacePrepareInput
} from "./workspace-contracts.js";

export type {
  DockerWorkspaceBackendOptions,
  DockerWorkspaceCommandResult,
  DockerWorkspaceCommandRunner
} from "./docker-shared.js";

type DockerContainerPrepareDisposition = "started" | "reused" | "recreated";

type DockerManifestLifecyclePhaseRecord =
  WorkspaceManifestLifecyclePhaseRecord;

type DockerManifestLifecycleStepRecord =
  WorkspaceManifestLifecycleStepRecord;

type DockerManifestLifecycleSummary = WorkspaceManifestLifecycleSummary;

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
  const sourceRepoPath = normalizeNonEmptyString(options.sourceRepoPath);
  const containerNamePrefix = normalizeContainerPrefix(
    options.containerNamePrefix
  );
  const shell = normalizeNonEmptyString(options.shell) ?? "bash";
  const materializationMode =
    options.materializationMode ?? bindMaterializationKind;
  const runtimeManifest = options.runtimeManifest ?? null;
  const hostFileMounts = normalizeDockerWorkspaceHostFileMounts([
    ...(options.hostFileMounts ?? []),
    ...(sourceRepoPath
      ? [
          {
            sourcePath: sourceRepoPath,
            containerPath: defaultContainerSourceRepoPath,
            readOnly: true
          }
        ]
      : [])
  ]);
  const commandRunner = options.commandRunner ?? defaultDockerWorkspaceCommandRunner;
  const configuredCommandTimeoutMs = options.commandTimeoutMs ?? null;

  return {
    kind: "docker",
    async prepareWorkspace(input) {
      const descriptor = await createDockerWorkspaceDescriptor(
        input.context,
        input.config,
        containerNamePrefix,
        materializationMode
      );
      const manifestLifecycleStatePath = runtimeManifest
        ? buildDockerManifestLifecycleStatePath(
            input.config.root,
            descriptor.workspaceKey
          )
        : null;
      const timeoutMs = resolveDockerTimeoutMs(
        configuredCommandTimeoutMs,
        input.hooks.timeoutMs
      );
      const created = await ensureMaterializedWorkspace({
        descriptor,
        commandRunner,
        timeoutMs
      });
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
        hostFileMounts,
        networkName: network?.network.name ?? null,
        commandRunner,
        timeoutMs
      });
      await hydrateWorkspaceFromMountedSourceRepo({
        sourceRepoPath,
        commandRunner,
        timeoutMs,
        shell,
        containerName: descriptor.containerName,
        workspacePath,
        issueIdentifier: input.context.issueIdentifier,
        branchName:
          normalizeNonEmptyString(input.context.branchName ?? undefined) ?? null,
        lifecycleRecorder: input.lifecycleRecorder
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

      const manifestLifecycle =
        runtimeManifest && manifestLifecycleStatePath
          ? await runDockerPrepareManifestLifecycle({
              runtimeManifest,
              descriptor,
              containerName: descriptor.containerName,
              containerId: container.container.id,
              created,
              workspacePath,
              shell,
              env: envBundle.values,
              services: services.summaries,
              statePath: manifestLifecycleStatePath,
              commandRunner,
              defaultTimeoutMs: timeoutMs,
              lifecycleRecorder: input.lifecycleRecorder
            })
          : null;

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
        manifestLifecycle,
        afterCreateHookOutcome:
          created && input.hooks.afterCreate ? "completed" : "skipped"
      });

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
      const mode = input.mode ?? "destroy";
      const preserveWorkspace = mode === "preserve";
      const descriptor = await resolveCleanupDescriptor(
        input,
        containerNamePrefix,
        materializationMode
      );
      const manifestLifecycleStatePath = runtimeManifest
        ? buildDockerManifestLifecycleStatePath(
            input.config.root,
            descriptor.workspaceKey
          )
        : null;
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
      let manifestLifecycleCleanup: WorkspaceCleanupResult["manifestLifecycleCleanup"] =
        null;
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

        if (!preserveWorkspace && input.hooks.beforeRemove && container.running) {
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

        if (!preserveWorkspace && runtimeManifest) {
          manifestLifecycleCleanup = await runDockerCleanupManifestLifecycle({
            runtimeManifest,
            descriptor,
            containerName: descriptor.containerName,
            containerId: container.id,
            workspacePath: cleanupWorkspacePath,
            shell,
            running: container.running,
            env:
              input.workspace?.envBundle.values ??
              resolveDockerWorkspaceEnvBundle({
                runtimeManifest,
                environmentSource: input.env,
                issueIdentifier: descriptor.issueIdentifier,
                workspaceKey: descriptor.workspaceKey,
                workspacePath: cleanupWorkspacePath,
                runId: input.runId ?? null,
                issueId: null,
                services: buildResolvedCleanupServices(serviceDescriptors)
              }).values,
            commandRunner,
            defaultTimeoutMs: timeoutMs,
            lifecycleRecorder: input.lifecycleRecorder
          });
        }

        containerRemovalDisposition = preserveWorkspace
          ? await stopDockerContainer(
              commandRunner,
              descriptor.containerName,
              descriptor,
              timeoutMs
            )
          : await removeDockerContainer(
              commandRunner,
              descriptor.containerName,
              descriptor,
              timeoutMs
            );
      } else if (input.hooks.beforeRemove) {
        beforeRemoveHookOutcome = "skipped";
      }

      if (!preserveWorkspace && runtimeManifest && !container) {
        manifestLifecycleCleanup = await runDockerCleanupManifestLifecycle({
          runtimeManifest,
          descriptor,
          containerName: descriptor.containerName,
          containerId: null,
          workspacePath:
            input.workspace?.executionTarget.kind === "container"
              ? input.workspace.executionTarget.workspacePath
              : workspacePath,
          shell,
          running: false,
          env:
            input.workspace?.envBundle.values ??
            resolveDockerWorkspaceEnvBundle({
              runtimeManifest,
              environmentSource: input.env,
              issueIdentifier: descriptor.issueIdentifier,
              workspaceKey: descriptor.workspaceKey,
              workspacePath:
                input.workspace?.executionTarget.kind === "container"
                  ? input.workspace.executionTarget.workspacePath
                  : workspacePath,
              runId: input.runId ?? null,
              issueId: null,
              services: buildResolvedCleanupServices(serviceDescriptors)
            }).values,
          commandRunner,
          defaultTimeoutMs: timeoutMs,
          lifecycleRecorder: input.lifecycleRecorder
        });
      }

      const serviceCleanup = preserveWorkspace
        ? await stopManagedServiceContainers(
            commandRunner,
            serviceDescriptors,
            timeoutMs
          )
        : await removeManagedServiceContainers(
            commandRunner,
            serviceDescriptors,
            timeoutMs
          );
      const networkRemovalDisposition = runtimeManifest
        ? preserveWorkspace
          ? "preserved"
          : await removeDockerNetwork(
              commandRunner,
              descriptor.networkName,
              descriptor,
              timeoutMs
            )
        : "not_applicable";
      const workspaceRemovalDisposition = preserveWorkspace
        ? "preserved"
        : await removeMaterializedWorkspace({
            descriptor,
            commandRunner,
            timeoutMs
          });
      if (!preserveWorkspace && manifestLifecycleStatePath) {
        await removeDockerManifestLifecycleState(manifestLifecycleStatePath);
      }

      return {
        backendKind: "docker",
        workerHost: input.workerHost ?? null,
        hostPath: workspaceDescriptorHostPath(descriptor),
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
        manifestLifecycleCleanup,
        workspaceRemovalDisposition,
        containerRemovalDisposition
      };
    }
  };
}

async function createDockerWorkspaceDescriptor(
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
    networkName: buildDockerNetworkName(containerNamePrefix, workspaceKey),
    materialization
  };
}

async function resolveCleanupDescriptor(
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
    networkName:
      workspace?.networkName ?? buildDockerNetworkName(containerNamePrefix, workspaceKey),
    materialization
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
  manifestLifecycle: PreparedWorkspace["manifestLifecycle"];
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

async function hydrateWorkspaceFromMountedSourceRepo(input: {
  sourceRepoPath: string | null;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  shell: string;
  containerName: string;
  workspacePath: string;
  issueIdentifier: string;
  branchName: string | null;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
}): Promise<void> {
  if (!input.sourceRepoPath) {
    return;
  }

  const branchName = input.branchName?.trim() || `symphony/${input.issueIdentifier}`;
  const startedAt = new Date().toISOString();
  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_repo_hydration_started",
    "Workspace repo hydration started.",
    {
      hydration: {
        issueIdentifier: input.issueIdentifier,
        branchName
      }
    },
    startedAt
  );

  const hydrationScript = [
    "set -euo pipefail",
    `branch_name=${shellQuote(branchName)}`,
    `source_repo=${shellQuote(defaultContainerSourceRepoPath)}`,
    "if [ -d .git ]; then",
    "  echo reused",
    "  exit 0",
    "fi",
    "existing_entry=$(find . -mindepth 1 -maxdepth 1 ! -name '.symphony-runtime' -print -quit || true)",
    "if [ -n \"$existing_entry\" ]; then",
    "  echo \"Workspace is not empty but is missing .git; refusing implicit rehydration.\" >&2",
    "  exit 1",
    "fi",
    "tmpdir=$(mktemp -d)",
    "cleanup() { rm -rf \"$tmpdir\"; }",
    "trap cleanup EXIT",
    "git clone --no-local \"$source_repo\" \"$tmpdir/repo\"",
    "origin_url=$(git -C \"$source_repo\" remote get-url origin 2>/dev/null || true)",
    "if [ -n \"$origin_url\" ]; then",
    "  git -C \"$tmpdir/repo\" remote set-url origin \"$origin_url\"",
    "fi",
    "if git -C \"$tmpdir/repo\" rev-parse --verify --quiet \"refs/heads/$branch_name\" >/dev/null; then",
    "  git -C \"$tmpdir/repo\" checkout \"$branch_name\" >/dev/null 2>&1",
    "elif git -C \"$tmpdir/repo\" rev-parse --verify --quiet \"refs/remotes/origin/$branch_name\" >/dev/null; then",
    "  git -C \"$tmpdir/repo\" checkout -B \"$branch_name\" \"refs/remotes/origin/$branch_name\" >/dev/null 2>&1",
    "else",
    "  git -C \"$tmpdir/repo\" checkout -B \"$branch_name\" >/dev/null 2>&1",
    "fi",
    "cp -a \"$tmpdir/repo\"/. .",
    "echo hydrated"
  ].join("\n");

  const result = await input.commandRunner({
    args: [
      "exec",
      "--workdir",
      input.workspacePath,
      input.containerName,
      input.shell,
      "-lc",
      hydrationScript
    ],
    timeoutMs: input.timeoutMs
  });

  const endedAt = new Date().toISOString();
  if (result.exitCode !== 0) {
    throw new SymphonyWorkspaceError(
      "workspace_repo_hydration_failed",
      [
        `Workspace repo hydration failed for ${input.issueIdentifier}.`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }

  const outcome =
    result.stdout.trim().split(/\s+/).includes("hydrated") ? "hydrated" : "reused";
  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_repo_hydration_completed",
    outcome === "hydrated"
      ? "Workspace repo hydration completed."
      : "Workspace repo hydration skipped because the repo already existed.",
    {
      hydration: {
        issueIdentifier: input.issueIdentifier,
        branchName,
        outcome
      }
    },
    endedAt
  );
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
    return applyDockerWorkspaceRuntimeEnvDefaults(
      buildAmbientDockerWorkspaceEnvBundle(input.environmentSource)
    );
  }

  return applyDockerWorkspaceRuntimeEnvDefaults(
    resolveSymphonyRuntimeEnvBundle({
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
    })
  );
}

function applyDockerWorkspaceRuntimeEnvDefaults(
  envBundle: PreparedWorkspace["envBundle"]
): PreparedWorkspace["envBundle"] {
  if (envBundle.values.NODE_OPTIONS) {
    return envBundle;
  }

  return {
    ...envBundle,
    values: {
      ...envBundle.values,
      NODE_OPTIONS: "--max-old-space-size=2048"
    }
  };
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
      repoEnvPath: null,
      projectedRepoKeys: [],
      requiredRepoKeys: [],
      optionalRepoKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    }
  };
}

class DockerWorkspaceManifestLifecycleError extends SymphonyWorkspaceError {
  readonly manifestLifecycle: DockerManifestLifecycleSummary;
  readonly manifestLifecyclePhase: WorkspaceManifestLifecyclePhase;
  readonly manifestLifecycleStepName: string | null;

  constructor(input: {
    phase: WorkspaceManifestLifecyclePhase;
    stepName: string | null;
    message: string;
    manifestLifecycle: DockerManifestLifecycleSummary;
  }) {
    super("workspace_manifest_lifecycle_failed", input.message);
    this.manifestLifecycle = input.manifestLifecycle;
    this.manifestLifecyclePhase = input.phase;
    this.manifestLifecycleStepName = input.stepName;
  }
}

async function runDockerPrepareManifestLifecycle(
  input: DockerPrepareManifestLifecycleInput
): Promise<DockerManifestLifecycleSummary> {
  const lifecycleState = await loadDockerManifestLifecycleState(
    input.statePath,
    input.created
  );
  const phasePlans = buildDockerPrepareManifestLifecyclePhasePlans({
    runtimeManifest: input.runtimeManifest,
    lifecycleState,
    services: input.services,
    containerId: input.containerId
  });
  await ensureDockerWorkspaceDependenciesForBootstrap({
    runtimeManifest: input.runtimeManifest,
    phasePlans,
    workspacePath: input.workspacePath,
    shell: input.shell,
    containerName: input.containerName,
    env: input.env,
    commandRunner: input.commandRunner,
    defaultTimeoutMs: input.defaultTimeoutMs,
    lifecycleRecorder: input.lifecycleRecorder
  });
  const phases: DockerManifestLifecyclePhaseRecord[] = [];

  for (const plan of phasePlans) {
    const record = await executeDockerManifestLifecyclePhase({
      phase: plan.phase,
      steps: plan.steps,
      trigger: plan.trigger,
      marker: plan.marker,
      skipReason: plan.skipReason,
      runtimeManifest: input.runtimeManifest,
      workspacePath: input.workspacePath,
      shell: input.shell,
      containerName: input.containerName,
      env: input.env,
      commandRunner: input.commandRunner,
      defaultTimeoutMs: input.defaultTimeoutMs,
      lifecycleRecorder: input.lifecycleRecorder
    });
    phases.push(record);

    if (record.status === "completed" && plan.marker) {
      lifecycleState.completedMarkers[plan.phase] = plan.marker;
      await persistDockerManifestLifecycleState(input.statePath, lifecycleState);
      continue;
    }

    if (record.status === "failed") {
      throw new DockerWorkspaceManifestLifecycleError({
        phase: record.phase,
        stepName: record.steps.at(-1)?.name ?? null,
        message: record.failureReason ?? `Manifest lifecycle phase ${record.phase} failed.`,
        manifestLifecycle: {
          phases
        }
      });
    }
  }

  return {
    phases
  };
}

async function ensureDockerWorkspaceDependenciesForBootstrap(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  phasePlans: DockerManifestLifecyclePhasePlan[];
  workspacePath: string;
  shell: string;
  containerName: string;
  env: Record<string, string>;
  commandRunner: DockerWorkspaceCommandRunner;
  defaultTimeoutMs: number;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
}): Promise<void> {
  const bootstrapPlan = input.phasePlans.find((plan) => plan.phase === "bootstrap");
  if (!bootstrapPlan || bootstrapPlan.skipReason) {
    return;
  }

  if (
    bootstrapPlan.steps.some((step) =>
      manifestStepIncludesDependencyInstall(
        step.run,
        input.runtimeManifest.manifest.workspace.packageManager
      )
    )
  ) {
    return;
  }

  const startedAt = new Date().toISOString();
  const installCommand = buildDockerWorkspaceDependencyInstallCommand(
    input.runtimeManifest.manifest.workspace.packageManager
  );
  const workingDirectory = resolveDockerManifestLifecycleStepWorkingDirectory(
    input.runtimeManifest,
    input.workspacePath,
    undefined
  );

  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_dependency_install_started",
    "Workspace dependency install started.",
    {
      dependencyInstall: {
        packageManager: input.runtimeManifest.manifest.workspace.packageManager,
        workspacePath: input.workspacePath,
        workingDirectory,
        command: installCommand
      }
    },
    startedAt
  );

  const result = await input.commandRunner({
    args: [
      "exec",
      ...dockerEnvFlags(input.env),
      "--workdir",
      input.workspacePath,
      input.containerName,
      input.shell,
      "-lc",
      buildDockerWorkspaceDependencyInstallScript({
        workspacePath: input.workspacePath,
        workingDirectory,
        installCommand
      })
    ],
    timeoutMs: input.defaultTimeoutMs
  });
  const endedAt = new Date().toISOString();

  if (result.exitCode !== 0) {
    await emitDockerManifestLifecyclePhaseEvent(
      input.lifecycleRecorder,
      "workspace_dependency_install_failed",
      "Workspace dependency install failed.",
      {
        dependencyInstall: {
          packageManager: input.runtimeManifest.manifest.workspace.packageManager,
          command: installCommand,
          failureReason: formatDockerWorkspaceDependencyInstallFailureReason(
            result.exitCode,
            result.stdout,
            result.stderr,
            input.env
          )
        }
      },
      endedAt
    );

    throw new SymphonyWorkspaceError(
      "workspace_dependency_install_failed",
      formatDockerWorkspaceDependencyInstallFailureReason(
        result.exitCode,
        result.stdout,
        result.stderr,
        input.env
      )
    );
  }

  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_dependency_install_completed",
    "Workspace dependency install completed.",
    {
      dependencyInstall: {
        packageManager: input.runtimeManifest.manifest.workspace.packageManager,
        command: installCommand
      }
    },
    endedAt
  );
}

async function runDockerCleanupManifestLifecycle(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  descriptor: DockerWorkspaceDescriptor;
  containerName: string;
  containerId: string | null;
  workspacePath: string;
  shell: string;
  running: boolean;
  env: Record<string, string>;
  commandRunner: DockerWorkspaceCommandRunner;
  defaultTimeoutMs: number;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
}): Promise<DockerManifestLifecyclePhaseRecord> {
  return await executeDockerManifestLifecyclePhase({
    phase: "cleanup",
    steps: input.runtimeManifest.manifest.lifecycle.cleanup,
    trigger: "teardown",
    marker: null,
    skipReason: input.running ? null : "container_not_running",
    runtimeManifest: input.runtimeManifest,
    workspacePath: input.workspacePath,
    shell: input.shell,
    containerName: input.containerName,
    env: input.env,
    commandRunner: input.commandRunner,
    defaultTimeoutMs: input.defaultTimeoutMs,
    lifecycleRecorder: input.lifecycleRecorder
  });
}

function buildDockerPrepareManifestLifecyclePhasePlans(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  lifecycleState: DockerManifestLifecycleState;
  services: PreparedWorkspaceService[];
  containerId: string;
}): DockerManifestLifecyclePhasePlan[] {
  const workspaceMarker = input.lifecycleState.workspaceLifetimeId;
  const serviceMarker = buildDockerManifestServiceLifetimeMarker(
    input.services,
    workspaceMarker
  );
  const readinessMarker = buildDockerManifestReadinessLifetimeMarker({
    workspaceLifetimeId: workspaceMarker,
    serviceMarker,
    containerId: input.containerId
  });

  return [
    buildDockerManifestLifecyclePhasePlan({
      phase: "bootstrap",
      steps: input.runtimeManifest.manifest.lifecycle.bootstrap,
      trigger: "workspace_lifetime",
      marker: workspaceMarker,
      lifecycleState: input.lifecycleState
    }),
    buildDockerManifestLifecyclePhasePlan({
      phase: "migrate",
      steps: input.runtimeManifest.manifest.lifecycle.migrate,
      trigger: input.services.length > 0 ? "service_lifetime" : "workspace_lifetime",
      marker: serviceMarker,
      lifecycleState: input.lifecycleState
    }),
    buildDockerManifestLifecyclePhasePlan({
      phase: "seed",
      steps: input.runtimeManifest.manifest.lifecycle.seed,
      trigger: input.services.length > 0 ? "service_lifetime" : "workspace_lifetime",
      marker: serviceMarker,
      lifecycleState: input.lifecycleState
    }),
    buildDockerManifestLifecyclePhasePlan({
      phase: "verify",
      steps: input.runtimeManifest.manifest.lifecycle.verify,
      trigger: "readiness_lifetime",
      marker: readinessMarker,
      lifecycleState: input.lifecycleState
    })
  ];
}

function buildDockerManifestLifecyclePhasePlan(input: {
  phase: WorkspaceManifestLifecyclePhase;
  steps: SymphonyLoadedRuntimeManifest["manifest"]["lifecycle"][WorkspaceManifestLifecyclePhase];
  trigger: WorkspaceManifestLifecyclePhaseTrigger;
  marker: string;
  lifecycleState: DockerManifestLifecycleState;
}): DockerManifestLifecyclePhasePlan {
  if (input.steps.length === 0) {
    return {
      phase: input.phase,
      steps: input.steps,
      trigger: input.trigger,
      marker: input.marker,
      skipReason: "no_steps"
    };
  }

  return {
    phase: input.phase,
    steps: input.steps,
    trigger: input.trigger,
    marker: input.marker,
    skipReason:
      input.lifecycleState.completedMarkers[input.phase] === input.marker
        ? "already_completed_for_current_lifetime"
        : null
  };
}

async function executeDockerManifestLifecyclePhase(input: {
  phase: WorkspaceManifestLifecyclePhase;
  steps: SymphonyLoadedRuntimeManifest["manifest"]["lifecycle"][WorkspaceManifestLifecyclePhase];
  trigger: WorkspaceManifestLifecyclePhaseTrigger;
  marker: string | null;
  skipReason: WorkspaceManifestLifecyclePhaseSkipReason | null;
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  workspacePath: string;
  shell: string;
  containerName: string;
  env: Record<string, string>;
  commandRunner: DockerWorkspaceCommandRunner;
  defaultTimeoutMs: number;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
}): Promise<DockerManifestLifecyclePhaseRecord> {
  const skippedAt = new Date().toISOString();

  if (input.skipReason) {
    const record: DockerManifestLifecyclePhaseRecord = {
      phase: input.phase,
      status: "skipped",
      trigger: input.trigger,
      startedAt: null,
      endedAt: skippedAt,
      skipReason: input.skipReason,
      failureReason: null,
      steps: []
    };
    await emitDockerManifestLifecyclePhaseEvent(
      input.lifecycleRecorder,
      "workspace_manifest_phase_skipped",
      phaseSkippedMessage(record),
      {
        manifestLifecycle: record
      },
      skippedAt
    );
    return record;
  }

  const startedAt = new Date().toISOString();
  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_manifest_phase_started",
    `Manifest lifecycle phase ${input.phase} started.`,
    {
      manifestLifecycle: {
        phase: input.phase,
        trigger: input.trigger,
        stepCount: input.steps.length
      }
    },
    startedAt
  );

  const steps: DockerManifestLifecycleStepRecord[] = [];

  for (const step of input.steps) {
    const stepRecord = await executeDockerManifestLifecycleStep({
      phase: input.phase,
      step,
      runtimeManifest: input.runtimeManifest,
      workspacePath: input.workspacePath,
      shell: input.shell,
      containerName: input.containerName,
      env: input.env,
      commandRunner: input.commandRunner,
      defaultTimeoutMs: input.defaultTimeoutMs,
      lifecycleRecorder: input.lifecycleRecorder
    });
    steps.push(stepRecord);

    if (stepRecord.status === "failed") {
      const phaseRecord: DockerManifestLifecyclePhaseRecord = {
        phase: input.phase,
        status: "failed",
        trigger: input.trigger,
        startedAt,
        endedAt: stepRecord.endedAt,
        skipReason: null,
        failureReason: stepRecord.failureReason,
        steps
      };
      await emitDockerManifestLifecyclePhaseEvent(
        input.lifecycleRecorder,
        "workspace_manifest_phase_failed",
        `Manifest lifecycle phase ${input.phase} failed.`,
        {
          manifestLifecycle: phaseRecord
        },
        stepRecord.endedAt
      );
      return phaseRecord;
    }
  }

  const completedAt = new Date().toISOString();
  const completedRecord: DockerManifestLifecyclePhaseRecord = {
    phase: input.phase,
    status: "completed",
    trigger: input.trigger,
    startedAt,
    endedAt: completedAt,
    skipReason: null,
    failureReason: null,
    steps
  };
  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_manifest_phase_completed",
    `Manifest lifecycle phase ${input.phase} completed.`,
    {
      manifestLifecycle: completedRecord
    },
    completedAt
  );

  return completedRecord;
}

async function executeDockerManifestLifecycleStep(input: {
  phase: WorkspaceManifestLifecyclePhase;
  step: SymphonyLoadedRuntimeManifest["manifest"]["lifecycle"]["bootstrap"][number];
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  workspacePath: string;
  shell: string;
  containerName: string;
  env: Record<string, string>;
  commandRunner: DockerWorkspaceCommandRunner;
  defaultTimeoutMs: number;
  lifecycleRecorder?: WorkspaceBackendEventRecorder;
}): Promise<DockerManifestLifecycleStepRecord> {
  const startedAt = new Date().toISOString();
  const cwd = resolveDockerManifestLifecycleStepWorkingDirectory(
    input.runtimeManifest,
    input.workspacePath,
    input.step.cwd
  );
  const timeoutMs = input.step.timeoutMs ?? input.defaultTimeoutMs;

  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_manifest_step_started",
    `Manifest lifecycle step ${input.phase}/${input.step.name} started.`,
    {
      manifestLifecycle: {
        phase: input.phase,
        stepName: input.step.name,
        command: input.step.run,
        cwd,
        timeoutMs
      }
    },
    startedAt
  );

  const args = [
    "exec",
    ...dockerEnvFlags(input.env),
    "--workdir",
    cwd,
    input.containerName,
    input.shell,
    "-lc",
    input.step.run
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs
  });
  const endedAt = new Date().toISOString();
  const stepRecord: DockerManifestLifecycleStepRecord = {
    phase: input.phase,
    name: input.step.name,
    command: input.step.run,
    cwd,
    timeoutMs,
    status: result.exitCode === 0 ? "completed" : "failed",
    startedAt,
    endedAt,
    failureReason:
      result.exitCode === 0
        ? null
        : formatDockerManifestLifecycleStepFailureReason(
            input.phase,
            input.step.name,
            result.exitCode,
            result.stdout,
            result.stderr,
            input.env
          )
  };

  await emitDockerManifestLifecyclePhaseEvent(
    input.lifecycleRecorder,
    "workspace_manifest_step_completed",
    stepRecord.status === "completed"
      ? `Manifest lifecycle step ${input.phase}/${input.step.name} completed.`
      : `Manifest lifecycle step ${input.phase}/${input.step.name} failed.`,
    {
      manifestLifecycle: stepRecord
    },
    endedAt
  );

  return stepRecord;
}

async function emitDockerManifestLifecyclePhaseEvent(
  lifecycleRecorder: WorkspaceBackendEventRecorder | undefined,
  eventType: string,
  message: string,
  payload: unknown,
  recordedAt: string
): Promise<void> {
  await lifecycleRecorder?.({
    eventType,
    message,
    payload,
    recordedAt
  });
}

function phaseSkippedMessage(
  record: DockerManifestLifecyclePhaseRecord
): string {
  switch (record.skipReason) {
    case "no_steps":
      return `Manifest lifecycle phase ${record.phase} skipped because it has no steps.`;
    case "already_completed_for_current_lifetime":
      return `Manifest lifecycle phase ${record.phase} skipped because it already completed for the current warm lifetime.`;
    case "container_not_running":
      return `Manifest lifecycle phase ${record.phase} skipped because the workspace container is not running.`;
    default:
      return `Manifest lifecycle phase ${record.phase} skipped.`;
  }
}

function resolveDockerManifestLifecycleStepWorkingDirectory(
  runtimeManifest: SymphonyLoadedRuntimeManifest,
  workspacePath: string,
  stepCwd: string | undefined
): string {
  const relativePath =
    stepCwd ?? runtimeManifest.manifest.workspace.workingDirectory;
  const normalizedRelativePath =
    relativePath === "."
      ? ""
      : relativePath
          .split(path.sep)
          .filter((segment) => segment !== "")
          .join("/");

  return normalizedRelativePath === ""
    ? workspacePath
    : path.posix.join(workspacePath, normalizedRelativePath);
}

function manifestStepIncludesDependencyInstall(
  command: string,
  packageManager: SymphonyLoadedRuntimeManifest["manifest"]["workspace"]["packageManager"]
): boolean {
  switch (packageManager) {
    case "pnpm":
      return /\bpnpm\s+install\b/i.test(command);
    case "npm":
      return /\bnpm\s+(install|ci)\b/i.test(command);
    case "yarn":
      return /\byarn\s+install\b/i.test(command);
    case "bun":
      return /\bbun\s+install\b/i.test(command);
  }
}

function buildDockerWorkspaceDependencyInstallCommand(
  packageManager: SymphonyLoadedRuntimeManifest["manifest"]["workspace"]["packageManager"]
): string {
  switch (packageManager) {
    case "pnpm":
      return "corepack enable && pnpm install --frozen-lockfile";
    case "npm":
      return "npm install";
    case "yarn":
      return "corepack enable && yarn install --immutable";
    case "bun":
      return "bun install --frozen-lockfile";
  }
}

function buildDockerWorkspaceDependencyInstallScript(input: {
  workspacePath: string;
  workingDirectory: string;
  installCommand: string;
}): string {
  const quotedWorkspacePath = quoteDockerShellLiteral(input.workspacePath);
  const quotedWorkingDirectory = quoteDockerShellLiteral(input.workingDirectory);

  return [
    `install_cwd=${quotedWorkspacePath}`,
    `if [ ! -f "$install_cwd/package.json" ] && [ -f ${quotedWorkingDirectory}/package.json ]; then install_cwd=${quotedWorkingDirectory}; fi`,
    `if [ ! -f "$install_cwd/package.json" ]; then echo "No package.json found for workspace dependency install." >&2; exit 1; fi`,
    `cd "$install_cwd"`,
    input.installCommand
  ].join("; ");
}

function quoteDockerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function formatDockerWorkspaceDependencyInstallFailureReason(
  exitCode: number,
  stdout: string,
  stderr: string,
  env: Record<string, string>
): string {
  return [
    `Workspace dependency install failed with exit code ${exitCode}.`,
    sanitizeDockerManifestLifecycleOutput(stdout.trim(), env),
    sanitizeDockerManifestLifecycleOutput(stderr.trim(), env)
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildDockerManifestServiceLifetimeMarker(
  services: PreparedWorkspaceService[],
  workspaceLifetimeId: string
): string {
  if (services.length === 0) {
    return `workspace:${workspaceLifetimeId}`;
  }

  return createHash("sha256")
    .update(
      JSON.stringify(
        services
          .map((service) => ({
            key: service.key,
            containerId: service.containerId,
            containerName: service.containerName,
            hostname: service.hostname,
            port: service.port
          }))
          .sort((left, right) => left.key.localeCompare(right.key))
      )
    )
    .digest("hex");
}

function buildDockerManifestReadinessLifetimeMarker(input: {
  workspaceLifetimeId: string;
  serviceMarker: string;
  containerId: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceLifetimeId: input.workspaceLifetimeId,
        serviceMarker: input.serviceMarker,
        containerId: input.containerId
      })
    )
    .digest("hex");
}

function buildDockerManifestLifecycleStatePath(
  root: string,
  workspaceKey: string
): string {
  return path.join(
    path.resolve(root),
    dockerManifestLifecycleStateDirectoryName,
    `${workspaceKey}${dockerManifestLifecycleStateSuffix}`
  );
}

async function loadDockerManifestLifecycleState(
  statePath: string,
  reset: boolean
): Promise<DockerManifestLifecycleState> {
  if (reset) {
    const nextState = createDockerManifestLifecycleState();
    await persistDockerManifestLifecycleState(statePath, nextState);
    return nextState;
  }

  const existingState = await readDockerManifestLifecycleState(statePath);
  if (existingState) {
    return existingState;
  }

  const nextState = createDockerManifestLifecycleState();
  await persistDockerManifestLifecycleState(statePath, nextState);
  return nextState;
}

function createDockerManifestLifecycleState(): DockerManifestLifecycleState {
  return {
    schemaVersion: 1,
    workspaceLifetimeId: randomUUID(),
    completedMarkers: {}
  };
}

async function readDockerManifestLifecycleState(
  statePath: string
): Promise<DockerManifestLifecycleState | null> {
  try {
    const payload = await readFile(statePath, "utf8");
    const parsed = JSON.parse(payload);

    if (!isDockerManifestLifecycleState(parsed)) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }

    throw error;
  }
}

function isDockerManifestLifecycleState(
  value: unknown
): value is DockerManifestLifecycleState {
  const record = asRecord(value);
  const completedMarkers = asRecord(record?.completedMarkers);

  return (
    record?.schemaVersion === 1 &&
    typeof record.workspaceLifetimeId === "string" &&
    completedMarkers !== null &&
    Object.values(completedMarkers).every((entry) => typeof entry === "string")
  );
}

async function persistDockerManifestLifecycleState(
  statePath: string,
  state: DockerManifestLifecycleState
): Promise<void> {
  await mkdir(path.dirname(statePath), {
    recursive: true
  });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function removeDockerManifestLifecycleState(
  statePath: string
): Promise<void> {
  await rm(statePath, {
    force: true
  });
}

function formatDockerManifestLifecycleStepFailureReason(
  phase: WorkspaceManifestLifecyclePhase,
  stepName: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  env: Record<string, string>
): string {
  return [
    `Manifest lifecycle step ${phase}/${stepName} failed with exit code ${exitCode}.`,
    sanitizeDockerManifestLifecycleOutput(stdout.trim(), env),
    sanitizeDockerManifestLifecycleOutput(stderr.trim(), env)
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function sanitizeDockerManifestLifecycleOutput(
  value: string,
  env: Record<string, string>
): string {
  let sanitized = value;

  for (const [key, rawValue] of Object.entries(env)) {
    if (
      rawValue === "" ||
      !shouldRedactDockerEnvValue(key)
    ) {
      continue;
    }

    sanitized = sanitized.split(rawValue).join("<redacted>");
  }

  return sanitized;
}

function buildResolvedCleanupServices(
  descriptors: DockerServiceDescriptor[]
): Record<string, SymphonyResolvedRuntimeService> {
  return Object.fromEntries(
    descriptors.map((descriptor) => [
      descriptor.key,
      {
        type: "postgres",
        serviceKey: descriptor.key,
        host: descriptor.service.hostname,
        port: descriptor.service.port,
        database: descriptor.service.database,
        username: descriptor.service.username,
        password: descriptor.service.password,
        connectionString: buildSymphonyRuntimePostgresConnectionString({
          host: descriptor.service.hostname,
          port: descriptor.service.port,
          database: descriptor.service.database,
          username: descriptor.service.username,
          password: descriptor.service.password
        })
      } satisfies SymphonyResolvedRuntimeService
    ])
  );
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

    if (canReusePostgresService(existing, input.descriptor, input.networkName)) {
      container = existing.running
        ? existing
        : await startExistingDockerContainer({
            commandRunner: input.commandRunner,
            containerName: input.descriptor.containerName,
            timeoutMs: input.timeoutMs
          });
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

async function stopManagedServiceContainers(
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
      ? await stopDockerServiceContainer(commandRunner, descriptor, timeoutMs)
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
  hostFileMounts: DockerWorkspaceHostFileMount[];
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
      input.hostFileMounts,
      input.descriptor,
      input.networkName
    )
  ) {
    return {
      container: existing.running
        ? existing
        : await startExistingDockerContainer({
            commandRunner: input.commandRunner,
            containerName: input.descriptor.containerName,
            timeoutMs: input.timeoutMs
          }),
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
  hostFileMounts: DockerWorkspaceHostFileMount[];
  networkName: string | null;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const hostFileMountsHash = buildHostFileMountsHash(input.hostFileMounts);
  const labels = {
    ...buildManagedContainerLabels(input.descriptor, input.networkName),
    ...(input.hostFileMounts.length > 0
      ? {
          [managedHostFileMountsHashLabelKey]: hostFileMountsHash
        }
      : {})
  };
  const workspaceMount =
    input.descriptor.materialization.kind === bindMaterializationKind
      ? `type=bind,src=${input.descriptor.materialization.hostPath},dst=${input.workspacePath}`
      : `type=volume,src=${input.descriptor.materialization.volumeName},dst=${input.workspacePath}`;
  const hostFileMountArgs = input.hostFileMounts.flatMap((mount) => [
    "--mount",
    renderHostFileMount(mount)
  ]);
  const userFlags =
    input.descriptor.materialization.kind === bindMaterializationKind
      ? hostUserFlags()
      : [];
  const args = [
    "run",
    "-d",
    "--name",
    input.descriptor.containerName,
    "--tmpfs",
    `${defaultDockerHomePath}:exec,mode=0777`,
    "--mount",
    workspaceMount,
    "--workdir",
    input.workspacePath,
    "--env",
    `HOME=${defaultDockerHomePath}`,
    ...hostFileMountArgs,
    ...(input.networkName ? ["--network", input.networkName] : []),
    ...userFlags,
    ...dockerLabelFlags(labels),
    "--entrypoint",
    input.shell,
    input.image,
    "-lc",
    'mkdir -p "$HOME" "$HOME/.codex" "$HOME/.config" "$HOME/.local/share/opencode" && if command -v gh >/dev/null 2>&1; then gh auth setup-git >/dev/null 2>&1 || true; fi && while :; do sleep 3600; done'
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
    mounts:
      input.descriptor.materialization.kind === bindMaterializationKind
        ? [
            {
              type: "bind",
              source: input.descriptor.materialization.hostPath,
              destination: input.workspacePath,
              name: null
            },
            ...input.hostFileMounts.map((mount) => ({
              type: "bind",
              source: mount.sourcePath,
              destination: mount.containerPath,
              name: null
            }))
          ]
        : [
            {
              type: "volume",
              source: null,
              destination: input.workspacePath,
              name: input.descriptor.materialization.volumeName
            },
            ...input.hostFileMounts.map((mount) => ({
              type: "bind",
              source: mount.sourcePath,
              destination: mount.containerPath,
              name: null
            }))
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

async function stopDockerContainer(
  commandRunner: DockerWorkspaceCommandRunner,
  containerName: string,
  descriptor: DockerWorkspaceDescriptor,
  timeoutMs: number
): Promise<"missing" | "stopped"> {
  const existing = await inspectDockerContainer(commandRunner, containerName, timeoutMs);
  if (!existing) {
    return "missing";
  }

  assertManagedContainer(existing, descriptor);
  if (!existing.running) {
    return "stopped";
  }

  const args = ["stop", containerName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0 && !isDockerMissingObject(result.stderr)) {
    throw dockerCommandError("stop", args, result);
  }

  return "stopped";
}

async function startExistingDockerContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  containerName: string;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const args = ["start", input.containerName];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw dockerCommandError("start", args, result);
  }

  const started = await inspectDockerContainer(
    input.commandRunner,
    input.containerName,
    input.timeoutMs
  );
  if (!started?.running) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_start_failed",
      `Docker container ${input.containerName} did not start successfully.`
    );
  }

  return started;
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

async function stopDockerServiceContainer(
  commandRunner: DockerWorkspaceCommandRunner,
  descriptor: DockerServiceDescriptor,
  timeoutMs: number
): Promise<"missing" | "stopped"> {
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

  if (!existing.running) {
    return "stopped";
  }

  const args = ["stop", descriptor.containerName];
  const result = await commandRunner({
    args,
    timeoutMs
  });

  if (result.exitCode !== 0 && !isDockerMissingObject(result.stderr)) {
    throw dockerCommandError("stop", args, result);
  }

  return "stopped";
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
  hostFileMounts: DockerWorkspaceHostFileMount[],
  descriptor: DockerWorkspaceDescriptor,
  networkName: string | null
): Promise<boolean> {
  return (
    container.image === image &&
    (hostFileMounts.length === 0 ||
      container.labels[managedHostFileMountsHashLabelKey] ===
        buildHostFileMountsHash(hostFileMounts)) &&
    (!networkName || containerAttachedToNetwork(container, networkName)) &&
    (descriptor.materialization.kind === bindMaterializationKind
      ? await containerHasExpectedBindMount(
          container,
          workspacePath,
          descriptor.materialization.hostPath
        )
      : containerHasExpectedVolumeMount(
          container,
          workspacePath,
          descriptor.materialization.volumeName
        ))
  );
}

function canReusePostgresService(
  container: DockerContainerInspectState,
  descriptor: DockerServiceDescriptor,
  networkName: string
): boolean {
  const resources = resolvePostgresResourceLimits(descriptor.service);

  return (
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

function normalizeDockerWorkspaceHostFileMounts(
  mounts: DockerWorkspaceBackendOptions["hostFileMounts"]
): DockerWorkspaceHostFileMount[] {
  const normalizedMounts: Array<DockerWorkspaceHostFileMount | null> = (mounts ?? []).map(
    (mount) => {
      const sourcePath = normalizeNonEmptyString(mount.sourcePath);
      const containerPath = normalizeNonEmptyString(mount.containerPath);

      if (!sourcePath || !containerPath) {
        return null;
      }

      return {
        sourcePath,
        containerPath,
        readOnly: mount.readOnly ?? true
      };
    }
  );

  return normalizedMounts
    .filter((mount): mount is DockerWorkspaceHostFileMount => mount !== null);
}

function buildHostFileMountsHash(
  mounts: readonly DockerWorkspaceHostFileMount[]
): string {
  return createHash("sha256")
    .update(JSON.stringify(mounts))
    .digest("hex");
}

function renderHostFileMount(mount: DockerWorkspaceHostFileMount): string {
  return [
    "type=bind",
    `src=${mount.sourcePath}`,
    `dst=${mount.containerPath}`,
    ...(mount.readOnly === false ? [] : ["readonly"])
  ].join(",");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function requireDockerContainerName(workspace: PreparedWorkspace): string {
  const target = requireDockerExecutionTarget(workspace);

  if (target.containerName) {
    return target.containerName;
  }

  throw new TypeError("Docker prepared workspaces require a container name.");
}
