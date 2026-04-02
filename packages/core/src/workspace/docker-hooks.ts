import { dockerEnvFlags } from "./docker-client.js";
import type { DockerWorkspaceCommandRunner } from "./docker-shared.js";
import type { SymphonyWorkspaceContext } from "./workspace-identity.js";
import { SymphonyWorkspaceError } from "./workspace-identity.js";

export async function runWorkspaceHookInContainer(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  timeoutMs: number;
  shell: string;
  containerName: string;
  workspacePath: string;
  command: string;
  context: SymphonyWorkspaceContext;
  workerHost: string | null;
  env: Record<string, string | undefined> | undefined;
}): Promise<void> {
  const args = [
    "exec",
    ...dockerEnvFlags(
      buildWorkspaceHookEnv(
        input.workspacePath,
        input.context,
        input.workerHost,
        input.env
      )
    ),
    "--workdir",
    input.workspacePath,
    input.containerName,
    input.shell,
    "-lc",
    input.command
  ];
  const result = await input.commandRunner({
    args,
    timeoutMs: input.timeoutMs
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

export function buildWorkspaceHookEnv(
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
