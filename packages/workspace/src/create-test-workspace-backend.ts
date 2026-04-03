import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  sanitizeSymphonyIssueIdentifier,
  type PreparedWorkspace,
  type WorkspaceBackend,
  type WorkspaceContext,
  type WorkspaceHookKind
} from "./workspace-backend.js";

export type TestWorkspaceCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type TestWorkspaceCommandRunner = (input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
  hookKind: WorkspaceHookKind;
  context: WorkspaceContext;
  workerHost: string | null;
}) => Promise<TestWorkspaceCommandResult> | TestWorkspaceCommandResult;

export function createTestWorkspaceBackend(options: {
  commandRunner?: TestWorkspaceCommandRunner;
  containerNamePrefix?: string;
  runtimeWorkspacePath?: string;
  shell?: string;
} = {}): WorkspaceBackend {
  const runtimeWorkspacePath =
    options.runtimeWorkspacePath ?? "/home/agent/workspace";
  const shell = options.shell ?? "sh";
  const containerNamePrefix = options.containerNamePrefix ?? "symphony";

  return {
    kind: "docker",
    async prepareWorkspace(input) {
      const workspaceKey = sanitizeSymphonyIssueIdentifier(
        input.context.issueIdentifier
      );
      const hostPath = path.join(input.config.root, `symphony-${workspaceKey}`);
      const created = !(await pathExists(hostPath));
      await mkdir(hostPath, {
        recursive: true
      });

      const workspace = buildPreparedWorkspace({
        issueIdentifier: input.context.issueIdentifier,
        workspaceKey,
        hostPath,
        runtimeWorkspacePath,
        shell,
        created,
        containerNamePrefix,
        environmentSource: input.env,
        workerHost: input.workerHost ?? null
      });

      if (created) {
        await runHookIfPresent({
          workspace,
          hookKind: "after_create",
          command: input.hooks.afterCreate,
          timeoutMs: input.hooks.timeoutMs,
          context: input.context,
          workerHost: input.workerHost ?? null,
          commandRunner: options.commandRunner
        });
      }

      return workspace;
    },
    async runBeforeRun(input) {
      await runHookIfPresent({
        workspace: input.workspace,
        hookKind: "before_run",
        command: input.hooks.beforeRun,
        timeoutMs: input.hooks.timeoutMs,
        context: input.context,
        workerHost: input.workerHost ?? null,
        commandRunner: options.commandRunner
      });

      return {
        hookKind: "before_run",
        outcome: input.hooks.beforeRun ? "completed" : "skipped"
      };
    },
    async runAfterRun(input) {
      try {
        await runHookIfPresent({
          workspace: input.workspace,
          hookKind: "after_run",
          command: input.hooks.afterRun,
          timeoutMs: input.hooks.timeoutMs,
          context: input.context,
          workerHost: input.workerHost ?? null,
          commandRunner: options.commandRunner
        });

        return {
          hookKind: "after_run",
          outcome: input.hooks.afterRun ? "completed" : "skipped"
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
      const beforeRemoveHookOutcome =
        mode === "destroy"
          ? await resolveBeforeRemoveHookOutcome({
              workspace:
                input.workspace ??
                buildPreparedWorkspace({
                  issueIdentifier: input.issueIdentifier,
                  workspaceKey: sanitizeSymphonyIssueIdentifier(input.issueIdentifier),
                  hostPath: path.join(
                    input.config.root,
                    `symphony-${sanitizeSymphonyIssueIdentifier(input.issueIdentifier)}`
                  ),
                  runtimeWorkspacePath,
                  shell,
                  created: false,
                  containerNamePrefix,
                  environmentSource: input.env,
                  workerHost: input.workerHost ?? null
                }),
              hooks: input.hooks,
              issueIdentifier: input.issueIdentifier,
              workerHost: input.workerHost ?? null,
              commandRunner: options.commandRunner
            })
          : "skipped";

      const hostPath =
        input.workspace?.executionTarget.hostPath ??
        path.join(
          input.config.root,
          `symphony-${sanitizeSymphonyIssueIdentifier(input.issueIdentifier)}`
        );
      if (mode === "destroy" && hostPath) {
        await rm(hostPath, {
          recursive: true,
          force: true
        });
      }

      return {
        backendKind: "docker",
        workerHost: input.workerHost ?? null,
        hostPath: hostPath ?? null,
        runtimePath: runtimeWorkspacePath,
        containerId: buildContainerId(
          containerNamePrefix,
          sanitizeSymphonyIssueIdentifier(input.issueIdentifier)
        ),
        containerName: buildContainerName(
          containerNamePrefix,
          sanitizeSymphonyIssueIdentifier(input.issueIdentifier)
        ),
        networkName: buildNetworkName(
          containerNamePrefix,
          sanitizeSymphonyIssueIdentifier(input.issueIdentifier)
        ),
        networkRemovalDisposition:
          mode === "destroy" ? "removed" : "preserved",
        serviceCleanup: [],
        beforeRemoveHookOutcome:
          mode === "destroy" ? beforeRemoveHookOutcome : "skipped",
        manifestLifecycleCleanup: null,
        workspaceRemovalDisposition:
          mode === "destroy"
            ? hostPath
              ? "removed"
              : "missing"
            : "preserved",
        containerRemovalDisposition:
          mode === "destroy" ? "removed" : "stopped"
      };
    }
  };
}

async function resolveBeforeRemoveHookOutcome(input: {
  workspace: PreparedWorkspace;
  hooks: {
    beforeRemove: string | null;
    timeoutMs: number;
  };
  issueIdentifier: string;
  workerHost: string | null;
  commandRunner: TestWorkspaceCommandRunner | undefined;
}): Promise<"skipped" | "completed" | "failed_ignored"> {
  if (!input.hooks.beforeRemove) {
    return "skipped";
  }

  try {
    await runHookIfPresent({
      workspace: input.workspace,
      hookKind: "before_remove",
      command: input.hooks.beforeRemove,
      timeoutMs: input.hooks.timeoutMs,
      context: {
        issueId: null,
        issueIdentifier: input.issueIdentifier
      },
      workerHost: input.workerHost,
      commandRunner: input.commandRunner
    });

    return "completed";
  } catch {
    return "failed_ignored";
  }
}

async function runHookIfPresent(input: {
  workspace: PreparedWorkspace;
  hookKind: WorkspaceHookKind;
  command: string | null;
  timeoutMs: number;
  context: WorkspaceContext;
  workerHost: string | null;
  commandRunner: TestWorkspaceCommandRunner | undefined;
}): Promise<void> {
  if (!input.command || !input.commandRunner) {
    return;
  }

  const cwd =
    input.workspace.executionTarget.hostPath ??
    (input.workspace.materialization.kind === "bind_mount"
      ? input.workspace.materialization.hostPath
      : input.workspace.materialization.hostPath ?? input.workspace.workspaceKey);

  const result = await input.commandRunner({
    command: input.command,
    cwd,
    timeoutMs: input.timeoutMs,
    env: input.workspace.envBundle.values,
    hookKind: input.hookKind,
    context: input.context,
    workerHost: input.workerHost
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || input.command);
  }
}

function buildPreparedWorkspace(input: {
  issueIdentifier: string;
  workspaceKey: string;
  hostPath: string;
  runtimeWorkspacePath: string;
  shell: string;
  created: boolean;
  containerNamePrefix: string;
  environmentSource: Record<string, string | undefined> | undefined;
  workerHost: string | null;
}): PreparedWorkspace {
  const containerName = buildContainerName(
    input.containerNamePrefix,
    input.workspaceKey
  );
  const containerId = buildContainerId(
    input.containerNamePrefix,
    input.workspaceKey
  );
  const networkName = buildNetworkName(
    input.containerNamePrefix,
    input.workspaceKey
  );

  return {
    issueIdentifier: input.issueIdentifier,
    workspaceKey: input.workspaceKey,
    backendKind: "docker",
    prepareDisposition: input.created ? "created" : "reused",
    containerDisposition: input.created ? "started" : "reused",
    networkDisposition: input.created ? "created" : "reused",
    afterCreateHookOutcome: input.created ? "completed" : "skipped",
    executionTarget: {
      kind: "container",
      workspacePath: input.runtimeWorkspacePath,
      hostPath: input.hostPath,
      containerId,
      containerName,
      shell: input.shell
    },
    materialization: {
      kind: "bind_mount",
      hostPath: input.hostPath,
      containerPath: input.runtimeWorkspacePath
    },
    networkName,
    services: [],
    envBundle: {
      source: "ambient",
      values: normalizeEnvironmentSource(input.environmentSource),
      summary: {
        source: "ambient",
        injectedKeys: [],
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
    },
    manifestLifecycle: null,
    path: input.hostPath,
    created: input.created,
    workerHost: input.workerHost
  };
}

function normalizeEnvironmentSource(
  environmentSource: Record<string, string | undefined> | undefined
): Record<string, string> {
  if (!environmentSource) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(environmentSource).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  );
}

function buildContainerName(prefix: string, workspaceKey: string): string {
  return `${prefix}-${workspaceKey}`;
}

function buildContainerId(prefix: string, workspaceKey: string): string {
  return `${buildContainerName(prefix, workspaceKey)}-id`;
}

function buildNetworkName(prefix: string, workspaceKey: string): string {
  return `${prefix}-${workspaceKey}-network`;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}
