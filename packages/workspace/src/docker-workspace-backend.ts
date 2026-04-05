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
  containerHasExpectedBindMount,
  containerHasExpectedVolumeMount,
  inspectDockerContainer
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
  buildDockerVolumeName,
  buildManagedContainerLabels,
  bindMaterializationKind,
  defaultContainerSourceRepoPath,
  defaultContainerWorkspacePath,
  defaultDockerHomePath,
  defaultPostgresReadinessIntervalMs,
  defaultPostgresReadinessRetries,
  defaultPostgresReadinessTimeoutMs,
  dockerManifestLifecycleStateDirectoryName,
  dockerManifestLifecycleStateSuffix,
  managedBackendLabelKey,
  managedBackendLabelValue,
  managedKindLabelKey,
  managedServiceTypeLabelKey,
  managedServicePortLabelKey,
  managedSharedServiceKind,
  managedHostFileMountsHashLabelKey,
  normalizeContainerPrefix,
  normalizeNonEmptyString,
  volumeMaterializationKind,
  type DockerContainerInspectState,
  type DockerWorkspaceHostFileMount,
  type DockerManifestLifecyclePhasePlan,
  type DockerManifestLifecycleState,
  type DockerWorkspaceMaterializationDescriptor,
  type DockerWorkspaceMaterializationMode,
  type DockerPostgresProvision,
  type DockerSharedPostgresOptions,
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
  const sharedPostgres = options.sharedPostgres ?? null;
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
      const services = runtimeManifest
        ? await ensureManagedPostgresServices({
            runtimeManifest,
            descriptor,
            sharedPostgres,
            commandRunner,
            timeoutMs
          })
        : {
            summaries: [],
            connections: {},
            initServices: [],
            requiresHostGateway: false
          };
      const container = await ensureManagedContainer({
        descriptor,
        image,
        workspacePath,
        shell,
        hostFileMounts,
        addHostGateway: services.requiresHostGateway,
        networkName: null,
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
          service: service.descriptor,
          localConnection: service.localConnection,
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
        networkDisposition: "not_applicable",
        networkName: null,
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
        input.workspace,
        sharedPostgres
      );
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
            timeoutMs,
            sharedPostgres
          )
        : await removeManagedServiceContainers(
            commandRunner,
            serviceDescriptors,
            timeoutMs,
            sharedPostgres
          );
      const networkRemovalDisposition = "not_applicable";
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
        networkName: null,
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
    networkName: null,
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
    networkName: workspace?.networkName ?? null,
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

async function ensureManagedPostgresServices(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  descriptor: DockerWorkspaceDescriptor;
  sharedPostgres: DockerSharedPostgresOptions | null;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<{
  summaries: PreparedWorkspaceService[];
  connections: Record<string, SymphonyResolvedRuntimeService>;
  initServices: Array<{
    descriptor: DockerServiceDescriptor;
    localConnection: {
      host: string;
      port: number;
    } | null;
  }>;
  requiresHostGateway: boolean;
}> {
  const descriptors = buildDockerServiceDescriptors(
    input.runtimeManifest,
    input.descriptor,
    input.sharedPostgres
  );
  const summaries: PreparedWorkspaceService[] = [];
  const connections: Record<string, SymphonyResolvedRuntimeService> = {};
  const initServices: Array<{
    descriptor: DockerServiceDescriptor;
    localConnection: {
      host: string;
      port: number;
    } | null;
  }> = [];

  if (descriptors.length === 0) {
    return {
      summaries,
      connections,
      initServices,
      requiresHostGateway: false
    };
  }

  if (!input.sharedPostgres) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_shared_postgres_required",
      "Docker workspace manifests that declare Postgres services require shared Postgres backend configuration."
    );
  }

  const container = await ensureSharedPostgresContainer({
    sharedPostgres: input.sharedPostgres,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  await waitForSharedPostgresReadiness({
    sharedPostgres: input.sharedPostgres,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  for (const descriptor of descriptors) {
    const provision = await ensureSharedPostgresDatabase({
      runtimeManifest: input.runtimeManifest,
      descriptor,
      sharedPostgres: input.sharedPostgres,
      sharedContainerId: container.id,
      commandRunner: input.commandRunner,
      timeoutMs: input.timeoutMs
    });

    summaries.push(provision.summary);
    connections[descriptor.key] = provision.connection;

    if (provision.initRequired) {
      initServices.push({
        descriptor,
        localConnection: {
          host: "127.0.0.1",
          port: input.sharedPostgres.containerPort
        }
      });
    }
  }

  return {
    summaries,
    connections,
    initServices,
    requiresHostGateway: true
  };
}

function buildDockerServiceDescriptors(
  runtimeManifest: SymphonyLoadedRuntimeManifest,
  descriptor: DockerWorkspaceDescriptor,
  sharedPostgres: DockerSharedPostgresOptions | null
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
      service: {
        ...service,
        image: sharedPostgres?.image ?? service.image,
        hostname: sharedPostgres?.host ?? service.hostname,
        port: sharedPostgres?.hostPort ?? service.port,
        database: sharedPostgres
          ? deriveSharedPostgresDatabaseName({
              runtimeManifest,
              serviceKey: key,
              workspaceKey: descriptor.workspaceKey,
              prefix: sharedPostgres.databasePrefix
            })
          : service.database
      },
      containerName: sharedPostgres?.containerName ?? key
    };
  });
}

