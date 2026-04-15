import type { AgentRuntimeLaunchTarget } from "@symphony/orchestrator";
import path from "node:path";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError, type HarnessLaunchSettings } from "../shared/session-types.js";
import {
  listSupportedPiModels,
  piModelLabelPrefix,
  resolvePiIssueModel,
  resolvePiIssueSelection
} from "./model-selection.js";

export {
  listSupportedPiModels,
  piModelLabelPrefix,
  resolvePiIssueModel
};

export const defaultPiSdkRunnerRoot =
  "/opt/symphony/pi-sdk-runner";
export const defaultPiSdkRunnerTsxLoaderPath =
  `${defaultPiSdkRunnerRoot}/node_modules/tsx/dist/loader.mjs`;
export const defaultPiSdkRunnerEntrypointPath =
  `${defaultPiSdkRunnerRoot}/src/pi/sdk-runner-entrypoint.ts`;

export function resolvePiSdkLaunchSettings(
  baseCommand: string,
  issue: SymphonyTrackerIssue,
  defaults?: {
    model?: string | null;
    reasoningEffort?: string | null;
    defaultPreset?: string | null;
    presets?: Record<
      string,
      {
        model: string | null;
        reasoningEffort: string | null;
        authMode?: "provider" | "subscription" | null;
      }
    >;
    profile?: string | null;
    providerId?: string | null;
    providerName?: string | null;
  }
): HarnessLaunchSettings & {
  executable: string;
} {
  const cleanedCommand = stripPiReasoningOverrides(
    stripPiModelOverrides(baseCommand)
  ).trim();
  const executable = extractPiExecutable(cleanedCommand);

  if (executable === null) {
    throw new HarnessSessionError(
      "invalid_pi_command",
      `Pi command must start with an executable: ${baseCommand}`,
      {
        reason: "missing_executable",
        command: baseCommand
      }
    );
  }

  const { model, reasoningEffort, authMode } = resolvePiIssueSelection(issue, defaults);

  return {
    command: cleanedCommand,
    executable,
    model,
    reasoningEffort,
    profile: defaults?.profile ?? null,
    providerId: authMode === "provider" ? (defaults?.providerId ?? null) : null,
    providerName: authMode === "provider" ? (defaults?.providerName ?? null) : null
  };
}

export function buildPiSdkRunnerSpawnSpec(input: {
  launchTarget: AgentRuntimeLaunchTarget;
  env: Record<string, string>;
  hostCommandEnvSource: Record<string, string | undefined>;
}): {
  command: string;
  args: string[];
  cwd: string;
  hostLaunchPath: string;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot: string;
  env: Record<string, string>;
} {
  const piAgentDir = "/tmp/symphony-pi-agent";
  const mountedPiAuthPath = "/home/agent/.pi/agent/auth.json";
  const runtimeWorkspaceRoot = resolveRuntimeWorkspaceRoot(input.launchTarget);

  return {
    command: "docker",
    args: [
      "exec",
      "-i",
      "--user",
      input.launchTarget.user,
      ...dockerEnvFlags({
        ...input.env,
        PI_CODING_AGENT_DIR: piAgentDir
      }),
      "--workdir",
      input.launchTarget.runtimeWorkspacePath,
      input.launchTarget.containerName,
      input.launchTarget.shell,
      "-lc",
      [
        `mkdir -p ${shellQuote(piAgentDir)}`,
        `if [ -f ${shellQuote(mountedPiAuthPath)} ] && [ ! -f ${shellQuote(`${piAgentDir}/auth.json`)} ]; then cp ${shellQuote(mountedPiAuthPath)} ${shellQuote(`${piAgentDir}/auth.json`)}; fi`,
        `exec node --import ${shellQuote(defaultPiSdkRunnerTsxLoaderPath)} ${shellQuote(defaultPiSdkRunnerEntrypointPath)}`
      ].join(" && ")
    ],
    cwd: input.launchTarget.hostLaunchPath,
    hostLaunchPath: input.launchTarget.hostLaunchPath,
    runtimeWorkspacePath: input.launchTarget.runtimeWorkspacePath,
    runtimeWorkspaceRoot,
    env: buildHostCommandEnv(input.hostCommandEnvSource)
  };
}

function buildHostCommandEnv(
  hostCommandEnvSource: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(hostCommandEnvSource).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function dockerEnvFlags(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function stripPiModelOverrides(command: string): string {
  return command.replace(/(?:^|\s)--model\s+\S+/gu, "").trim();
}

function stripPiReasoningOverrides(command: string): string {
  return command.replace(
    /(?:^|\s)--config\s+model_reasoning_effort=\S+/gu,
    ""
  ).trim();
}

function extractPiExecutable(command: string): string | null {
  const [executable] = command.trim().split(/\s+/u);
  return executable ? executable : null;
}

function resolveRuntimeWorkspaceRoot(
  launchTarget: AgentRuntimeLaunchTarget
): string {
  const hostWorkspacePath = launchTarget.hostWorkspacePath;
  const hostLaunchPath = launchTarget.hostLaunchPath;
  const runtimeWorkspacePath = launchTarget.runtimeWorkspacePath;

  if (!hostWorkspacePath) {
    return runtimeWorkspacePath;
  }

  const relativeHostPath = path.relative(hostWorkspacePath, hostLaunchPath);
  if (
    relativeHostPath === "" ||
    relativeHostPath === "." ||
    relativeHostPath.startsWith("..")
  ) {
    return runtimeWorkspacePath;
  }

  const relativeSegments = relativeHostPath
    .split(path.sep)
    .filter((segment) => segment !== "");
  const runtimeSegments = runtimeWorkspacePath
    .split("/")
    .filter((segment) => segment !== "");

  if (
    relativeSegments.length === 0 ||
    relativeSegments.length > runtimeSegments.length
  ) {
    return runtimeWorkspacePath;
  }

  const rootSegments = runtimeSegments.slice(
    0,
    runtimeSegments.length - relativeSegments.length
  );

  return rootSegments.length === 0 ? "/" : `/${rootSegments.join("/")}`;
}
