import { createLocalSymphonyWorkspaceManager } from "./local-symphony-workspace-manager.js";
import type { SymphonyLoadedRuntimeManifest } from "../runtime-manifest.js";
import {
  resolvePreparedWorkspaceEnvBundle,
  workspaceEnvForCleanup,
  workspaceEnvForHooks
} from "./workspace-env-bundle.js";
import type { WorkspaceBackend, PreparedWorkspace } from "./workspace-contracts.js";

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
        manifestLifecycle: null,
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
          env: workspaceEnvForHooks(input.workspace),
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
            env: workspaceEnvForHooks(input.workspace),
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
        manifestLifecycleCleanup: null,
        workspaceRemovalDisposition: cleanup.workspaceRemovalDisposition,
        containerRemovalDisposition: "not_applicable"
      };
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
