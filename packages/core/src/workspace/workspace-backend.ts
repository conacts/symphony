import {
  createLocalSymphonyWorkspaceManager,
  type SymphonyWorkspaceContext
} from "./local-symphony-workspace-manager.js";
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
export type WorkspaceHookKind = "after_create" | "before_run" | "after_run" | "before_remove";
export type WorkspaceHookOutcome = "skipped" | "completed" | "failed_ignored";
export type WorkspaceCleanupContainerDisposition =
  | "removed"
  | "missing"
  | "not_applicable";
export type WorkspaceRemovalDisposition = "removed" | "missing";

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
  afterCreateHookOutcome: Extract<WorkspaceHookOutcome, "skipped" | "completed">;
  executionTarget: WorkspaceExecutionTarget;
  materialization: WorkspaceMaterializationMetadata;
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
  afterCreateHookOutcome: Extract<WorkspaceHookOutcome, "skipped" | "completed">;
  hostPath: string | null;
  runtimePath: string | null;
  containerId: string | null;
  containerName: string | null;
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
  options: Parameters<typeof createLocalSymphonyWorkspaceManager>[0] = {}
): WorkspaceBackend {
  const manager = createLocalSymphonyWorkspaceManager(options);

  return {
    kind: "local",
    async prepareWorkspace(input) {
      const workspace = await manager.createForIssue(
        input.context,
        input.config,
        input.hooks,
        {
          env: input.env,
          workerHost: input.workerHost
        }
      );

      return {
        issueIdentifier: workspace.issueIdentifier,
        workspaceKey: workspace.workspaceKey,
        backendKind: "local",
        prepareDisposition: workspace.created ? "created" : "reused",
        containerDisposition: "not_applicable",
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
          env: input.env,
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
            env: input.env,
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
          env: input.env,
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
