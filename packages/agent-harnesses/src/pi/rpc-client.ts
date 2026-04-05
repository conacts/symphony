import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ensureWorkspaceCwd } from "../codex/launch.js";
import {
  attachLineBuffer,
  getRecord,
  getString,
  logNonJsonStreamLine,
  protocolMessageCandidate,
  safeJsonParse
} from "../shared/protocol.js";
import {
  type HarnessLaunchSessionInput,
  HarnessSessionError,
  type HarnessSession,
  type HarnessSessionClient,
  type HarnessTurnResult
} from "../shared/session-types.js";
import {
  piAnalyticsAdapter,
  type PiAnalyticsProjection
} from "./analytics-adapter.js";

type PendingResponse = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type PiRpcState = {
  child: ChildProcessWithoutNullStreams;
  pendingResponses: Map<string, PendingResponse>;
  queuedEvents: Record<string, unknown>[];
  eventWaiters: Array<(event: Record<string, unknown>) => void>;
  nextRequestId: number;
  threadStartedEmitted: boolean;
  turnSequence: number;
  closed: boolean;
};

export class PiRpcClient implements HarnessSessionClient {
  readonly #state: PiRpcState;

  constructor(state: PiRpcState) {
    this.#state = state;
  }

  static async startSession(input: HarnessLaunchSessionInput): Promise<HarnessSession> {
    if (input.launchTarget.kind !== "container") {
      throw new HarnessSessionError(
        "pi_launch_unsupported",
        "Pi runtime currently requires a container-backed launch target."
      );
    }

    const hostLaunchPath = await ensureWorkspaceCwd(
      input.launchTarget.hostLaunchPath,
      input.runtimePolicy.workspace.root
    );
    const launchSettings = resolvePiLaunchSettings(input);
    const child = spawn("docker", buildPiRpcSpawnArgs(input, launchSettings), {
      cwd: hostLaunchPath,
      env: filterStringEnv(input.hostCommandEnvSource ?? {}),
      stdio: "pipe"
    });

    const state: PiRpcState = {
      child,
      pendingResponses: new Map(),
      queuedEvents: [],
      eventWaiters: [],
      nextRequestId: 1,
      threadStartedEmitted: false,
      turnSequence: 0,
      closed: false
    };
    const client = new PiRpcClient(state);
    client.#attachProcessHandlers(input.logger);

    try {
      const stateResponse = await client.#sendCommand({
        type: "get_state"
      });
      const statePayload = getRecord(stateResponse, "data");
      const sessionId = getString(statePayload, "sessionId");
      const modelRecord = getRecord(statePayload, "model");

      if (!sessionId) {
        throw new HarnessSessionError(
          "pi_session_start_failed",
          "Pi RPC get_state response did not include a session id.",
          stateResponse
        );
      }

      return {
        client,
        threadId: sessionId,
        workspacePath: input.launchTarget.runtimeWorkspacePath,
        hostLaunchPath,
        hostWorkspacePath: input.launchTarget.hostWorkspacePath,
        launchTarget: input.launchTarget,
        issue: input.issue,
        processId: child.pid ? String(child.pid) : null,
        autoApproveRequests: true,
        approvalPolicy: "never",
        model: getString(modelRecord, "id") ?? launchSettings.model,
        reasoningEffort: launchSettings.reasoningEffort,
        profile: null,
        providerId: getString(modelRecord, "provider") ?? launchSettings.providerId,
        providerName:
          input.runtimePolicy.codex.provider?.name ??
          getString(modelRecord, "provider") ??
          launchSettings.providerName
      };
    } catch (error) {
      client.close();
      if (error instanceof HarnessSessionError) {
        throw error;
      }
      throw new HarnessSessionError(
        "pi_session_start_failed",
        error instanceof Error ? error.message : String(error),
        error
      );
    }
  }

  close(): void {
    if (this.#state.closed) {
      return;
    }

    this.#state.closed = true;
    this.#state.child.kill("SIGTERM");
  }

  async runTurn(
    session: HarnessSession,
    input: Parameters<HarnessSessionClient["runTurn"]>[1]
  ): Promise<HarnessTurnResult> {
    const turnSequence = this.#state.turnSequence + 1;
    this.#state.turnSequence = turnSequence;
    const turnId = `pi-turn-${turnSequence}`;

    if (!this.#state.threadStartedEmitted && session.threadId) {
      this.#state.threadStartedEmitted = true;
      await input.onMessage({
        message: {
          type: "thread.started",
          thread_id: session.threadId
        }
      });
    }

    const promptResponse = await this.#sendCommand({
      type: "prompt",
      message: input.prompt
    });

    if (promptResponse.success !== true) {
      throw new HarnessSessionError(
        "pi_turn_start_failed",
        getString(promptResponse, "error") ?? "Pi RPC prompt command failed.",
        promptResponse
      );
    }

    while (true) {
      const event = await this.#awaitEvent(input.turnTimeoutMs);
      const eventType = getString(event, "type");

      if (eventType === "process_exit") {
        throw new HarnessSessionError(
          "pi_turn_failed",
          getString(event, "reason") ?? "Pi RPC process exited unexpectedly.",
          event
        );
      }

      if (eventType === "extension_ui_request") {
        await input.onMessage({
          message: {
            event: "turn_input_required",
            request: event
          }
        });
        throw new HarnessSessionError(
          "turn_input_required",
          "Pi requested interactive operator input during a non-interactive session.",
          event
        );
      }

      const projection = projectPiEvent(event);
      if (projection) {
        await emitProjection(input.onMessage, projection, event);
      }

      if (eventType === "agent_end") {
        const threadId = session.threadId;
        if (!threadId) {
          throw new HarnessSessionError(
            "invalid_thread_payload",
            "Pi RPC session completed without a session id."
          );
        }

        return {
          sessionId: threadId,
          threadId,
          turnId
        };
      }
    }
  }

  #attachProcessHandlers(
    logger: HarnessLaunchSessionInput["logger"]
  ): void {
    attachLineBuffer(this.#state.child.stdout, (line) => {
      this.#handleLine(line, logger, "stdout");
    });
    attachLineBuffer(this.#state.child.stderr, (line) => {
      this.#handleLine(line, logger, "stderr");
    });

    this.#state.child.once("exit", (code, signal) => {
      this.#state.closed = true;
      const reason = signal ? `signal:${signal}` : `code:${code ?? "unknown"}`;

      for (const [, pending] of this.#state.pendingResponses) {
        pending.reject(new Error(`Pi RPC process exited (${reason}).`));
      }
      this.#state.pendingResponses.clear();

      this.#enqueueEvent({
        type: "process_exit",
        reason
      });
    });
  }

  #handleLine(
    line: string,
    logger: HarnessLaunchSessionInput["logger"],
    stream: "stdout" | "stderr"
  ): void {
    if (!protocolMessageCandidate(line)) {
      logNonJsonStreamLine(logger, line, stream);
      return;
    }

    const record = safeJsonParse(line);
    if (!record) {
      logNonJsonStreamLine(logger, line, stream);
      return;
    }

    if (getString(record, "type") === "response") {
      const responseId = getString(record, "id");
      if (responseId) {
        const pending = this.#state.pendingResponses.get(responseId);
        if (pending) {
          this.#state.pendingResponses.delete(responseId);
          if (record.success === false) {
            pending.reject(
              new Error(getString(record, "error") ?? "Pi RPC command failed.")
            );
          } else {
            pending.resolve(record);
          }
          return;
        }
      }
    }

    this.#enqueueEvent(record);
  }

  #enqueueEvent(event: Record<string, unknown>): void {
    const waiter = this.#state.eventWaiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }

    this.#state.queuedEvents.push(event);
  }

  async #sendCommand(
    command: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const id = String(this.#state.nextRequestId++);
    const payload = {
      id,
      ...command
    };

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      this.#state.pendingResponses.set(id, {
        resolve,
        reject
      });
      this.#state.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          this.#state.pendingResponses.delete(id);
          reject(error);
        }
      });
    });
  }

  async #awaitEvent(timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.#state.queuedEvents.length > 0) {
      return this.#state.queuedEvents.shift()!;
    }

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.#state.eventWaiters.indexOf(waiter);
        if (index >= 0) {
          this.#state.eventWaiters.splice(index, 1);
        }
        reject(
          new HarnessSessionError(
            "pi_turn_timeout",
            `Timed out waiting for Pi RPC events after ${timeoutMs}ms.`
          )
        );
      }, timeoutMs);

      const waiter = (event: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(event);
      };

      this.#state.eventWaiters.push(waiter);
    });
  }
}