async function ensureSharedPostgresContainer(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerContainerInspectState> {
  const existing = await inspectDockerContainer(
    input.commandRunner,
    input.sharedPostgres.containerName,
    input.timeoutMs
  );

  if (existing) {
    assertManagedSharedPostgresContainer(existing, input.sharedPostgres);

    if (canReuseSharedPostgresContainer(existing, input.sharedPostgres)) {
      return existing.running
        ? existing
        : await startExistingDockerContainer({
            commandRunner: input.commandRunner,
            containerName: input.sharedPostgres.containerName,
            timeoutMs: input.timeoutMs
          });
    }

    const removeResult = await input.commandRunner({
      args: ["rm", "-f", input.sharedPostgres.containerName],
      timeoutMs: input.timeoutMs
    });
    if (removeResult.exitCode !== 0 && !isDockerMissingObject(removeResult.stderr)) {
      throw dockerCommandError("rm", ["rm", "-f", input.sharedPostgres.containerName], removeResult);
    }
  }

  const labels = buildManagedSharedPostgresLabels(input.sharedPostgres);
  const adminEnv = {
    POSTGRES_DB: input.sharedPostgres.adminDatabase,
    POSTGRES_USER: input.sharedPostgres.adminUsername,
    POSTGRES_PASSWORD: input.sharedPostgres.adminPassword
  };
  const args = [
    "run",
    "-d",
    "--name",
    input.sharedPostgres.containerName,
    "--publish",
    `${input.sharedPostgres.hostPort}:${input.sharedPostgres.containerPort}`,
    ...dockerLabelFlags(labels),
    ...dockerEnvFlags(adminEnv),
    input.sharedPostgres.image,
    "postgres",
    "-p",
    String(input.sharedPostgres.containerPort)
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
      `Docker run did not return a container id for ${input.sharedPostgres.containerName}.`
    );
  }

  return {
    id: containerId,
    name: input.sharedPostgres.containerName,
    image: input.sharedPostgres.image,
    running: true,
    status: "running",
    labels,
    env: adminEnv,
    mounts: [],
    networks: {}
  };
}

function buildManagedSharedPostgresLabels(
  sharedPostgres: DockerSharedPostgresOptions
): Record<string, string> {
  return {
    [managedBackendLabelKey]: managedBackendLabelValue,
    [managedKindLabelKey]: managedSharedServiceKind,
    [managedServiceTypeLabelKey]: "postgres",
    [managedServicePortLabelKey]: String(sharedPostgres.containerPort)
  };
}

