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

export type PreparedWorkspace = {
  issueIdentifier: string;
  workspaceKey: string;
  path: string;
  created: boolean;
  workerHost: string | null;
};

export type WorkspaceHookInput = {
  workspacePath: string;
  context: WorkspaceContext;
  hooks: SymphonyWorkflowHooksConfig;
} & WorkspaceBackendRunnerOptions;

export type WorkspaceCleanupInput = {
  issueIdentifier: string;
  config: SymphonyWorkflowWorkspaceConfig;
  hooks: SymphonyWorkflowHooksConfig;
} & WorkspaceBackendRunnerOptions;

export type WorkspacePathInput = {
  issueIdentifier: string;
  config: SymphonyWorkflowWorkspaceConfig;
};

export interface WorkspaceBackend {
  prepareWorkspace(input: WorkspacePrepareInput): Promise<PreparedWorkspace>;
  runBeforeRun(input: WorkspaceHookInput): Promise<void>;
  runAfterRun(input: WorkspaceHookInput): Promise<void>;
  cleanupWorkspace(input: WorkspaceCleanupInput): Promise<void>;
  getWorkspacePath(input: WorkspacePathInput): string;
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
        path: workspace.path,
        created: workspace.created,
        workerHost: workspace.workerHost
      };
    },

    async runBeforeRun(input) {
      await manager.runBeforeRunHook(
        input.workspacePath,
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
        input.workspacePath,
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
    },

    getWorkspacePath(input) {
      return manager.workspacePathForIssue(input.issueIdentifier, input.config.root);
    }
  };
}
