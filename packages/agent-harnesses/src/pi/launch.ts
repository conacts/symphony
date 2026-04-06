import type { AgentRuntimeLaunchTarget } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError, type HarnessLaunchSettings } from "../shared/session-types.js";

const defaultPiModel = "xiaomi/mimo-v2-pro";
const defaultPiReasoningEffort = "xhigh";
const supportedPiModels = new Set([
  "xiaomi/mimo-v2-pro",
  "gpt-5.4",
  "gpt-5.4-mini"
]);
const supportedPiReasoningEfforts = new Set([
  "low",
  "medium",
  "high",
  "xhigh"
]);
export const piModelLabelPrefix = "symphony:model:";
export const agentModelLabelPrefix = piModelLabelPrefix;
const piReasoningLabelPrefix = "symphony:reasoning:";

export function listSupportedPiModels(): string[] {
  return [...supportedPiModels];
}

export const listSupportedAgentModels = listSupportedPiModels;

export function resolvePiIssueModel(
  issue: SymphonyTrackerIssue,
  defaultModel = defaultPiModel
): string {
  return selectPiIssueOverride(
    issue,
    piModelLabelPrefix,
    supportedPiModels,
    defaultModel,
    "model"
  );
}

export const resolveAgentIssueModel = resolvePiIssueModel;

export function resolvePiLaunchSettings(
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
  const { model, reasoningEffort } = resolvePiModelSettings(issue, defaults);
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
    providerId: defaults?.providerId ?? null,
    providerName: defaults?.providerName ?? null
  };
}

export const resolveAgentLaunchSettings = resolvePiLaunchSettings;

export function resolvePiSdkLaunchSettings(
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

  const { model, reasoningEffort } = resolvePiModelSettings(issue, defaults);

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
        PI_AGENT_DIR: piAgentDir
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

export function buildDynamicToolSpecs(): Array<Record<string, unknown>> {
  return [
    {
      name: "linear_graphql",
      description:
        "Execute a raw GraphQL query or mutation against Linear using Symphony's configured server-side auth. Do not search for LINEAR_API_KEY in the shell.",
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
    },
    {
      name: "report_issue_delivery",
      description:
        "Report the final delivery outcome for the active Symphony issue. Use completed only after the PR is opened. Symphony records the delivery and moves the issue to In Review; do not move it to Done yourself.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["status", "summary"],
        properties: {
          status: {
            type: "string",
            enum: ["completed", "blocked", "partial"],
            description:
              "Delivery status for the active issue. Completed requires a PR URL."
          },
          summary: {
            type: "string",
            description: "Short summary of what was delivered or why delivery was blocked."
          },
          prUrl: {
            type: ["string", "null"],
            description: "Opened pull request URL. Required when status is completed."
          },
          prNumber: {
            type: ["string", "null"],
            description: "Optional pull request number when it is available."
          },
          branchName: {
            type: ["string", "null"],
            description: "Optional branch name associated with the delivered work."
          },
          blockingReason: {
            type: ["string", "null"],
            description: "Required when status is blocked."
          },
          testsSummary: {
            type: ["string", "null"],
            description: "Optional test and verification summary for the delivery."
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function resolvePiModelSettings(
  issue: SymphonyTrackerIssue,
  defaults?: {
    model?: string | null;
    reasoningEffort?: string | null;
  }
): {
  model: string;
  reasoningEffort: string;
} {
  const model = selectPiIssueOverride(
    issue,
    piModelLabelPrefix,
    supportedPiModels,
    defaults?.model ?? defaultPiModel,
    "model"
  );
  const reasoningEffort = selectPiIssueOverride(
    issue,
    piReasoningLabelPrefix,
    supportedPiReasoningEfforts,
    defaults?.reasoningEffort ?? defaultPiReasoningEffort,
    "reasoning effort"
  );

  return {
    model,
    reasoningEffort
  };
}

function selectPiIssueOverride(
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
      "invalid_pi_label_override",
      `Unsupported ${label} override label on ${issue.identifier}: ${issueLabel}`,
      {
        issueLabel,
        fallback
      }
    );
  }

  return fallback;
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