function assertManagedSharedPostgresContainer(
  container: DockerContainerInspectState,
  sharedPostgres: DockerSharedPostgresOptions
): void {
  if (container.labels[managedBackendLabelKey] !== managedBackendLabelValue) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${sharedPostgres.containerName} exists but is not managed by Symphony.`
    );
  }

  if (container.labels[managedKindLabelKey] !== managedSharedServiceKind) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_name_conflict",
      `Docker container ${sharedPostgres.containerName} is not a managed shared Symphony Postgres container.`
    );
  }
}

function canReuseSharedPostgresContainer(
  container: DockerContainerInspectState,
  sharedPostgres: DockerSharedPostgresOptions
): boolean {
  return (
    container.image === sharedPostgres.image &&
    container.env.POSTGRES_DB === sharedPostgres.adminDatabase &&
    container.env.POSTGRES_USER === sharedPostgres.adminUsername &&
    container.env.POSTGRES_PASSWORD === sharedPostgres.adminPassword &&
    container.labels[managedServicePortLabelKey] ===
      String(sharedPostgres.containerPort)
  );
}

async function ensureSharedPostgresDatabase(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  descriptor: DockerServiceDescriptor;
  sharedPostgres: DockerSharedPostgresOptions;
  sharedContainerId: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<DockerPostgresProvision> {
  await ensureSharedPostgresRole({
    sharedPostgres: input.sharedPostgres,
    username: input.descriptor.service.username,
    password: input.descriptor.service.password,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  const created = await ensureSharedPostgresDatabaseExists({
    sharedPostgres: input.sharedPostgres,
    database: input.descriptor.service.database,
    owner: input.descriptor.service.username,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  return {
    summary: {
      key: input.descriptor.key,
      type: "postgres",
      hostname: input.descriptor.service.hostname,
      port: input.descriptor.service.port,
      containerId: input.sharedContainerId,
      containerName: input.sharedPostgres.containerName,
      disposition: created ? "created" : "reused"
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
    initRequired: created && input.descriptor.service.init.length > 0
  };
}

async function waitForSharedPostgresReadiness(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<void> {
  const descriptor: DockerServiceDescriptor = {
    issueIdentifier: "shared",
    workspaceKey: "shared",
    key: "postgres",
    containerName: input.sharedPostgres.containerName,
    service: {
      type: "postgres",
      image: input.sharedPostgres.image,
      hostname: "127.0.0.1",
      port: input.sharedPostgres.containerPort,
      database: input.sharedPostgres.adminDatabase,
      username: input.sharedPostgres.adminUsername,
      password: input.sharedPostgres.adminPassword,
      init: []
    }
  };

  await waitForManagedPostgresReadiness({
    commandRunner: input.commandRunner,
    descriptor,
    timeoutMs: input.timeoutMs
  });
}

async function ensureSharedPostgresRole(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  username: string;
  password: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<void> {
  const quotedRole = quoteSqlIdentifier(input.username);
  const quotedPassword = quoteSqlLiteral(input.password);
  await runSharedPostgresAdminCommand({
    sharedPostgres: input.sharedPostgres,
    sql: [
      `DO $$`,
      `BEGIN`,
      `  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteSqlLiteral(input.username)}) THEN`,
      `    EXECUTE 'CREATE ROLE ${quotedRole} LOGIN PASSWORD ${quotedPassword}';`,
      `  ELSE`,
      `    EXECUTE 'ALTER ROLE ${quotedRole} WITH LOGIN PASSWORD ${quotedPassword}';`,
      `  END IF;`,
      `END`,
      `$$;`
    ].join("\n"),
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });
}

async function ensureSharedPostgresDatabaseExists(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  database: string;
  owner: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<boolean> {
  const exists = await runSharedPostgresAdminQuery({
    sharedPostgres: input.sharedPostgres,
    sql: `SELECT 1 FROM pg_database WHERE datname = ${quoteSqlLiteral(input.database)};`,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  if (exists.trim() === "1") {
    return false;
  }

  await runSharedPostgresAdminCommand({
    sharedPostgres: input.sharedPostgres,
    sql: `CREATE DATABASE ${quoteSqlIdentifier(input.database)} OWNER ${quoteSqlIdentifier(input.owner)};`,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  return true;
}

async function runManagedPostgresInitSteps(input: {
  service: DockerServiceDescriptor;
  localConnection: {
    host: string;
    port: number;
  } | null;
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

    const execEnv = input.localConnection
      ? {
          ...input.env,
          DATABASE_URL: buildSymphonyRuntimePostgresConnectionString({
            host: input.localConnection.host,
            port: input.localConnection.port,
            database: input.service.service.database,
            username: input.service.service.username,
            password: input.service.service.password
          }),
          PGHOST: input.localConnection.host,
          PGPORT: String(input.localConnection.port),
          PGDATABASE: input.service.service.database,
          PGUSER: input.service.service.username,
          PGPASSWORD: input.service.service.password
        }
      : input.env;
    const args = [
      "exec",
      ...dockerEnvFlags(execEnv),
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
  workspace: PreparedWorkspace | null | undefined,
  sharedPostgres: DockerSharedPostgresOptions | null
): DockerServiceDescriptor[] {
  if (runtimeManifest) {
    return buildDockerServiceDescriptors(runtimeManifest, descriptor, sharedPostgres);
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
  timeoutMs: number,
  sharedPostgres: DockerSharedPostgresOptions | null
): Promise<WorkspaceCleanupService[]> {
  const cleanup: WorkspaceCleanupService[] = [];

  for (const descriptor of descriptors) {
    if (!sharedPostgres) {
      throw new SymphonyWorkspaceError(
        "workspace_docker_shared_postgres_required",
        "Docker workspace manifests that declare Postgres services require shared Postgres backend configuration."
      );
    }
    const existing = await inspectDockerContainer(
      commandRunner,
      descriptor.containerName,
      timeoutMs
    );
    const removalDisposition = await dropSharedPostgresDatabase({
      sharedPostgres,
      database: descriptor.service.database,
      commandRunner,
      timeoutMs
    });

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
  timeoutMs: number,
  sharedPostgres: DockerSharedPostgresOptions | null
): Promise<WorkspaceCleanupService[]> {
  const cleanup: WorkspaceCleanupService[] = [];

  for (const descriptor of descriptors) {
    if (!sharedPostgres) {
      throw new SymphonyWorkspaceError(
        "workspace_docker_shared_postgres_required",
        "Docker workspace manifests that declare Postgres services require shared Postgres backend configuration."
      );
    }
    const existing = await inspectDockerContainer(
      commandRunner,
      descriptor.containerName,
      timeoutMs
    );

    cleanup.push({
      key: descriptor.key,
      type: "postgres",
      containerId: existing?.id ?? null,
      containerName: descriptor.containerName,
      removalDisposition: "preserved"
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
  addHostGateway: boolean;
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
      input.descriptor
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
  addHostGateway: boolean;
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
    ...(input.addHostGateway
      ? ["--add-host", "host.docker.internal:host-gateway"]
      : []),
    ...hostFileMountArgs,
    ...(input.networkName ? ["--network", input.networkName] : []),
    ...userFlags,
    ...dockerLabelFlags(labels),
    "--entrypoint",
    input.shell,
    input.image,
    "-lc",
    'mkdir -p "$HOME" "$HOME/.codex" "$HOME/.config" "$HOME/.local/share/opencode" "$HOME/.pi/agent" && if command -v gh >/dev/null 2>&1; then gh auth setup-git >/dev/null 2>&1 || true; fi && while :; do sleep 3600; done'
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
  descriptor: DockerWorkspaceDescriptor
): Promise<boolean> {
  return (
    container.image === image &&
    (hostFileMounts.length === 0 ||
      container.labels[managedHostFileMountsHashLabelKey] ===
        buildHostFileMountsHash(hostFileMounts)) &&
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

async function dropSharedPostgresDatabase(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  database: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<"removed" | "missing"> {
  const exists = await runSharedPostgresAdminQuery({
    sharedPostgres: input.sharedPostgres,
    sql: `SELECT 1 FROM pg_database WHERE datname = ${quoteSqlLiteral(input.database)};`,
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  if (exists.trim() !== "1") {
    return "missing";
  }

  await runSharedPostgresAdminCommand({
    sharedPostgres: input.sharedPostgres,
    sql: [
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quoteSqlLiteral(input.database)} AND pid <> pg_backend_pid();`,
      `DROP DATABASE ${quoteSqlIdentifier(input.database)};`
    ].join("\n"),
    commandRunner: input.commandRunner,
    timeoutMs: input.timeoutMs
  });

  return "removed";
}

