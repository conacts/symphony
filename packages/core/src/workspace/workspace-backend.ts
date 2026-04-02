import {
  createLocalSymphonyWorkspaceManager,
  type SymphonyWorkspaceContext
} from "./local-symphony-workspace-manager.js";
import {
  resolveSymphonyRuntimeEnvBundle,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyResolvedRuntimeService
} from "../runtime-manifest.js";
export {
  createDockerWorkspaceBackend,
  type DockerWorkspaceBackendOptions,
  type DockerWorkspaceCommandResult,
  type DockerWorkspaceCommandRunner
} from "./docker-workspace-backend.js";
import type {
  SymphonyWorkflowHooksConfig,
  SymphonyWorkflowWorkspaceConfig
} from "../workflow/symphony-workflow.js";

export type WorkspaceContext = SymphonyWorkspaceContext;

export type WorkspaceBackendRunnerOptions = {
  env?: Record<string, string | undefined>;
  workerHost?: string | null;
};

export type WorkspacePrepareInput = {
  context: WorkspaceContext;
  runId?: string | null;
  config: SymphonyWorkflowWorkspaceConfig;
  hooks: SymphonyWorkflowHooksConfig;
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
  path: string | null;
};

export type WorkspaceHookInput = {
  workspace: PreparedWorkspace;
  context: WorkspaceContext;
  hooks: SymphonyWorkflowHooksConfig;
} & WorkspaceBackendRunnerOptions;

export type WorkspaceCleanupInput = {
  issueIdentifier: string;
  config: SymphonyWorkflowWorkspaceConfig;
  hooks: SymphonyWorkflowHooksConfig;
  workspace?: PreparedWorkspace | null;
} & WorkspaceBackendRunnerOptions;

export interface WorkspaceBackend {
  readonly kind: WorkspaceBackendKind;
  prepareWorkspace(input: WorkspacePrepareInput): Promise<PreparedWorkspace>;
  runBeforeRun(input: WorkspaceHookInput): Promise<WorkspaceHookResult>;
  runAfterRun(input: WorkspaceHookInput): Promise<WorkspaceHookResult>;
  cleanupWorkspace(input: WorkspaceCleanupInput): Promise<WorkspaceCleanupResult>;
}

export function createLocalWorkspaceBackend(
  options: (Parameters<typeof createLocalSymphonyWorkspaceManager>[0] & {
    runtimeManifest?: SymphonyLoadedRuntimeManifest | null;
  }) = {}
): WorkspaceBackend {
  const manager = createLocalSymphonyWorkspaceManager(options);

  return {
    kind: "local",
    async prepareWorkspace(input) {
      const workspace = await manager.createForIssue(
        input.context,
        input.config,
        {
          ...input.hooks,
          afterCreate: null
        },
        {
          env: input.env,
          workerHost: input.workerHost
        }
      );
      const envBundle = resolvePreparedWorkspaceEnvBundle({
        runtimeManifest: options.runtimeManifest ?? null,
        environmentSource: input.env,
        issueIdentifier: workspace.issueIdentifier,
        workspaceKey: workspace.workspaceKey,
        backendKind: "local",
        workspacePath: workspace.path,
        issueId: input.context.issueId,
        runId: input.runId ?? null,
        services: {}
      });

      if (workspace.created && input.hooks.afterCreate) {
        await manager.runBeforeRunHook(
          workspace.path,
          input.context,
          {
            ...input.hooks,
            beforeRun: input.hooks.afterCreate
          },
          {
            env: envBundle.values,
            workerHost: input.workerHost
          }
        );
      }

      return {
        issueIdentifier: workspace.issueIdentifier,
        workspaceKey: workspace.workspaceKey,
        backendKind: "local",
        prepareDisposition: workspace.created ? "created" : "reused",
        containerDisposition: "not_applicable",
        networkDisposition: "not_applicable",
        afterCreateHookOutcome:
          workspace.created && input.hooks.afterCreate ? "completed" : "skipped",
        executionTarget: {
          kind: "host_path",
          path: workspace.path
        },
        materialization: {
          kind: "directory",
          hostPath: workspace.path
        },
        networkName: null,
        services: [],
        envBundle,
        path: workspace.path,
        created: workspace.created,
        workerHost: workspace.workerHost
      };
    },

    async runBeforeRun(input) {
      await manager.runBeforeRunHook(
        requireLocalWorkspacePath(input.workspace),
        input.context,
        input.hooks,
        {
          env: workspaceEnvForHooks(input.workspace, input.env),
          workerHost: input.workerHost
        }
      );

      return {
        hookKind: "before_run",
        outcome: input.hooks.beforeRun ? "completed" : "skipped"
      };
    },

    async runAfterRun(input) {
      return {
        hookKind: "after_run",
        outcome: await manager.runAfterRunHook(
          requireLocalWorkspacePath(input.workspace),
          input.context,
          input.hooks,
          {
            env: workspaceEnvForHooks(input.workspace, input.env),
            workerHost: input.workerHost
          }
        )
      };
    },

    async cleanupWorkspace(input) {
      const cleanup = await manager.removeIssueWorkspace(
        input.issueIdentifier,
        input.config,
        input.hooks,
        {
          env: workspaceEnvForCleanup(input.workspace, input.env),
          workerHost: input.workerHost
        }
      );

      return {
        backendKind: "local",
        workerHost: input.workerHost ?? null,
        hostPath: cleanup.path,
        runtimePath: cleanup.path,
        containerId: null,
        containerName: null,
        networkName: null,
        networkRemovalDisposition: "not_applicable",
        serviceCleanup: [],
        beforeRemoveHookOutcome: cleanup.beforeRemoveHookOutcome,
        workspaceRemovalDisposition: cleanup.workspaceRemovalDisposition,
        containerRemovalDisposition: "not_applicable"
      };
    }
  };
}

