import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  Codex,
  type ApprovalMode,
  type ModelReasoningEffort,
  type SandboxMode,
  type Thread,
  type ThreadEvent
} from "@openai/codex-sdk";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  ensureWorkspaceCwd,
  resolveCodexSdkLaunchSettings
} from "./codex-app-server-launch.js";
import {
  CodexAppServerError,
  type CodexAppServerLogger,
  type CodexAppServerSession,
  type CodexAppServerSessionClient,
  type CodexAppServerTurnResult
} from "./codex-app-server-types.js";

const sdkWrapperPath = path.join(tmpdir(), "symphony-codex-sdk-wrapper.sh");

type SdkSessionState = {
  thread: Thread;
  threadId: string | null;
  turnSequence: number;
  activeAbortController: AbortController | null;
};

export class CodexSdkClient implements CodexAppServerSessionClient {
  readonly #state: SdkSessionState;

  constructor(state: SdkSessionState) {
    this.#state = state;
  }

  static async startSession(input: {
    launchTarget: CodexAppServerSession["launchTarget"];
    env: Record<string, string>;
    hostCommandEnvSource: Record<string, string | undefined>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: CodexAppServerLogger;
  }): Promise<CodexAppServerSession> {
    const hostLaunchPath = await ensureWorkspaceCwd(
      input.launchTarget.hostLaunchPath,
      input.runtimePolicy.workspace.root
    );
    const launchSettings = resolveCodexSdkLaunchSettings(
      input.runtimePolicy.codex.command,
      input.issue
    );
    const wrapperPath = await ensureSdkWrapperScript();
    const codex = new Codex({
      codexPathOverride: wrapperPath,
      env: {
        ...filterStringEnv(input.hostCommandEnvSource),
        ...input.env,
        SYMPHONY_CODEX_CONTAINER_NAME: input.launchTarget.containerName,
        SYMPHONY_CODEX_CONTAINER_SHELL: input.launchTarget.shell,
        SYMPHONY_CODEX_CONTAINER_WORKDIR: input.launchTarget.runtimeWorkspacePath,
        SYMPHONY_CODEX_EXECUTABLE: launchSettings.executable,
        SYMPHONY_CODEX_CONTAINER_ENV_KEYS: Object.keys(input.env).join(":")
      }
    });
    const state: SdkSessionState = {
      thread: codex.startThread({
        model: launchSettings.model,
        approvalPolicy: normalizeApprovalMode(input.runtimePolicy.codex.approvalPolicy),
        sandboxMode: normalizeSandboxMode(input.runtimePolicy.codex.threadSandbox),
        workingDirectory: input.launchTarget.runtimeWorkspacePath,
        modelReasoningEffort: normalizeReasoningEffort(
          launchSettings.reasoningEffort
        ),
        networkAccessEnabled: inferNetworkAccessEnabled(
          input.runtimePolicy.codex.turnSandboxPolicy
        )
      }),
      threadId: null,
      turnSequence: 0,
      activeAbortController: null
    };

    input.logger.debug("Started Codex SDK thread transport.", {
      hostLaunchPath,
      runtimeWorkspacePath: input.launchTarget.runtimeWorkspacePath,
      executable: launchSettings.executable,
      model: launchSettings.model,
      reasoningEffort: launchSettings.reasoningEffort
    });

    return {
      client: new CodexSdkClient(state),
      threadId: null,
      workspacePath: input.launchTarget.runtimeWorkspacePath,
      hostLaunchPath,
      hostWorkspacePath: input.launchTarget.hostWorkspacePath,
      launchTarget: input.launchTarget,
      issue: input.issue,
      processId: null,
      autoApproveRequests: input.runtimePolicy.codex.approvalPolicy === "never",
      approvalPolicy: input.runtimePolicy.codex.approvalPolicy,
      model: launchSettings.model,
      reasoningEffort: launchSettings.reasoningEffort
    };
  }

  close(): void {
    this.#state.activeAbortController?.abort();
    this.#state.activeAbortController = null;
  }

  async runTurn(
    session: CodexAppServerSession,
    input: Parameters<CodexAppServerSessionClient["runTurn"]>[1]
  ): Promise<CodexAppServerTurnResult> {
    const turnSequence = this.#state.turnSequence + 1;
    this.#state.turnSequence = turnSequence;

    const turnId = `sdk-turn-${turnSequence}`;
    const abortController = new AbortController();
    this.#state.activeAbortController = abortController;

    let threadId = this.#state.threadId ?? this.#state.thread.id ?? session.threadId;
    let sessionStarted = false;
    let sawCompletion = false;

    const emitSessionStarted = async (): Promise<void> => {
      if (sessionStarted || !threadId) {
        return;
      }

      sessionStarted = true;
      this.#state.threadId = threadId;
      await input.onMessage({
        event: "session_started",
        session_id: `${threadId}-${turnId}`,
        thread_id: threadId,
        turn_id: turnId,
        codex_app_server_pid: null,
        model: session.model,
        reasoning_effort: session.reasoningEffort
      });
    };

    try {
      const { events } = await this.#state.thread.runStreamed(input.prompt, {
        signal: abortController.signal
      });

