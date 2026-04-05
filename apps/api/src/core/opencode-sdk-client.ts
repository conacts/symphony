import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";
import {
  projectOpenCodePromptResponse,
  projectOpenCodeSessionDiff,
  projectOpenCodeTodoListEvent
} from "@symphony/agent-harnesses";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  attachLineBuffer,
  logNonJsonStreamLine
} from "./codex-app-server-protocol.js";
import {
  CodexAppServerError,
  type CodexAppServerLogger,
  type CodexAppServerSession,
  type CodexAppServerSessionClient,
  type CodexAppServerTurnResult
} from "./codex-app-server-types.js";

const execFileAsync = promisify(execFile);
const openCodeServerPort = 4096;
const openCodeServerTimeoutMs = 5_000;
const openCodeServerHome = "/home/agent";

type OpenCodeSessionState = {
  sdkClient: OpencodeClient;
  sessionId: string;
  server: {
    process: ChildProcessWithoutNullStreams;
    baseUrl: string;
  };
  threadStarted: boolean;
  turnSequence: number;
  activeAbortController: AbortController | null;
};

export class OpenCodeSdkClient implements CodexAppServerSessionClient {
  readonly #state: OpenCodeSessionState;

  constructor(state: OpenCodeSessionState) {
    this.#state = state;
  }

  static async startSession(input: {
    launchTarget: CodexAppServerSession["launchTarget"];
    env: Record<string, string>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: CodexAppServerLogger;
  }): Promise<CodexAppServerSession> {
    if (input.launchTarget.kind !== "container") {
      throw new CodexAppServerError(
        "opencode_launch_unsupported",
        "OpenCode runtime currently requires a container-backed launch target."
      );
    }

    const server = await startOpenCodeServer({
      launchTarget: input.launchTarget,
      env: input.env,
      logger: input.logger
    });
    const sdkClient = createOpencodeClient({
      baseUrl: server.baseUrl,
      directory: input.launchTarget.runtimeWorkspacePath,
      responseStyle: "fields"
    });

    try {
      const created = await sdkClient.session.create(
        {
          title: `${input.issue.identifier}: ${input.issue.title}`
        },
        {
          throwOnError: true,
          responseStyle: "data"
        }
      );
      const createdSession = unwrapData(created, "OpenCode session.create");

      const provider = input.runtimePolicy.codex.provider;

      return {
        client: new OpenCodeSdkClient({
          sdkClient,
          sessionId: createdSession.id,
          server,
          threadStarted: false,
          turnSequence: 0,
          activeAbortController: null
        }),
        threadId: createdSession.id,
        workspacePath: input.launchTarget.runtimeWorkspacePath,
        hostLaunchPath: input.launchTarget.hostLaunchPath,
        hostWorkspacePath: input.launchTarget.hostWorkspacePath,
        launchTarget: input.launchTarget,
        issue: input.issue,
        processId: server.process.pid ? String(server.process.pid) : null,
        autoApproveRequests: true,
        approvalPolicy: "never",
        model: input.runtimePolicy.codex.defaultModel ?? "unknown",
        reasoningEffort: input.runtimePolicy.codex.defaultReasoningEffort ?? "medium",
        profile: input.runtimePolicy.codex.profile,
        providerId: provider?.id ?? null,
        providerName: provider?.name ?? null
      };
    } catch (error) {
      server.process.kill("SIGTERM");
      throw new CodexAppServerError(
        "opencode_session_start_failed",
        error instanceof Error ? error.message : String(error),
        error
      );
    }
  }

  close(): void {
    this.#state.activeAbortController?.abort();
    this.#state.activeAbortController = null;
    this.#state.server.process.kill("SIGTERM");
  }

  async runTurn(
    session: CodexAppServerSession,
    input: Parameters<CodexAppServerSessionClient["runTurn"]>[1]
  ): Promise<CodexAppServerTurnResult> {
    const turnSequence = this.#state.turnSequence + 1;
    this.#state.turnSequence = turnSequence;

    const turnId = `opencode-turn-${turnSequence}`;
    const abortController = new AbortController();
    this.#state.activeAbortController = abortController;
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, input.turnTimeoutMs);

    try {
      if (!this.#state.threadStarted) {
        this.#state.threadStarted = true;
        await input.onMessage({
          type: "thread.started",
          thread_id: this.#state.sessionId
        });
      }

      const response = await this.#state.sdkClient.session.prompt(
        {
          sessionID: this.#state.sessionId,
          model: buildOpenCodePromptModel(session),
          parts: [
            {
              type: "text",
              text: input.prompt
            }
          ]
        },
        {
          signal: abortController.signal,
          throwOnError: true,
          responseStyle: "data"
        }
      );
      const promptResponse = unwrapData(response, "OpenCode session.prompt");

