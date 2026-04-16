import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { HarnessSession } from "../shared/session-types.js";
import { PiRunnerClient } from "./runner-client.js";

const execFileAsync = promisify(execFile);
const liveDockerEnabled = process.env.SYMPHONY_LIVE_DOCKER_VERIFY === "1";
const describeLiveDocker = liveDockerEnabled ? describe : describe.skip;
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describeLiveDocker("pi runner client live docker", () => {
  it(
    "starts a real Pi SDK session through the stable wrapper executable",
    async () => {
      const authFile = resolvePiAuthFile();
      await access(authFile);

      const workspace = await createWorkspace();
      const canonicalLaunchPath = await realpath(workspace.launchPath);
      const canonicalWorkspaceRoot = await realpath(workspace.root);
      const containerName = `symphony-pi-live-${randomUUID().slice(0, 8)}`;
      const image =
        process.env.SYMPHONY_DOCKER_WORKSPACE_IMAGE ??
        "symphony/workspace-runner:local";
      const containerId = await dockerCommand([
        "run",
        "-d",
        "--rm",
        "--name",
        containerName,
        "--volume",
        `${workspace.root}:/workspace`,
        "--volume",
        `${authFile}:/home/agent/.pi/agent/auth.json:ro`,
        image
      ]);

      let session: HarnessSession | null = null;
      try {
        session = await PiRunnerClient.startSession({
          launchTarget: {
            kind: "container",
            hostLaunchPath: workspace.launchPath,
            hostWorkspacePath: workspace.root,
            runtimeWorkspacePath: "/workspace/app",
            containerId,
            containerName,
            shell: "sh",
            user: "1000:1000"
          },
          env: buildRunnerEnv(),
          hostCommandEnvSource: buildHostCommandEnvSource(),
          runtimePolicy: createRuntimePolicy(workspace.root),
          issue: createIssue(),
          logger: createLogger()
        });

        expect(session.threadId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f-]{27}$/u
        );
        expect(session.workspacePath).toBe("/workspace/app");
        expect(session.hostLaunchPath).toBe(canonicalLaunchPath);
        if (session.hostWorkspacePath === null) {
          throw new TypeError("Expected a host workspace path for container runs.");
        }
        expect(await realpath(session.hostWorkspacePath)).toBe(canonicalWorkspaceRoot);
        expect(session.processId).not.toBeNull();
        expect(session.model).toBe("xiaomi/mimo-v2-pro");
        expect(session.reasoningEffort).toBe("xhigh");
        expect(session.providerId).toBe("openrouter");
        expect(session.providerName).toBe("OpenRouter");
      } finally {
        session?.client.close();
        await dockerForceRemove(containerName);
      }
    },
    60_000
  );
});

async function createWorkspace(): Promise<{
  root: string;
  launchPath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-pi-live-"));
  tempDirectories.push(root);
  const launchPath = path.join(root, "app");
  await writeFile(
    path.join(root, "README.md"),
    "# Live Pi runner bootstrap fixture\n",
    "utf8"
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "symphony-live-bootstrap-fixture",
        private: true
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await mkdirIfMissing(launchPath);
  await writeFile(
    path.join(launchPath, "README.md"),
    "# App workspace fixture\n",
    "utf8"
  );
  return {
    root,
    launchPath
  };
}

function resolvePiAuthFile(): string {
  const configuredPath = process.env.SYMPHONY_LIVE_DOCKER_PI_AUTH_FILE;
  if (typeof configuredPath === "string" && configuredPath.trim() !== "") {
    return configuredPath;
  }

  return path.join(homedir(), ".pi/agent/auth.json");
}

function buildRunnerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (typeof openRouterKey === "string" && openRouterKey.trim() !== "") {
    env.OPENROUTER_API_KEY = openRouterKey;
  }
  return env;
}

function buildHostCommandEnvSource(): Record<string, string | undefined> {
  return {
    PATH: process.env.PATH,
    HOME: homedir()
  };
}

function createIssue(): SymphonyTrackerIssue {
  return {
    id: "issue-live-1",
    identifier: "SYM-LIVE",
    title: "Validate live Pi runner wrapper",
    description: null,
    priority: null,
    url: null,
    state: "In Progress",
    branchName: null,
    labels: [],
    projectId: null,
    projectName: null,
    teamKey: "SYM",
    assigneeId: null,
    blockedBy: [],
    assignedToWorker: false,
    createdAt: null,
    updatedAt: null
  };
}

function createRuntimePolicy(workspaceRoot: string): SymphonyAgentRuntimeConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      teamKey: "SYM",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked"
    },
    workspace: {
      root: workspaceRoot
    },
    agent: {
      harness: "pi",
      maxTurns: 20
    },
    agentRuntime: {
      command: "pi",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      defaultPreset: "advanced",
      presets: {
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          authMode: "provider"
        }
      },
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      },
      turnTimeoutMs: 300_000,
      readTimeoutMs: 15_000,
      stallTimeoutMs: 300_000
    },
    pi: {
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      defaultPreset: "advanced",
      presets: {
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          authMode: "provider"
        }
      },
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      },
      turnTimeoutMs: 300_000,
      readTimeoutMs: 15_000,
      stallTimeoutMs: 300_000,
      toolTimeoutMs: 900_000
    },
    hooks: {
      timeoutMs: 150_000
    }
  };
}

function createLogger() {
  return {
    debug() {},
    warn() {},
    error() {}
  };
}

async function mkdirIfMissing(directory: string): Promise<void> {
  await mkdir(directory, {
    recursive: true
  });
}

async function dockerCommand(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("docker", args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    return result.stdout.trim();
  } catch (error) {
    throw new Error(
      `Docker command failed: docker ${args.join(" ")}\n${formatExecFailure(error)}`,
      {
        cause: error
      }
    );
  }
}

async function dockerForceRemove(containerName: string): Promise<void> {
  try {
    await execFileAsync(
      "docker",
      ["rm", "-f", containerName],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      }
    );
  } catch {
    // Cleanup must not hide the primary failure.
  }
}

function formatExecFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const stdout =
    "stdout" in error && typeof error.stdout === "string"
      ? error.stdout.trim()
      : "";
  const stderr =
    "stderr" in error && typeof error.stderr === "string"
      ? error.stderr.trim()
      : "";

  return [error.message, stdout, stderr].filter((value) => value !== "").join("\n");
}