export function summarizePreparedWorkspace(
  workspace: PreparedWorkspace | null
): WorkspaceLifecycleMetadata | null {
  if (!workspace) {
    return null;
  }

  return {
    issueIdentifier: workspace.issueIdentifier,
    workspaceKey: workspace.workspaceKey,
    backendKind: workspace.backendKind,
    workerHost: workspace.workerHost,
    executionTargetKind: workspace.executionTarget.kind,
    materializationKind: workspace.materialization.kind,
    prepareDisposition: workspace.prepareDisposition,
    containerDisposition: workspace.containerDisposition,
    networkDisposition: workspace.networkDisposition,
    afterCreateHookOutcome: workspace.afterCreateHookOutcome,
    hostPath: workspaceHostPath(workspace),
    runtimePath: workspaceRuntimePath(workspace),
    containerId:
      workspace.executionTarget.kind === "container"
        ? workspace.executionTarget.containerId
        : null,
    containerName:
      workspace.executionTarget.kind === "container"
        ? workspace.executionTarget.containerName
        : null,
    networkName: workspace.networkName,
    services: workspace.services,
    envBundleSummary: workspace.envBundle.summary,
    path: workspace.path
  };
}

export function workspaceHostPath(workspace: PreparedWorkspace | null): string | null {
  if (!workspace) {
    return null;
  }

  if (workspace.executionTarget.kind === "host_path") {
    return workspace.executionTarget.path;
  }

  if (workspace.executionTarget.hostPath) {
    return workspace.executionTarget.hostPath;
  }

  switch (workspace.materialization.kind) {
    case "directory":
      return workspace.materialization.hostPath;
    case "bind_mount":
      return workspace.materialization.hostPath;
    case "volume":
      return workspace.materialization.hostPath;
  }
}

export function workspaceRuntimePath(workspace: PreparedWorkspace | null): string | null {
  if (!workspace) {
    return null;
  }

  if (workspace.executionTarget.kind === "host_path") {
    return workspace.executionTarget.path;
  }

  return workspace.executionTarget.workspacePath;
}

function requireLocalWorkspacePath(workspace: PreparedWorkspace): string {
  if (workspace.executionTarget.kind === "host_path") {
    return workspace.executionTarget.path;
  }

  throw new TypeError(
    "Local workspace backends require a host-path execution target."
  );
}

function resolvePreparedWorkspaceEnvBundle(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest | null;
  environmentSource: Record<string, string | undefined> | undefined;
  issueIdentifier: string;
  workspaceKey: string;
  backendKind: WorkspaceBackendKind;
  workspacePath: string;
  issueId: string | null;
  runId: string | null;
  services: Record<string, SymphonyResolvedRuntimeService>;
}): WorkspaceEnvBundle {
  if (!input.runtimeManifest) {
    return buildAmbientWorkspaceEnvBundle(input.environmentSource);
  }

  if (
    input.backendKind === "local" &&
    manifestInjectsProvisionedServiceBindings(input.runtimeManifest)
  ) {
    return buildAmbientWorkspaceEnvBundle(input.environmentSource);
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
      backendKind: input.backendKind
    },
    services: input.services,
    manifestPath: input.runtimeManifest.manifestPath
  });
}

function manifestInjectsProvisionedServiceBindings(
  runtimeManifest: SymphonyLoadedRuntimeManifest
): boolean {
  return Object.values(runtimeManifest.manifest.env.inject).some(
    (binding) => binding.kind === "service"
  );
}

function buildAmbientWorkspaceEnvBundle(
  environmentSource: Record<string, string | undefined> | undefined
): WorkspaceEnvBundle {
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

function workspaceEnvForHooks(
  workspace: PreparedWorkspace,
  fallbackEnv: Record<string, string | undefined> | undefined
): Record<string, string | undefined> {
  return workspace.envBundle.values ?? fallbackEnv;
}

function workspaceEnvForCleanup(
  workspace: PreparedWorkspace | null | undefined,
  fallbackEnv: Record<string, string | undefined> | undefined
): Record<string, string | undefined> | undefined {
  return workspace?.envBundle.values ?? fallbackEnv;
}
