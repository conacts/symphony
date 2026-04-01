import {
  createLocalSymphonyWorkspaceManager,
  type SymphonyWorkspaceContext
} from "./local-symphony-workspace-manager.js";
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
  executionTarget: WorkspaceExecutionTarget;
  materialization: WorkspaceMaterializationMetadata;
  path: string | null;
  created: boolean;
  workerHost: string | null;
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
  prepareWorkspace(input: WorkspacePrepareInput): Promise<PreparedWorkspace>;
  runBeforeRun(input: WorkspaceHookInput): Promise<void>;
  runAfterRun(input: WorkspaceHookInput): Promise<void>;
  cleanupWorkspace(input: WorkspaceCleanupInput): Promise<void>;
}

export function createLocalWorkspaceBackend(
  options: Parameters<typeof createLocalSymphonyWorkspaceManager>[0] = {}
): WorkspaceBackend {
  const manager = createLocalSymphonyWorkspaceManager(options);

  return {
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
    },

    async runAfterRun(input) {
      await manager.runAfterRunHook(
        requireLocalWorkspacePath(input.workspace),
        input.context,
        input.hooks,
        {
          env: input.env,
          workerHost: input.workerHost
        }
      );
    },

    async cleanupWorkspace(input) {
      await manager.removeIssueWorkspace(
        input.issueIdentifier,
        input.config,
        input.hooks,
        {
          env: input.env,
          workerHost: input.workerHost
        }
      );
    }
  };
}

function requireLocalWorkspacePath(workspace: PreparedWorkspace): string {
  if (workspace.executionTarget.kind === "host_path") {
    return workspace.executionTarget.path;
  }

  throw new TypeError(
    "Local workspace backends require a host-path execution target."
  );
}