      const promptProjection = projectOpenCodePromptResponse({
        response: promptResponse
      });
      const completionEvent =
        promptProjection.events[promptProjection.events.length - 1]?.type ===
        "turn.completed"
          ? promptProjection.events[promptProjection.events.length - 1]
          : null;
      const itemEvents =
        completionEvent === null
          ? promptProjection.events
          : promptProjection.events.slice(0, -1);

      for (const event of itemEvents) {
        await input.onMessage(event);
      }

      const diffProjection = await fetchOpenCodeSessionDiff({
        sdkClient: this.#state.sdkClient,
        sessionId: this.#state.sessionId,
        messageId: promptResponse.info.parentID,
        signal: abortController.signal
      });
      for (const event of diffProjection.events) {
        await input.onMessage(event);
      }

      const todos = await fetchOpenCodeTodoSnapshot({
        sdkClient: this.#state.sdkClient,
        sessionId: this.#state.sessionId,
        signal: abortController.signal
      });
      if (todos.length > 0) {
        await input.onMessage(
          projectOpenCodeTodoListEvent({
            sessionId: this.#state.sessionId,
            todos
          })
        );
      }

      if (completionEvent) {
        await input.onMessage(completionEvent);
      }

      if (promptResponse.info.error) {
        throw new CodexAppServerError(
          "opencode_turn_failed",
          formatOpenCodeMessageError(promptResponse.info.error),
          promptResponse.info.error
        );
      }

      return {
        sessionId: this.#state.sessionId,
        threadId: this.#state.sessionId,
        turnId
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        try {
          await this.#state.sdkClient.session.abort(
            {
              sessionID: this.#state.sessionId
            },
            {
              throwOnError: true,
              responseStyle: "data"
            }
          );
        } catch {
          // Ignore abort follow-up failures; the original timeout error is primary.
        }

        throw new CodexAppServerError("turn_aborted", error.message, error);
      }

      if (error instanceof CodexAppServerError) {
        throw error;
      }

      throw new CodexAppServerError(
        "opencode_turn_failed",
        error instanceof Error ? error.message : String(error),
        error
      );
    } finally {
      clearTimeout(timeoutId);
      if (this.#state.activeAbortController === abortController) {
        this.#state.activeAbortController = null;
      }
    }
  }
}

async function startOpenCodeServer(input: {
  launchTarget: CodexAppServerSession["launchTarget"];
  env: Record<string, string>;
  logger: CodexAppServerLogger;
}): Promise<{
  process: ChildProcessWithoutNullStreams;
  baseUrl: string;
}> {
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
      throw new CodexAppServerError(
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
  throw new CodexAppServerError(
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
    throw new CodexAppServerError(
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

function buildOpenCodePromptModel(
  session: CodexAppServerSession
): {
  providerID: string;
  modelID: string;
} | undefined {
  if (!session.providerId) {
    return undefined;
  }

  return {
    providerID: session.providerId,
    modelID: session.model
  };
}

async function fetchOpenCodeTodoSnapshot(input: {
  sdkClient: OpencodeClient;
  sessionId: string;
  signal: AbortSignal;
}) {
  const response = await input.sdkClient.session.todo(
    {
      sessionID: input.sessionId
    },
    {
      signal: input.signal,
      throwOnError: true,
      responseStyle: "data"
    }
  );

  return unwrapData(response, "OpenCode session.todo");
}

async function fetchOpenCodeSessionDiff(input: {
  sdkClient: OpencodeClient;
  sessionId: string;
  messageId: string;
  signal: AbortSignal;
}) {
  try {
    const diff = await input.sdkClient.session.diff(
      {
        sessionID: input.sessionId,
        messageID: input.messageId
      },
      {
        signal: input.signal,
        throwOnError: true,
        responseStyle: "data"
      }
    );
    const diffData = unwrapData(diff, "OpenCode session.diff");

    return projectOpenCodeSessionDiff({
      sessionId: input.sessionId,
      diffs: diffData
    });
  } catch {
    return {
      events: [],
      losses: []
    };
  }
}

function formatOpenCodeMessageError(error: unknown): string {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return "OpenCode assistant response failed.";
  }

  const record = error as Record<string, unknown>;
  const name =
    typeof record.name === "string" && record.name.trim() !== ""
      ? record.name
      : "OpenCodeError";
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  const message =
    data && typeof data.message === "string" && data.message.trim() !== ""
      ? data.message
      : null;

  return message ? `${name}: ${message}` : `${name}: assistant response failed.`;
}

function unwrapData<T>(
  value: T | {
    data: T;
  },
  label: string
): T {
  if (value && typeof value === "object" && "data" in value) {
    return value.data;
  }

  if (value === undefined) {
    throw new CodexAppServerError(
      "opencode_invalid_response",
      `${label} did not return data.`
    );
  }

  return value;
}
