import { access, mkdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { SymphonyWorkflowHooksConfig, SymphonyWorkflowWorkspaceConfig } from "../workflow/symphony-workflow.js";
import { isEnoent } from "../internal/errors.js";
import {
  SymphonyWorkspaceError,
  sanitizeSymphonyIssueIdentifier,
  type SymphonyWorkspaceContext
} from "./workspace-identity.js";
import {
  buildWorkspacePath,
  resolveManagedWorkspacePath,
  workspaceExists
} from "./workspace-paths.js";

const workspaceMetadataRelativePath = path.join(".symphony", "workspace.env");
const repoOwnedSourceRepoEnvName = "SYMPHONY_SOURCE_REPO";

export {
  SymphonyWorkspaceError,
  sanitizeSymphonyIssueIdentifier,
  symphonyWorkspaceDirectoryName,
  type SymphonyWorkspaceContext
} from "./workspace-identity.js";

export type SymphonyWorkspace = {
  issueIdentifier: string;
  workspaceKey: string;
  path: string;
  created: boolean;
  workerHost: string | null;
};

export type SymphonyWorkspaceCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SymphonyWorkspaceCommandRunner = (input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
}) => Promise<SymphonyWorkspaceCommandResult>;

export interface SymphonyWorkspaceManager {
  createForIssue(
    context: SymphonyWorkspaceContext,
    config: SymphonyWorkflowWorkspaceConfig,
    hooks: SymphonyWorkflowHooksConfig,
    options?: {
      env?: Record<string, string | undefined>;
      workerHost?: string | null;
    }
  ): Promise<SymphonyWorkspace>;
  runBeforeRunHook(
    workspacePath: string,
    context: SymphonyWorkspaceContext,
    hooks: SymphonyWorkflowHooksConfig,
    options?: {
      env?: Record<string, string | undefined>;
      workerHost?: string | null;
    }
  ): Promise<void>;
  runAfterRunHook(
    workspacePath: string,
    context: SymphonyWorkspaceContext,
    hooks: SymphonyWorkflowHooksConfig,
    options?: {
      env?: Record<string, string | undefined>;
      workerHost?: string | null;
    }
  ): Promise<"skipped" | "completed" | "failed_ignored">;
  removeIssueWorkspace(
    issueIdentifier: string,
    config: SymphonyWorkflowWorkspaceConfig,
    hooks: SymphonyWorkflowHooksConfig,
    options?: {
      env?: Record<string, string | undefined>;
      workerHost?: string | null;
    }
  ): Promise<{
    path: string;
    beforeRemoveHookOutcome: "skipped" | "completed" | "failed_ignored";
    workspaceRemovalDisposition: "removed" | "missing";
  }>;
  workspacePathForIssue(
    issueIdentifier: string,
    root: string
  ): string;
}

export function createLocalSymphonyWorkspaceManager(options: {
  commandRunner?: SymphonyWorkspaceCommandRunner;
  repoOwnedSourceRepo?: string | null;
} = {}): SymphonyWorkspaceManager {
  const commandRunner = options.commandRunner ?? defaultWorkspaceCommandRunner;

  return {
    async createForIssue(context, config, hooks, runnerOptions = {}) {
      const workspacePath = await resolveManagedWorkspacePath(
        context.issueIdentifier,
        config.root,
        true
      );
      const existingWorkspaceMode = await classifyExistingWorkspace(
        workspacePath,
        resolveRepoOwnedSourceRepo(options.repoOwnedSourceRepo, runnerOptions.env)
      );

      if (existingWorkspaceMode === "reset") {
        await rm(workspacePath, {
          recursive: true,
          force: true
        });
      }

      const created = await ensureLocalWorkspace(workspacePath);

      if (created && hooks.afterCreate) {
        await runWorkspaceHook(
          commandRunner,
          hooks.afterCreate,
          hooks.timeoutMs,
          workspacePath,
          context,
          runnerOptions.workerHost ?? null,
          runnerOptions.env
        );
      }

      return {
        issueIdentifier: context.issueIdentifier,
        workspaceKey: sanitizeSymphonyIssueIdentifier(context.issueIdentifier),
        path: workspacePath,
        created,
        workerHost: runnerOptions.workerHost ?? null
      };
    },

    async runBeforeRunHook(workspacePath, context, hooks, runnerOptions = {}) {
      if (!hooks.beforeRun) {
        return;
      }

      await runWorkspaceHook(
        commandRunner,
        hooks.beforeRun,
        hooks.timeoutMs,
        workspacePath,
        context,
        runnerOptions.workerHost ?? null,
        runnerOptions.env
      );
    },

    async runAfterRunHook(workspacePath, context, hooks, runnerOptions = {}) {
      if (!hooks.afterRun) {
        return "skipped";
      }

      try {
        await runWorkspaceHook(
          commandRunner,
          hooks.afterRun,
          hooks.timeoutMs,
          workspacePath,
          context,
          runnerOptions.workerHost ?? null,
          runnerOptions.env
        );
        return "completed";
      } catch {
        return "failed_ignored";
      }
    },

    async removeIssueWorkspace(issueIdentifier, config, hooks, runnerOptions = {}) {
      const workspacePath = await resolveManagedWorkspacePath(
        issueIdentifier,
        config.root,
        false
      );
      let beforeRemoveHookOutcome: "skipped" | "completed" | "failed_ignored" =
        "skipped";

      if (hooks.beforeRemove) {
        try {
          await runWorkspaceHook(
            commandRunner,
            hooks.beforeRemove,
            hooks.timeoutMs,
            workspacePath,
            {
              issueId: null,
              issueIdentifier
            },
            runnerOptions.workerHost ?? null,
            runnerOptions.env
          );
          beforeRemoveHookOutcome = "completed";
        } catch {
          beforeRemoveHookOutcome = "failed_ignored";
        }
      }

      const workspaceRemovalDisposition = await removeManagedWorkspace(workspacePath);

      return {
        path: workspacePath,
        beforeRemoveHookOutcome,
        workspaceRemovalDisposition
      };
    },

    workspacePathForIssue(issueIdentifier, root) {
      return buildWorkspacePath(issueIdentifier, root);
    }
  };
}