async function runSharedPostgresAdminQuery(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  sql: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<string> {
  const result = await input.commandRunner({
    args: [
      "exec",
      "--env",
      `PGPASSWORD=${input.sharedPostgres.adminPassword}`,
      input.sharedPostgres.containerName,
      "sh",
      "-lc",
      buildSharedPostgresAdminPsqlCommand(input.sharedPostgres, input.sql, true)
    ],
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_shared_postgres_query_failed",
      [
        `Shared Postgres query failed for ${input.sharedPostgres.containerName}.`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }

  return result.stdout.trim();
}

async function runSharedPostgresAdminCommand(input: {
  sharedPostgres: DockerSharedPostgresOptions;
  sql: string;
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
}): Promise<void> {
  const result = await input.commandRunner({
    args: [
      "exec",
      "--env",
      `PGPASSWORD=${input.sharedPostgres.adminPassword}`,
      input.sharedPostgres.containerName,
      "sh",
      "-lc",
      buildSharedPostgresAdminPsqlCommand(input.sharedPostgres, input.sql, false)
    ],
    timeoutMs: input.timeoutMs
  });

  if (result.exitCode !== 0) {
    throw new SymphonyWorkspaceError(
      "workspace_docker_shared_postgres_command_failed",
      [
        `Shared Postgres command failed for ${input.sharedPostgres.containerName}.`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter((line) => line !== "")
        .join("\n")
    );
  }
}

function buildSharedPostgresAdminPsqlCommand(
  sharedPostgres: DockerSharedPostgresOptions,
  sql: string,
  tuplesOnly: boolean
): string {
  const flags = tuplesOnly ? "-tA" : "";
  return [
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    flags,
    "-h",
    "127.0.0.1",
    "-p",
    String(sharedPostgres.containerPort),
    "-U",
    shellQuote(sharedPostgres.adminUsername),
    "-d",
    shellQuote(sharedPostgres.adminDatabase),
    "-c",
    shellQuote(sql)
  ]
    .filter((part) => part !== "")
    .join(" ");
}

function deriveSharedPostgresDatabaseName(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest;
  serviceKey: string;
  workspaceKey: string;
  prefix: string | undefined;
}): string {
  return buildSharedPostgresIdentifier({
    prefix: input.prefix ?? "symphony",
    readableParts: [input.serviceKey, input.workspaceKey],
    uniquenessParts: [
      input.runtimeManifest.repoRoot,
      input.serviceKey,
      input.workspaceKey
    ],
    maxLength: 63
  });
}

function buildSharedPostgresIdentifier(input: {
  prefix: string;
  readableParts: string[];
  uniquenessParts: string[];
  maxLength: number;
}): string {
  const readable = input.readableParts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const prefix = input.prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = createHash("sha256")
    .update(JSON.stringify(input.uniquenessParts))
    .digest("hex")
    .slice(0, 10);
  const reserved = suffix.length + 2;
  const baseLength = Math.max(1, input.maxLength - reserved);
  const base = `${prefix}_${readable || "db"}`.slice(0, baseLength).replace(/_+$/g, "");
  return `${base}_${suffix}`;
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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
