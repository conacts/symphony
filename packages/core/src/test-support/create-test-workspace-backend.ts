import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type {
  PreparedWorkspace,
  WorkspaceBackend,
  WorkspaceContext,
  WorkspaceHookKind
} from "../workspace/workspace-backend.js";
import { sanitizeSymphonyIssueIdentifier } from "../workspace/workspace-identity.js";

type TestWorkspaceCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type TestWorkspaceCommandRunner = (input: {
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
      const beforeRemoveHookOutcome = await resolveBeforeRemoveHookOutcome({
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
      });

      const hostPath =
        input.workspace?.executionTarget.hostPath ??
        path.join(
          input.config.root,
          `symphony-${sanitizeSymphonyIssueIdentifier(input.issueIdentifier)}`
        );
      if (hostPath) {
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
        networkRemovalDisposition: "removed",
        serviceCleanup: [],
        beforeRemoveHookOutcome,
        manifestLifecycleCleanup: null,
        workspaceRemovalDisposition: hostPath ? "removed" : "missing",
        containerRemovalDisposition: "removed"
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

  return {
    issueIdentifier: input.issueIdentifier,
    workspaceKey: input.workspaceKey,
    backendKind: "docker",
    prepareDisposition: input.created ? "created" : "reused",
    containerDisposition: input.created ? "started" : "reused",
    networkDisposition: input.created ? "created" : "reused",
    afterCreateHookOutcome: "skipped",
    executionTarget: {
      kind: "container",
      workspacePath: input.runtimeWorkspacePath,
      containerId: buildContainerId(input.containerNamePrefix, input.workspaceKey),
      containerName,
      hostPath: input.hostPath,
      shell: input.shell
    },
    materialization: {
      kind: "bind_mount",
      hostPath: input.hostPath,
      containerPath: input.runtimeWorkspacePath
    },
    networkName: buildNetworkName(input.containerNamePrefix, input.workspaceKey),
    services: [],
    envBundle: buildAmbientWorkspaceEnvBundle(input.environmentSource),
    manifestLifecycle: null,
    path: null,
    created: input.created,
    workerHost: input.workerHost
  };
}

function buildAmbientWorkspaceEnvBundle(
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

function buildContainerId(prefix: string, workspaceKey: string): string {
  return `${prefix}-${workspaceKey}-container`;
}

function buildContainerName(prefix: string, workspaceKey: string): string {
  return `${prefix}-${workspaceKey}`;
}

function buildNetworkName(prefix: string, workspaceKey: string): string {
  return `${prefix}-network-${workspaceKey}`;
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}
