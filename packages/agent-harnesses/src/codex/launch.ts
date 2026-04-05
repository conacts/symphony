import type { AgentRuntimeLaunchTarget } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError, type HarnessLaunchSettings } from "../shared/session-types.js";

const defaultCodexModel = "xiaomi/mimo-v2-pro";
const defaultCodexReasoningEffort = "xhigh";
const supportedCodexModels = new Set([
  "xiaomi/mimo-v2-pro",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark"
]);
const supportedCodexReasoningEfforts = new Set([
  "low",
  "medium",
  "high",
  "xhigh"
]);
export const codexModelLabelPrefix = "symphony:model:";
const codexReasoningLabelPrefix = "symphony:reasoning:";

export function listSupportedCodexModels(): string[] {
  return [...supportedCodexModels];
}

export function resolveCodexIssueModel(
  issue: SymphonyTrackerIssue,
  defaultModel = defaultCodexModel
): string {
  return selectCodexIssueOverride(
    issue,
    codexModelLabelPrefix,
    supportedCodexModels,
    defaultModel,
    "model"
  );
}

export function resolveCodexLaunchSettings(
  baseCommand: string,
  issue: SymphonyTrackerIssue,
  defaults?: {
    model?: string | null;
    reasoningEffort?: string | null;
    profile?: string | null;
    providerId?: string | null;
    providerName?: string | null;
  }
): HarnessLaunchSettings {
  const { model, reasoningEffort } = resolveCodexModelSettings(issue, defaults);
  const cleanedCommand = stripCodexReasoningOverrides(
    stripCodexModelOverrides(baseCommand)
  ).trim();
  const appServerMatch = /(?:^|\s)(app-server)(?=\s|$)/.exec(cleanedCommand);

  if (!appServerMatch || appServerMatch.index === undefined) {
    throw new HarnessSessionError(
      "invalid_codex_command",
      `Codex command must include app-server: ${baseCommand}`,
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
    providerId: defaults?.providerId ?? null,
    providerName: defaults?.providerName ?? null
  };
}

export function resolveCodexSdkLaunchSettings(
  baseCommand: string,
  issue: SymphonyTrackerIssue,
  defaults?: {
    model?: string | null;
    reasoningEffort?: string | null;
    profile?: string | null;
    providerId?: string | null;
    providerName?: string | null;
  }
): HarnessLaunchSettings & {
  executable: string;
} {
  const cleanedCommand = stripCodexReasoningOverrides(
    stripCodexModelOverrides(baseCommand)
  ).trim();
  const executable = extractCodexExecutable(cleanedCommand);

  if (executable === null) {
    throw new HarnessSessionError(
      "invalid_codex_command",
      `Codex command must start with an executable: ${baseCommand}`,
      {
        reason: "missing_executable",
        command: baseCommand
      }
    );
  }

  const { model, reasoningEffort } = resolveCodexModelSettings(issue, defaults);

  return {
    command: cleanedCommand,
    executable,
    model,
    reasoningEffort,
    profile: defaults?.profile ?? null,
    providerId: defaults?.providerId ?? null,
    providerName: defaults?.providerName ?? null
  };
}

export function buildCodexAppServerSpawnSpec(input: {
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
  return {
    command: "docker",
    args: [
      "exec",
      "-i",
      ...dockerEnvFlags(input.env),
      "--workdir",
      input.launchTarget.runtimeWorkspacePath,
      input.launchTarget.containerName,
      input.launchTarget.shell,
      "-lc",
      input.command
    ],
    cwd: input.launchTarget.hostLaunchPath,
    hostLaunchPath: input.launchTarget.hostLaunchPath,
    runtimeWorkspacePath: input.launchTarget.runtimeWorkspacePath,
    env: buildHostCommandEnv(input.hostCommandEnvSource)
  };
}

export function wrapSessionError(error: unknown): Error {
  if (error instanceof HarnessSessionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Timed out waiting for Codex response 1")) {
    return new HarnessSessionError("initialize_failed", message, error);
  }

  if (message.includes("Timed out waiting for Codex response 2")) {
    return new HarnessSessionError("thread_start_failed", message, error);
  }

  return error instanceof Error ? error : new Error(message);
}

export function buildDynamicToolSpecs(): Array<Record<string, unknown>> {
  return [
    {
      name: "linear_graphql",
      description:
        "Execute a raw GraphQL query or mutation against Linear using Symphony's configured auth.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description:
              "GraphQL query or mutation document to execute against Linear."
          },
          variables: {
            type: ["object", "null"],
            description: "Optional GraphQL variables object.",
            additionalProperties: true
          }
        }
      }
    }
  ];
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

function resolveCodexModelSettings(
  issue: SymphonyTrackerIssue,
  defaults?: {
    model?: string | null;
    reasoningEffort?: string | null;
  }
): {
  model: string;
  reasoningEffort: string;
} {
  const model = selectCodexIssueOverride(
    issue,
    codexModelLabelPrefix,
    supportedCodexModels,
    defaults?.model ?? defaultCodexModel,
    "model"
  );
  const reasoningEffort = selectCodexIssueOverride(
    issue,
    codexReasoningLabelPrefix,
    supportedCodexReasoningEfforts,
    defaults?.reasoningEffort ?? defaultCodexReasoningEffort,
    "reasoning effort"
  );

  return {
    model,
    reasoningEffort
  };
}

function selectCodexIssueOverride(
  issue: SymphonyTrackerIssue,
  prefix: string,
  supported: Set<string>,
  fallback: string,
  label: string
): string {
  for (const issueLabel of issue.labels) {
    if (!issueLabel.startsWith(prefix)) {
      continue;
    }

    const value = issueLabel.slice(prefix.length).trim();
    if (supported.has(value)) {
      return value;
    }

    throw new HarnessSessionError(
      "invalid_codex_label_override",
      `Unsupported ${label} override label on ${issue.identifier}: ${issueLabel}`,
      {
        issueLabel,
        fallback
      }
    );
  }

  return fallback;
}

function stripCodexModelOverrides(command: string): string {
  return command.replace(/(?:^|\s)--model\s+\S+/gu, "").trim();
}

function stripCodexReasoningOverrides(command: string): string {
  return command.replace(
    /(?:^|\s)--config\s+model_reasoning_effort=\S+/gu,
    ""
  ).trim();
}

function extractCodexExecutable(command: string): string | null {
  const [executable] = command.trim().split(/\s+/u);
  return executable ? executable : null;
}
