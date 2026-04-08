import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  buildAgentAppServerSpawnSpec,
  ensureWorkspaceCwd,
  resolveAgentLaunchSettings,
  wrapSessionError
} from "./agent-app-server-launch.js";
import {
  attachLineBuffer,
  buildApprovalAnswers,
  buildUnavailableAnswers,
  getNumber,
  getRecord,
  getString,
  getStringPath,
  logNonJsonStreamLine,
  needsInput,
  nonInteractiveToolInputAnswer,
  normalizeToolResult,
  protocolMessageCandidate,
  safeJsonParse,
  toolCallArguments,
  toolCallName
} from "./agent-app-server-protocol.js";
import {
  HarnessSessionError,
  resolveHarnessModelRuntimePolicy,
  type HarnessControlMessageResult as ControlMessageResult,
  type HarnessSession as AppServerSession,
  type HarnessSessionLogger as AppServerLogger,
  type HarnessToolExecutor as AppServerToolExecutor,
  type HarnessTurnResult as AppServerTurnResult
} from "@symphony/agent-harnesses";

const initializeRequestId = 1;
const threadStartRequestId = 2;
const turnStartRequestId = 3;

export class AgentAppServerClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pendingResponses = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  readonly #queuedMessages: Record<string, unknown>[] = [];
  readonly #messageWaiters: Array<(message: Record<string, unknown>) => void> = [];
  readonly #requestTimeoutMs: number;
  readonly #logger: AppServerLogger;
  readonly processId: string | null;
  #closed = false;

  constructor(input: {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    readTimeoutMs: number;
    logger: AppServerLogger;
  }) {
    this.#requestTimeoutMs = input.readTimeoutMs;
    this.#logger = input.logger;

    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: "pipe"
    });
    this.#child = child;
    this.processId = child.pid ? String(child.pid) : null;

    attachLineBuffer(child.stdout, (line) => {
      this.#handleLine(line, "stdout");
    });
    attachLineBuffer(child.stderr, (line) => {
      this.#handleLine(line, "stderr");
    });

    child.once("exit", (code, signal) => {
      const reason = signal ? `signal:${signal}` : `code:${code ?? "unknown"}`;
      this.#closed = true;

      for (const [, pending] of this.#pendingResponses) {
        pending.reject(new Error(`Agent app-server exited (${reason}).`));
      }
      this.#pendingResponses.clear();

      while (this.#messageWaiters.length > 0) {
        const waiter = this.#messageWaiters.shift();
        waiter?.({
          method: "port/exited",
          params: {
            reason
          }
        });
      }
    });
  }

  static async startSession(input: {
    launchTarget: Parameters<typeof buildAgentAppServerSpawnSpec>[0]["launchTarget"];
    env: Record<string, string>;
    hostCommandEnvSource: Record<string, string | undefined>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: AppServerLogger;
  }): Promise<AppServerSession> {
    const hostLaunchPath = await ensureWorkspaceCwd(
      input.launchTarget.hostLaunchPath,
      input.runtimePolicy.workspace.root
    );
    const modelPolicy = resolveHarnessModelRuntimePolicy(input.runtimePolicy);
    const launchSettings = resolveAgentLaunchSettings(
      input.runtimePolicy.agentRuntime.command,
      input.issue,
      {
        model: modelPolicy.defaultModel,
        reasoningEffort: modelPolicy.defaultReasoningEffort,
        defaultPreset: modelPolicy.defaultPreset,
        presets: modelPolicy.presets,
        profile: modelPolicy.profile,
        providerId: modelPolicy.provider?.id ?? null,
        providerName: modelPolicy.provider?.name ?? null
      }
    );
    const spawnSpec = buildAgentAppServerSpawnSpec({
      launchTarget: input.launchTarget,
      command: launchSettings.command,
      env: input.env,
      hostCommandEnvSource: input.hostCommandEnvSource
    });
    const client = new AgentAppServerClient({
      command: spawnSpec.command,
      args: spawnSpec.args,
      cwd: hostLaunchPath,
      env: spawnSpec.env,
      readTimeoutMs: input.runtimePolicy.agentRuntime.readTimeoutMs,
      logger: input.logger
    });

    try {
      await client.sendRequest(initializeRequestId, "initialize", {
        capabilities: {
          experimentalApi: true
        },
        clientInfo: {
          name: "symphony-orchestrator",
          title: "Symphony Orchestrator",
          version: "0.1.0"
        }
      });
      client.sendNotification("initialized", {});

      const threadResponse = await client.sendRequest(
        threadStartRequestId,
        "thread/start",
        {
          approvalPolicy: input.runtimePolicy.agentRuntime.approvalPolicy,
          sandbox: input.runtimePolicy.agentRuntime.threadSandbox,
          cwd: spawnSpec.runtimeWorkspacePath
        }
      );
      const threadId =
        getStringPath(threadResponse, ["thread", "id"]) ??
        getStringPath(threadResponse, ["id"]);

      if (!threadId) {
        throw new HarnessSessionError(
          "invalid_thread_payload",
          "Agent thread/start response did not include a thread id.",
          threadResponse
        );
      }

      return {
        client,
        threadId,
        workspacePath: spawnSpec.runtimeWorkspacePath,
        hostLaunchPath,
        hostWorkspacePath: input.launchTarget.hostWorkspacePath,
        launchTarget: input.launchTarget,
        issue: input.issue,
        processId: client.processId,
        autoApproveRequests: input.runtimePolicy.agentRuntime.approvalPolicy === "never",
        approvalPolicy: input.runtimePolicy.agentRuntime.approvalPolicy,
        model: launchSettings.model,
        reasoningEffort: launchSettings.reasoningEffort,
        profile: launchSettings.profile,
        providerId: launchSettings.providerId,
        providerName: launchSettings.providerName
      };
    } catch (error) {
      client.close();
      throw wrapSessionError(error);
    }
  }

  async runTurn(
    session: AppServerSession,
    input: {
      prompt: string;
      title: string;
      sandboxPolicy: Record<string, unknown> | null;
      toolExecutor: AppServerToolExecutor;
      onMessage: (update: {
        message: Record<string, unknown>;
        rawPayload?: unknown;
        projectionLosses?: unknown[] | null;
      }) => Promise<void> | void;
      turnTimeoutMs: number;
    }
  ): Promise<AppServerTurnResult> {
    const turnResponse = await this.sendRequest(turnStartRequestId, "turn/start", {
      threadId: session.threadId,
      input: [
        {
          type: "text",
          text: input.prompt
        }
      ],
      cwd: session.workspacePath,
      title: input.title,
      approvalPolicy: session.approvalPolicy,
      sandboxPolicy: input.sandboxPolicy
    });

    const turnId =
      getStringPath(turnResponse, ["turn", "id"]) ??
      getStringPath(turnResponse, ["id"]);

    if (!turnId) {
      throw new HarnessSessionError(
        "invalid_turn_payload",
        "Agent turn/start response did not include a turn id.",
        turnResponse
      );
    }

    const sessionId = `${session.threadId}-${turnId}`;

    await input.onMessage({
      message: {
        event: "session_started",
        session_id: sessionId,
        thread_id: session.threadId,
        turn_id: turnId,
        agent_app_server_pid: session.processId,
        model: session.model,
        reasoning_effort: session.reasoningEffort
      }
    });

    while (true) {
      const message = await this.awaitMessage(input.turnTimeoutMs);
      const explicitEvent = getString(message, "event");
      const method = getString(message, "method");

      if (explicitEvent && !method) {
        await input.onMessage({
          message
        });
        continue;
      }

      if (!method) {
        continue;
      }

      const handled = await this.#maybeHandleControlRequest(
        session,
        message,
        input.toolExecutor,
        input.onMessage
      );

      if (handled === "continue") {
        continue;
      }

      if (handled === "approval_required") {
        await input.onMessage({
          message: {
            event: "approval_required",
            payload: message,
            raw: getString(message, "raw")
          }
        });

        throw new HarnessSessionError(
          "approval_required",
          "Agent approval request requires operator input.",
          message
        );
      }

      if (handled === "input_required") {
        await input.onMessage({
          message: {
            event: "turn_input_required",
            payload: message,
            raw: getString(message, "raw")
          }
        });

        throw new HarnessSessionError(
          "turn_input_required",
          "Agent turn requires operator input.",
          message
        );
      }

      if (method === "port/exited") {
        throw new HarnessSessionError(
          "port_exited",
          `Agent app-server exited (${JSON.stringify(getRecord(message, "params") ?? {})}).`,
          message
        );
      }

      if (needsInput(method, message)) {
        await input.onMessage({
          message: {
            event: "turn_input_required",
            payload: message,
            raw: getString(message, "raw")
          }
        });

        throw new HarnessSessionError(
          "turn_input_required",
          "Agent turn requires operator input.",
          message
        );
      }

      if (method === "turn/completed") {
        await input.onMessage({
          message: {
            event: "turn_completed",
            ...message
          }
        });

        return {
          sessionId,
          threadId: session.threadId ?? "",
          turnId
        };
      }

      if (method === "turn/failed") {
        await input.onMessage({
          message: {
            event: "turn_failed",
            ...message
          }
        });
        throw new HarnessSessionError("turn_failed", "Agent turn failed.", message);
      }

      if (method === "turn/cancelled") {
        await input.onMessage({
          message: {
            event: "turn_cancelled",
            ...message
          }
        });
        throw new HarnessSessionError(
          "turn_cancelled",
          "Agent turn was cancelled.",
          message
        );
      }

      await input.onMessage({
        message: {
          event: method,
          ...message
        }
      });
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#child.kill("SIGTERM");
  }

  async #maybeHandleControlRequest(
    session: AppServerSession,
    message: Record<string, unknown>,
    toolExecutor: AppServerToolExecutor,
    onMessage: (update: {
      message: Record<string, unknown>;
      rawPayload?: unknown;
      projectionLosses?: unknown[] | null;
    }) => Promise<void> | void
  ): Promise<ControlMessageResult> {
    const method = getString(message, "method");
    const id = getNumber(message, "id");
    const params = getRecord(message, "params") ?? {};
    const raw = getString(message, "raw");

    if (!method || id === null) {
      return "unhandled";
    }

    if (method === "item/tool/call") {
      const toolName = toolCallName(params);
      const argumentsPayload = toolCallArguments(params);

      try {
        const result = normalizeToolResult(
          await toolExecutor(toolName, argumentsPayload)
        );

        this.sendResponse(id, result);

        await onMessage({
          message: {
            event:
              result.success === true
                ? "tool_call_completed"
                : toolName === null
                  ? "unsupported_tool_call"
                  : "tool_call_failed",
            payload: message,
            raw
          }
        });
      } catch (error) {
        const result = normalizeToolResult({
          success: false,
          output: error instanceof Error ? error.message : String(error)
        });

        this.sendResponse(id, result);
        await onMessage({
          message: {
            event: toolName === null ? "unsupported_tool_call" : "tool_call_failed",
            payload: message,
            raw
          }
        });
      }

      return "continue";
    }

    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval"
    ) {
      if (!session.autoApproveRequests) {
        return "approval_required";
      }

      this.sendResponse(id, {
        decision: "acceptForSession"
      });
      await onMessage({
        message: {
          event: "approval_auto_approved",
          payload: message,
          raw,
          decision: "acceptForSession"
        }
      });
      return "continue";
    }

    if (method === "execCommandApproval" || method === "applyPatchApproval") {
      if (!session.autoApproveRequests) {
        return "approval_required";
      }

      this.sendResponse(id, {
        decision: "approved_for_session"
      });
      await onMessage({
        message: {
          event: "approval_auto_approved",
          payload: message,
          raw,
          decision: "approved_for_session"
        }
      });
      return "continue";
    }

    if (method === "item/tool/requestUserInput") {
      const approvalAnswers = session.autoApproveRequests
        ? buildApprovalAnswers(params)
        : null;

      if (approvalAnswers) {
        this.sendResponse(id, {
          answers: approvalAnswers.answers
        });
        await onMessage({
          message: {
            event: "approval_auto_approved",
            payload: message,
            raw,
            decision: approvalAnswers.decision
          }
        });
        return "continue";
      }

      const unavailableAnswers = buildUnavailableAnswers(params);
      if (!unavailableAnswers) {
        return "input_required";
      }

      this.sendResponse(id, {
        answers: unavailableAnswers
      });
      await onMessage({
        message: {
          event: "tool_input_auto_answered",
          payload: message,
          raw,
          answer: nonInteractiveToolInputAnswer
        }
      });
      return "continue";
    }

    if (method === "mcpServer/elicitation/request") {
      const approvalAnswers = session.autoApproveRequests
        ? buildApprovalAnswers(params)
        : null;

      if (approvalAnswers) {
        this.sendResponse(id, {
          answers: approvalAnswers.answers
        });
        await onMessage({
          message: {
            event: "approval_auto_approved",
            payload: message,
            raw,
            decision: approvalAnswers.decision
          }
        });
        return "continue";
      }

      const unavailableAnswers = buildUnavailableAnswers(params);
      if (!unavailableAnswers) {
        return "approval_required";
      }

      this.sendResponse(id, {
        answers: unavailableAnswers
      });
      await onMessage({
        message: {
          event: "tool_input_auto_answered",
          payload: message,
          raw,
          answer: nonInteractiveToolInputAnswer
        }
      });
      return "continue";
    }

    return "unhandled";
  }

  async sendRequest(
    id: number,
    method: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingResponses.delete(id);
        reject(new Error(`Timed out waiting for Agent response ${id}.`));
      }, this.#requestTimeoutMs);

      this.#pendingResponses.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      const line = JSON.stringify({
        id,
        method,
        params
      });

      this.#child.stdin.write(`${line}\n`);
    });
  }

  sendNotification(method: string, params: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  sendResponse(id: number, result: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  async awaitMessage(timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.#queuedMessages.length > 0) {
      return this.#queuedMessages.shift()!;
    }

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.#messageWaiters.indexOf(waiter);
        if (index >= 0) {
          this.#messageWaiters.splice(index, 1);
        }
        reject(new Error("Timed out waiting for Agent app-server message."));
      }, timeoutMs);

      const waiter = (message: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(message);
      };

      this.#messageWaiters.push(waiter);
    });
  }

  #handleLine(line: string, stream: "stdout" | "stderr"): void {
    const trimmed = line.trim();
    if (trimmed === "") {
      return;
    }

    const parsed = safeJsonParse(trimmed);
    if (!parsed) {
      logNonJsonStreamLine(this.#logger, trimmed, stream);

      if (protocolMessageCandidate(trimmed)) {
        this.#enqueueMessage({
          event: "malformed",
          payload: trimmed,
          raw: trimmed
        });
      }

      return;
    }

    const message = {
      ...parsed,
      raw: trimmed
    };
    const id = getNumber(parsed, "id");
    if (id !== null && !("method" in parsed)) {
      const pending = this.#pendingResponses.get(id);
      if (!pending) {
        return;
      }

      this.#pendingResponses.delete(id);

      const errorPayload = getRecord(parsed, "error");
      if (errorPayload) {
        pending.reject(new Error(JSON.stringify(errorPayload)));
        return;
      }

      pending.resolve(getRecord(parsed, "result") ?? parsed);
      return;
    }

    this.#enqueueMessage(message);
  }

  #enqueueMessage(message: Record<string, unknown>): void {
    const waiter = this.#messageWaiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }

    this.#queuedMessages.push(message);
  }
}