async function ensureLocalWorkspace(workspacePath: string): Promise<boolean> {
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
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }

  await mkdir(workspacePath, {
    recursive: true
  });
  return true;
}

async function removeManagedWorkspace(
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
      "workspace_remove_failed",
      `Workspace cleanup did not remove ${workspacePath}.`
    );
  }

  return existedBeforeDelete ? "removed" : "missing";
}

async function classifyExistingWorkspace(
  workspacePath: string,
  repoOwnedSourceRepo: string | null
): Promise<"create" | "reuse" | "reset"> {
  try {
    const existing = await stat(workspacePath);

    if (!existing.isDirectory()) {
      return "create";
    }

    if (!repoOwnedWorkspaceModeEnabled(repoOwnedSourceRepo)) {
      return "reuse";
    }

    return (await hasWorkspaceMetadataFile(workspacePath)) ? "reuse" : "reset";
  } catch (error) {
    if (isEnoent(error)) {
      return "create";
    }

    throw error;
  }
}

async function hasWorkspaceMetadataFile(workspacePath: string): Promise<boolean> {
  try {
    await access(path.join(workspacePath, workspaceMetadataRelativePath));
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }

    throw error;
  }
}

function repoOwnedWorkspaceModeEnabled(repoOwnedSourceRepo: string | null): boolean {
  return typeof repoOwnedSourceRepo === "string" && repoOwnedSourceRepo.trim() !== "";
}

function resolveRepoOwnedSourceRepo(
  configuredSourceRepo: string | null | undefined,
  env: Record<string, string | undefined> | undefined
): string | null {
  const runtimeSourceRepo = env?.[repoOwnedSourceRepoEnvName];
  if (typeof runtimeSourceRepo === "string" && runtimeSourceRepo.trim() !== "") {
    return runtimeSourceRepo;
  }

  if (typeof configuredSourceRepo === "string" && configuredSourceRepo.trim() !== "") {
    return configuredSourceRepo;
  }

  return null;
}

async function runWorkspaceHook(
  commandRunner: SymphonyWorkspaceCommandRunner,
  command: string,
  timeoutMs: number,
  workspacePath: string,
  context: SymphonyWorkspaceContext,
  workerHost: string | null,
  env: Record<string, string | undefined> | undefined
): Promise<void> {
  const result = await commandRunner({
    command,
    cwd: workspacePath,
    timeoutMs,
    env: buildWorkspaceHookEnv(workspacePath, context, workerHost, env)
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

async function defaultWorkspaceCommandRunner(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
}): Promise<SymphonyWorkspaceCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", input.command], {
      cwd: input.cwd,
      env: input.env
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new SymphonyWorkspaceError(
          "workspace_hook_timeout",
          `Workspace hook timed out after ${input.timeoutMs}ms.`
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
      reject(error);
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
