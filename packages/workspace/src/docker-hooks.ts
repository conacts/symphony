import type { DockerWorkspaceCommandRunner } from "./docker-shared.js";
import { createDockerWorkspaceSessionManager } from "./session/session-manager.js";
import type { SymphonyWorkspaceContext } from "./workspace-identity.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export async function runWorkspaceHookInContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  shell: string;
  containerName: string;
  workspacePath: string;
  user: string;
  command: string;
  context: SymphonyWorkspaceContext;
  workerHost: string | null;
  env: Record<string, string | undefined> | undefined;
}): Promise<void> {
  const sessionManager = createDockerWorkspaceSessionManager({
    commandRunner: input.commandRunner
  });
  const result = await sessionManager
    .openContainerSession({
      containerName: input.containerName,
      workspacePath: input.workspacePath,
      shell: input.shell,
      user: input.user
    })
    .runShellCommand({
      command: input.command,
      timeoutMs: input.timeoutMs,
      env: buildWorkspaceHookEnv(
        input.workspacePath,
        input.context,
        input.workerHost,
        input.env
      ),
      metadata: {
        operation: "workspace_hook"
      }
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

  if (context.trackerIssueId) {
    merged.SYMPHONY_TRACKER_ISSUE_ID = context.trackerIssueId;
  }
  if (context.repositoryKey) {
    merged.SYMPHONY_REPOSITORY_KEY = context.repositoryKey;
  }

  if (workerHost) {
    merged.SYMPHONY_WORKER_HOST = workerHost;
  }

  return merged;
}
