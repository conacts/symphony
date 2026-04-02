import { spawn } from "node:child_process";
import { SymphonyWorkspaceError } from "./workspace-identity.js";
import type { DockerWorkspaceCommandResult } from "./docker-shared.js";

export function dockerCommandError(
  operation: string,
  args: string[],
  result: DockerWorkspaceCommandResult
): SymphonyWorkspaceError {
  return new SymphonyWorkspaceError(
    "workspace_docker_command_failed",
    [
      `docker ${operation} failed.`,
      `Command: docker ${sanitizeDockerArgs(args).join(" ")}`,
      result.stdout.trim(),
      result.stderr.trim()
    ]
      .filter((line) => line !== "")
      .join("\n")
  );
}

export function dockerLabelFlags(labels: Record<string, string>): string[] {
  return Object.entries(labels).flatMap(([key, value]) => [
    "--label",
    `${key}=${value}`
  ]);
}

export function dockerEnvFlags(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

export function hostUserFlags(): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();

  if (typeof uid !== "number" || typeof gid !== "number") {
    return [];
  }

  return ["--user", `${uid}:${gid}`];
}

export function isDockerMissingObject(stderr: string): boolean {
  return /No such (?:object|container|network)/i.test(stderr);
}

export function resolveDockerTimeoutMs(
  configuredTimeoutMs: number | null,
  fallbackTimeoutMs: number
): number {
  return configuredTimeoutMs ?? fallbackTimeoutMs;
}

export function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

export async function defaultDockerWorkspaceCommandRunner(input: {
  args: string[];
  timeoutMs: number;
}): Promise<DockerWorkspaceCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("docker", input.args);

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new SymphonyWorkspaceError(
          "workspace_docker_timeout",
          `Docker command timed out after ${input.timeoutMs}ms.`
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
      reject(
        new SymphonyWorkspaceError(
          "workspace_docker_unavailable",
          `Failed to start docker: ${error.message}`
        )
      );
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

function sanitizeDockerArgs(args: string[]): string[] {
  const sanitized = [...args];

  for (let index = 0; index < sanitized.length - 1; index += 1) {
    if (sanitized[index] !== "--env") {
      continue;
    }

    sanitized[index + 1] = redactDockerEnvAssignment(sanitized[index + 1] ?? "");
  }

  return sanitized;
}

function redactDockerEnvAssignment(assignment: string): string {
  const separator = assignment.indexOf("=");
  if (separator === -1) {
    return assignment;
  }

  const key = assignment.slice(0, separator);
  const value = assignment.slice(separator + 1);
  return `${key}=${shouldRedactDockerEnvValue(key) ? "<redacted>" : value}`;
}

export function shouldRedactDockerEnvValue(key: string): boolean {
  return /(PASSWORD|TOKEN|SECRET|DATABASE_URL|API_KEY|PRIVATE_KEY)/i.test(key);
}