function resolvePiLaunchSettings(
  input: HarnessLaunchSessionInput
): {
  model: string;
  reasoningEffort: string;
  providerId: string | null;
  providerName: string | null;
} {
  return {
    model: input.runtimePolicy.codex.defaultModel ?? "xiaomi/mimo-v2-pro",
    reasoningEffort: normalizePiThinkingLevel(
      input.runtimePolicy.codex.defaultReasoningEffort ?? "medium"
    ),
    providerId: input.runtimePolicy.codex.provider?.id ?? null,
    providerName: input.runtimePolicy.codex.provider?.name ?? null
  };
}

function buildPiRpcSpawnArgs(
  input: HarnessLaunchSessionInput,
  launchSettings: ReturnType<typeof resolvePiLaunchSettings>
): string[] {
  return [
    "exec",
    "-i",
    ...Object.entries(input.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    "--workdir",
    input.launchTarget.runtimeWorkspacePath,
    input.launchTarget.containerName,
    "pi",
    "--mode",
    "rpc",
    ...(launchSettings.providerId && !launchSettings.model.includes("/")
      ? ["--provider", launchSettings.providerId]
      : []),
    "--model",
    launchSettings.model,
    "--thinking",
    launchSettings.reasoningEffort,
    "--no-session"
  ];
}

function projectPiEvent(
  event: Record<string, unknown>
): PiAnalyticsProjection | null {
  const type = getString(event, "type");

  switch (type) {
    case "turn_start":
      return piAnalyticsAdapter.projectTurnStartEvent();
    case "message_end":
      return piAnalyticsAdapter.projectMessageEndEvent({
        event
      });
    case "tool_execution_start":
      return piAnalyticsAdapter.projectToolExecutionStartEvent({
        event
      });
    case "tool_execution_update":
      return piAnalyticsAdapter.projectToolExecutionUpdateEvent({
        event
      });
    case "tool_execution_end":
      return piAnalyticsAdapter.projectToolExecutionEndEvent({
        event
      });
    case "turn_end":
      return piAnalyticsAdapter.projectTurnEndEvent({
        event
      });
    default:
      return null;
  }
}

async function emitProjection(
  onMessage: Parameters<HarnessSessionClient["runTurn"]>[1]["onMessage"],
  projection: PiAnalyticsProjection,
  rawPayload: unknown
): Promise<void> {
  if (projection.events.length === 0) {
    return;
  }

  for (const [index, event] of projection.events.entries()) {
    const isLast = index === projection.events.length - 1;
    await onMessage({
      message: event,
      rawPayload: isLast ? rawPayload : undefined,
      projectionLosses: isLast ? projection.losses : undefined
    });
  }
}

function normalizePiThinkingLevel(value: string): string {
  if (["off", "minimal", "low", "medium", "high", "xhigh"].includes(value)) {
    return value;
  }

  return "medium";
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
