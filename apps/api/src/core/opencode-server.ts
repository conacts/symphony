import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import {
  attachLineBuffer,
  logNonJsonStreamLine
} from "./codex-app-server-protocol.js";
import {
  HarnessSessionError,
  type HarnessSession,
  type HarnessSessionLogger
} from "./agent-session-types.js";

const execFileAsync = promisify(execFile);
const openCodeServerPort = 4096;
const openCodeServerTimeoutMs = 5_000;
const openCodeServerHome = "/home/agent";

export type OpenCodeServerProcess = {
  process: ChildProcessWithoutNullStreams;
  baseUrl: string;
};

export async function startOpenCodeServer(input: {
  launchTarget: HarnessSession["launchTarget"];
  env: Record<string, string>;
  logger: HarnessSessionLogger;
}): Promise<OpenCodeServerProcess> {
  const containerIp = await inspectContainerIp(input.launchTarget.containerName);
  const baseUrl = `http://${containerIp}:${openCodeServerPort}`;
  const process = spawn("docker", [
    "exec",
    "--workdir",
    input.launchTarget.runtimeWorkspacePath,
    "-e",
    `HOME=${openCodeServerHome}`,
    "-e",
    `XDG_DATA_HOME=${openCodeServerHome}/.local/share`,
    ...dockerExecEnvArgs(input.env),
    input.launchTarget.containerName,
    "opencode",
    "serve",
    "--hostname=0.0.0.0",
    `--port=${openCodeServerPort}`
  ], {
    cwd: input.launchTarget.hostLaunchPath,
    stdio: "pipe"
  });

  attachLineBuffer(process.stdout, (line) => {
    logNonJsonStreamLine(input.logger, line, "stdout");
  });
  attachLineBuffer(process.stderr, (line) => {
    logNonJsonStreamLine(input.logger, line, "stderr");
  });

  await waitForOpenCodeHealth({
    baseUrl,
    timeoutMs: openCodeServerTimeoutMs,
    process
  });

  return {
    process,
    baseUrl
  };
}

async function waitForOpenCodeHealth(input: {
  baseUrl: string;
  timeoutMs: number;
  process: ChildProcessWithoutNullStreams;
}): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    if (input.process.exitCode !== null) {
      throw new HarnessSessionError(
        "opencode_server_start_failed",
        `OpenCode server exited before becoming healthy (code ${input.process.exitCode}).`
      );
    }

    try {
      const response = await fetch(`${input.baseUrl}/global/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  input.process.kill("SIGTERM");
  throw new HarnessSessionError(
    "opencode_server_start_failed",
    `Timed out waiting for OpenCode server health at ${input.baseUrl}.`
  );
}

async function inspectContainerIp(containerName: string): Promise<string> {
  const result = await execFileAsync("docker", [
    "inspect",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    containerName
  ]);
  const stdout =
    typeof result === "string"
      ? result
      : "stdout" in result && typeof result.stdout === "string"
        ? result.stdout
        : "";
  const ip = stdout.trim();

  if (ip === "") {
    throw new HarnessSessionError(
      "opencode_container_ip_missing",
      `Could not resolve a Docker IP address for container ${containerName}.`
    );
  }

  return ip;
}

function dockerExecEnvArgs(env: Record<string, string>): string[] {
  const args: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }

  return args;
}
