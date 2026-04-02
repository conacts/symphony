import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { SymphonyTrackerIssue } from "@symphony/core/tracker";
import {
  CodexAppServerError,
  type CodexLaunchSettings
} from "./codex-app-server-types.js";
import type { CodexRuntimeLaunchTarget } from "./codex-runtime-launch-target.js";

const defaultCodexModel = "gpt-5.4";
const defaultCodexReasoningEffort = "xhigh";
const supportedCodexModels = new Set([
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
const codexModelLabelPrefix = "symphony:model:";
const codexReasoningLabelPrefix = "symphony:reasoning:";

export async function validateWorkspaceCwd(
  workspacePath: string,
  workspaceRoot: string
): Promise<string> {
  const expandedWorkspace = path.resolve(workspacePath);
  const expandedRoot = path.resolve(workspaceRoot);
  const expandedRootPrefix = `${expandedRoot}${path.sep}`;

  try {
    const canonicalWorkspace = await realpath(expandedWorkspace);
    const canonicalRoot = await realpath(expandedRoot);
    const canonicalRootPrefix = `${canonicalRoot}${path.sep}`;

    if (canonicalWorkspace === canonicalRoot) {
      throw new CodexAppServerError(
        "invalid_workspace_cwd",
        `Workspace path must not equal the workspace root: ${canonicalWorkspace}`,
        {
          reason: "workspace_root",
          path: canonicalWorkspace
        }
      );
    }

    if (canonicalWorkspace.startsWith(canonicalRootPrefix)) {
      return canonicalWorkspace;
    }

    if (expandedWorkspace.startsWith(expandedRootPrefix)) {
      throw new CodexAppServerError(
        "invalid_workspace_cwd",
        `Workspace path escaped the workspace root via symlink: ${expandedWorkspace}`,
        {
          reason: "symlink_escape",
          path: expandedWorkspace,
          root: canonicalRoot
        }
      );
    }

    throw new CodexAppServerError(
      "invalid_workspace_cwd",
      `Workspace path is outside the workspace root: ${canonicalWorkspace}`,
      {
        reason: "outside_workspace_root",
        path: canonicalWorkspace,
        root: canonicalRoot
      }
    );
  } catch (error) {
    if (error instanceof CodexAppServerError) {
      throw error;
    }

    throw new CodexAppServerError(
      "invalid_workspace_cwd",
      `Workspace path could not be resolved: ${expandedWorkspace}`,
      {
        reason: "path_unreadable",
        path: expandedWorkspace,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

export async function ensureWorkspaceCwd(
  workspacePath: string,
  workspaceRoot: string
): Promise<string> {
  await mkdir(workspacePath, {
    recursive: true
  });

  return await validateWorkspaceCwd(workspacePath, workspaceRoot);
}

export function resolveCodexLaunchSettings(
  baseCommand: string,
  issue: SymphonyTrackerIssue
): CodexLaunchSettings {
  const model = selectCodexIssueOverride(
    issue,
    codexModelLabelPrefix,
    supportedCodexModels,
    defaultCodexModel,
    "model"
  );
  const reasoningEffort = selectCodexIssueOverride(
    issue,
    codexReasoningLabelPrefix,
    supportedCodexReasoningEfforts,
    defaultCodexReasoningEffort,
    "reasoning_effort"
  );
  const cleanedCommand = stripCodexReasoningOverrides(
    stripCodexModelOverrides(baseCommand)
  ).trim();
  const appServerMatch = /(?:^|\s)(app-server)(?=\s|$)/.exec(cleanedCommand);

  if (!appServerMatch || appServerMatch.index === undefined) {
    throw new CodexAppServerError(
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
    reasoningEffort
  };
}

export function buildCodexAppServerSpawnSpec(input: {
  launchTarget: CodexRuntimeLaunchTarget;
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
  if (input.launchTarget.kind === "host_path") {
    return {
      command: "bash",
      args: ["-lc", input.command],
      cwd: input.launchTarget.hostLaunchPath,
      hostLaunchPath: input.launchTarget.hostLaunchPath,
      runtimeWorkspacePath: input.launchTarget.runtimeWorkspacePath,
      env: buildHostLaunchEnv(input.env, input.hostCommandEnvSource)
    };
  }

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

function buildHostLaunchEnv(
  explicitEnv: Record<string, string>,
  hostCommandEnvSource: Record<string, string | undefined>
): Record<string, string> {
  return {
    ...buildHostCommandEnv(hostCommandEnvSource),
    ...explicitEnv
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

export function wrapSessionError(error: unknown): Error {
  if (error instanceof CodexAppServerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Timed out waiting for Codex response 1")) {
    return new CodexAppServerError("initialize_failed", message, error);
  }

  if (message.includes("Timed out waiting for Codex response 2")) {
    return new CodexAppServerError("thread_start_failed", message, error);
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

function selectCodexIssueOverride(
  issue: SymphonyTrackerIssue,
  prefix: string,
  supportedValues: Set<string>,
  defaultValue: string,
  kind: string
): string {
  const values = (Array.isArray(issue.labels) ? issue.labels : [])
    .map((label) => normalizeCodexLabel(label))
    .filter((label) => label.startsWith(prefix))
    .map((label) => normalizeCodexLabelValue(label.slice(prefix.length)))
    .filter((value) => value !== "")
    .sort();
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 0) {
    return defaultValue;
  }

  if (uniqueValues.length > 1) {
    throw new CodexAppServerError(
      "invalid_issue_label_override",
      `Conflicting Codex ${kind} labels: ${uniqueValues.join(", ")}`,
      {
        kind,
        values: uniqueValues
      }
    );
  }

  const value = uniqueValues[0]!;
  if (supportedValues.has(value)) {
    return value;
  }

  throw new CodexAppServerError(
    "invalid_issue_label_override",
    `Unsupported Codex ${kind} label override: ${value}`,
    {
      kind,
      value,
      supportedValues: [...supportedValues]
    }
  );
}

function normalizeCodexLabel(label: string): string {
  return label.trim().toLowerCase();
}

function normalizeCodexLabelValue(value: string): string {
  return normalizeCodexLabel(value).replace(/\s+/g, "-");
}

function stripCodexModelOverrides(command: string): string {
  return command.replace(/\s+(?:--model|-m)\s+\S+/g, "");
}

function stripCodexReasoningOverrides(command: string): string {
  return command.replace(
    /\s+(?:--config|-c)\s+(?:["'])?model_reasoning_effort=[^"'\s]+(?:["'])?/g,
    ""
  );
}
