import type { AgentRuntimeLaunchTarget } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError, type HarnessLaunchSettings } from "../shared/session-types.js";
import {
  legacyPiModelLabelPrefix,
  listSupportedPiModels,
  piModelLabelPrefix,
  piPresetLabelPrefix,
  resolvePiIssueModel,
  resolvePiIssueSelection
} from "./model-selection.js";

export const agentModelLabelPrefix = piModelLabelPrefix;
export const agentPresetLabelPrefix = piPresetLabelPrefix;
export const legacyAgentModelLabelPrefix = legacyPiModelLabelPrefix;
export const listSupportedAgentModels = listSupportedPiModels;

export const resolveAgentIssueModel = resolvePiIssueModel;

export function resolvePiLaunchSettings(
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
): HarnessLaunchSettings {
  const { model, reasoningEffort, authMode } = resolvePiIssueSelection(issue, defaults);
  const cleanedCommand = stripPiReasoningOverrides(
    stripPiModelOverrides(baseCommand)
  ).trim();
  const appServerMatch = /(?:^|\s)(app-server)(?=\s|$)/.exec(cleanedCommand);

  if (!appServerMatch || appServerMatch.index === undefined) {
    throw new HarnessSessionError(
      "invalid_pi_command",
      `Pi command must include app-server: ${baseCommand}`,
      {
        reason: "missing_app_server",
        command: baseCommand
      }
    );
  }

  const appServerIndex =
    appServerMatch.index + appServerMatch[0].lastIndexOf("app-server");
  const beforeAppServer = cleanedCommand.slice(0, appServerIndex).trimEnd();
  const appServerAndAfter = cleanedCommand.slice(appServerIndex).trimStart();

  return {
    command: [
      beforeAppServer,
      `--model ${model}`,
      `--config model_reasoning_effort=${reasoningEffort}`,
      appServerAndAfter
    ]
      .filter((segment) => segment !== "")
      .join(" "),
    model,
    reasoningEffort,
    profile: defaults?.profile ?? null,
    providerId: authMode === "provider" ? (defaults?.providerId ?? null) : null,
    providerName: authMode === "provider" ? (defaults?.providerName ?? null) : null
  };
}

export const resolveAgentLaunchSettings = resolvePiLaunchSettings;

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

export const resolveAgentSdkLaunchSettings = resolvePiSdkLaunchSettings;

export function buildPiAppServerSpawnSpec(input: {
  launchTarget: AgentRuntimeLaunchTarget;
  command: string;
  env: Record<string, string>;
  hostCommandEnvSource: Record<string, string | undefined>;
}): {
  command: string;
  args: string[];
  cwd: string;
  hostLaunchPath: string;
  runtimeWorkspacePath: string;
  env: Record<string, string>;
} {
  const piAgentDir = "/tmp/symphony-pi-agent";
  const mountedPiAuthPath = "/home/agent/.pi/agent/auth.json";

  return {
    command: "docker",
    args: [
      "exec",
      "-i",
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
        `exec ${input.command}`
      ].join(" && ")
    ],
    cwd: input.launchTarget.hostLaunchPath,
    hostLaunchPath: input.launchTarget.hostLaunchPath,
    runtimeWorkspacePath: input.launchTarget.runtimeWorkspacePath,
    env: buildHostCommandEnv(input.hostCommandEnvSource)
  };
}

export const buildAgentAppServerSpawnSpec = buildPiAppServerSpawnSpec;

export function wrapSessionError(error: unknown): Error {
  if (error instanceof HarnessSessionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Timed out waiting for Agent response 1")) {
    return new HarnessSessionError("initialize_failed", message, error);
  }

  if (message.includes("Timed out waiting for Agent response 2")) {
    return new HarnessSessionError("thread_start_failed", message, error);
  }

  return error instanceof Error ? error : new Error(message);
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