      if (threadId) {
        await emitSessionStarted();
      }

      for await (const event of events) {
        if (event.type === "thread.started") {
          threadId = event.thread_id;
          await emitSessionStarted();
        }

        await input.onMessage(
          buildSdkEventPayload({
            event,
            threadId,
            turnId,
            sessionId:
              threadId === null ? `pending-${turnId}` : `${threadId}-${turnId}`
          })
        );

        if (event.type === "turn.completed") {
          sawCompletion = true;
        } else if (event.type === "turn.failed") {
          throw new CodexAppServerError(
            "turn_failed",
            event.error.message,
            event
          );
        } else if (event.type === "error") {
          throw new CodexAppServerError("stream_error", event.message, event);
        }
      }

      if (!sawCompletion) {
        throw new CodexAppServerError(
          "turn_failed",
          "Codex turn exited without a completed event."
        );
      }

      const resolvedThreadId =
        threadId ?? this.#state.thread.id ?? this.#state.threadId;
      if (!resolvedThreadId) {
        throw new CodexAppServerError(
          "invalid_thread_payload",
          "Codex SDK turn completed without a thread id."
        );
      }

      this.#state.threadId = resolvedThreadId;

      return {
        sessionId: `${resolvedThreadId}-${turnId}`,
        threadId: resolvedThreadId,
        turnId
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new CodexAppServerError("turn_aborted", error.message, error);
      }

      if (
        !sessionStarted &&
        error instanceof Error &&
        !(error instanceof CodexAppServerError)
      ) {
        throw new CodexAppServerError("thread_start_failed", error.message, error);
      }

      throw error;
    } finally {
      if (this.#state.activeAbortController === abortController) {
        this.#state.activeAbortController = null;
      }
    }
  }
}

async function ensureSdkWrapperScript(): Promise<string> {
  await mkdir(path.dirname(sdkWrapperPath), {
    recursive: true
  });
  await writeFile(
    sdkWrapperPath,
    `#!/usr/bin/env bash
set -euo pipefail

: "\${SYMPHONY_CODEX_CONTAINER_NAME:?SYMPHONY_CODEX_CONTAINER_NAME is required}"
: "\${SYMPHONY_CODEX_EXECUTABLE:?SYMPHONY_CODEX_EXECUTABLE is required}"

docker_args=(exec -i)
if [[ -n "\${SYMPHONY_CODEX_CONTAINER_WORKDIR:-}" ]]; then
  docker_args+=(--workdir "\${SYMPHONY_CODEX_CONTAINER_WORKDIR}")
fi
container_env_keys="\${SYMPHONY_CODEX_CONTAINER_ENV_KEYS-}"
if [[ -n "\${container_env_keys}" ]]; then
  IFS=':' read -r -a env_keys <<< "\${container_env_keys}"
  for key in "\${env_keys[@]}"; do
    if [[ -n "\${key}" && -n "\${!key:-}" ]]; then
      docker_args+=(--env "\${key}=\${!key}")
    fi
  done
fi

docker_args+=(
  "\${SYMPHONY_CODEX_CONTAINER_NAME}"
  "\${SYMPHONY_CODEX_CONTAINER_SHELL:-sh}"
  -lc
  'exec "$0" "$@"'
  "\${SYMPHONY_CODEX_EXECUTABLE}"
)
docker_args+=("$@")

exec docker "\${docker_args[@]}"
`,
    "utf8"
  );
  await chmod(sdkWrapperPath, 0o755);
  return sdkWrapperPath;
}

function filterStringEnv(
  source: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function normalizeApprovalMode(value: string | Record<string, unknown>): ApprovalMode {
  if (value === "on-request" || value === "on-failure" || value === "untrusted") {
    return value;
  }

  return "never";
}

function normalizeSandboxMode(value: string): SandboxMode {
  if (
    value === "read-only" ||
    value === "workspace-write" ||
    value === "danger-full-access"
  ) {
    return value;
  }

  return "danger-full-access";
}

function normalizeReasoningEffort(value: string): ModelReasoningEffort {
  if (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return value;
  }

  return "xhigh";
}

function inferNetworkAccessEnabled(
  sandboxPolicy: Record<string, unknown> | null
): boolean | undefined {
  if (!sandboxPolicy || typeof sandboxPolicy.network_access !== "boolean") {
    return undefined;
  }

  return sandboxPolicy.network_access;
}

function buildSdkEventPayload(input: {
  event: ThreadEvent;
  threadId: string | null;
  turnId: string;
  sessionId: string;
}): Record<string, unknown> {
  return {
    event: input.event.type,
    session_id: input.sessionId,
    thread_id: input.threadId,
    turn_id: input.turnId,
    codex_app_server_pid: null,
    ...input.event
  };
}
