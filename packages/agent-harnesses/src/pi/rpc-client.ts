import {
  getRecord,
  getString
} from "../shared/protocol.js";
import {
  type HarnessLaunchSessionInput,
  HarnessSessionError,
  type HarnessSession,
  type HarnessSessionClient,
  type HarnessTurnResult
} from "../shared/session-types.js";
import { resolveHarnessModelRuntimePolicy } from "../shared/runtime-policy.js";
import {
  piAnalyticsAdapter,
  type PiAnalyticsProjection
} from "./analytics-adapter.js";
import { decodePiRuntimeEvent } from "./event-decoder.js";
import { PiRpcProcess } from "./rpc-process.js";
import type { HarnessSessionLogger } from "../shared/session-types.js";

export class PiRpcClient implements HarnessSessionClient {
  readonly #process: PiRpcProcess;
  readonly #logger: HarnessSessionLogger;
  #threadStartedEmitted = false;
  #turnSequence = 0;

  constructor(process: PiRpcProcess, logger: HarnessSessionLogger) {
    this.#process = process;
    this.#logger = logger;
  }

  static async startSession(input: HarnessLaunchSessionInput): Promise<HarnessSession> {
    const { process, hostLaunchPath, launchSettings } =
      await PiRpcProcess.start(input);
    const client = new PiRpcClient(process, input.logger);
    const modelPolicy = resolveHarnessModelRuntimePolicy(input.runtimePolicy, "pi");

    try {
      const stateResponse = await process.sendCommand({
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
        processId: process.processId,
        autoApproveRequests: true,
        approvalPolicy: "never",
        model: getString(modelRecord, "id") ?? launchSettings.model,
        reasoningEffort: launchSettings.reasoningEffort,
        profile: null,
        providerId: getString(modelRecord, "provider") ?? launchSettings.providerId,
        providerName:
          modelPolicy.provider?.name ??
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
    this.#process.close();
  }

  async runTurn(
    session: HarnessSession,
    input: Parameters<HarnessSessionClient["runTurn"]>[1]
  ): Promise<HarnessTurnResult> {
    const turnSequence = this.#turnSequence + 1;
    this.#turnSequence = turnSequence;
    const turnId = `pi-turn-${turnSequence}`;
    let accumulatedUsage: HarnessTurnResult["usage"] = null;
    let sawQueueUpdate = false;
    let sawMeaningfulProjection = false;
    const eventTrace: PiTurnEventTraceEntry[] = [];

    if (!this.#threadStartedEmitted && session.threadId) {
      this.#threadStartedEmitted = true;
      await input.onMessage({
        message: {
          type: "thread.started",
          thread_id: session.threadId
        }
      });
    }

    const continuationState =
      turnSequence === 1 ? null : await this.#resolveContinuationCommand();
    const commandType = continuationState?.commandType ?? "prompt";
    const command: PiTurnCommand = {
      type: commandType,
      message: input.prompt
    };
    const turnContext: PiTurnFailureContext = {
      turnSequence,
      threadId: session.threadId,
      command,
      continuationState: continuationState?.state ?? null,
      eventTrace
    };
    this.#logger.debug("Dispatching Pi turn", {
      threadId: session.threadId,
      turnSequence,
      commandType,
      title: input.title,
      command,
      continuationState: continuationState?.state ?? null
    });
    const promptResponse = await this.#process.sendCommand(command);

    if (promptResponse.success !== true) {
      throw this.#buildTurnFailure(
        "pi_turn_start_failed",
        getString(promptResponse, "error") ??
          defaultPromptFailureMessage(commandType),
        turnContext,
        {
          promptResponse
        }
      );
    }

    while (true) {
      const rawEvent = await this.#process.awaitEvent(input.turnTimeoutMs);
      const event = decodePiRuntimeEvent(rawEvent);
      const eventType =
        event?.type === "unknown"
          ? event.rawType
          : event?.type ?? getString(rawEvent, "type");
      const eventSummary = summarizePiEventForDiagnostics(rawEvent, event, eventType);
      pushPiTurnEventTrace(eventTrace, eventSummary);
      this.#logger.debug("Received Pi raw event", {
        threadId: session.threadId,
        turnSequence,
        event: eventSummary
      });

      if (event?.type === "turn_end") {
        const usage = piAnalyticsAdapter.extractTurnUsage({
          event
        });
        if (usage) {
          accumulatedUsage = accumulatedUsage
            ? {
                input_tokens: accumulatedUsage.input_tokens + usage.input_tokens,
                cached_input_tokens:
                  accumulatedUsage.cached_input_tokens + usage.cached_input_tokens,
                output_tokens: accumulatedUsage.output_tokens + usage.output_tokens
              }
            : usage;
        }

        await input.onMessage({
          message: {
            event: "turn_end"
          },
          rawPayload: rawEvent
        });
      }

      if (event?.type === "queue_update") {
        sawQueueUpdate = true;
      }

      if (eventType === "process_exit") {
        throw this.#buildTurnFailure(
          "pi_turn_failed",
          (event && event.type === "process_exit" ? event.reason : null) ??
            "Pi RPC process exited unexpectedly.",
          turnContext,
          {
            failureEvent: eventSummary,
          }
        );
      }

      if (eventType === "extension_ui_request") {
        await input.onMessage({
          message: {
            event: "turn_input_required",
            request: rawEvent
          }
        });
        throw this.#buildTurnFailure(
          "turn_input_required",
          "Pi requested interactive operator input during a non-interactive session.",
          turnContext,
          {
            failureEvent: eventSummary,
          }
        );
      }

      const projection = event
        ? piAnalyticsAdapter.projectRuntimeEvent({
            event
          })
        : null;
      if (projection) {
        eventSummary.projectionEventTypes = projection.events.map(
          (projectedEvent) => projectedEvent.type
        );
        eventSummary.projectionLossKinds = projection.losses.map((loss) => loss.kind);
      }
      if (projection) {
        if (
          projection.events.some((projectedEvent) => {
            if (projectedEvent.type !== "item.started" &&
                projectedEvent.type !== "item.updated" &&
                projectedEvent.type !== "item.completed") {
              return true;
            }

            const item = "item" in projectedEvent ? projectedEvent.item : null;
            return item?.type !== "todo_list";
          })
        ) {
          sawMeaningfulProjection = true;
        }
        await emitProjection(input.onMessage, projection, rawEvent);
      }

      if (eventType === "agent_end") {
        if (!accumulatedUsage && !sawMeaningfulProjection) {
          throw this.#buildTurnFailure(
            sawQueueUpdate ? "pi_queue_only_turn" : "pi_no_progress_turn",
            sawQueueUpdate
              ? "Pi ended the turn after emitting only queue/todo updates with no measurable work."
              : "Pi ended the turn without usage or meaningful projected work.",
            turnContext,
            {
              failureEvent: eventSummary,
            }
          );
        }

        const threadId = session.threadId;
        if (!threadId) {
          throw this.#buildTurnFailure(
            "invalid_thread_payload",
            "Pi RPC session completed without a session id.",
            turnContext,
            {
              failureEvent: eventSummary,
            }
          );
        }

        return {
          sessionId: threadId,
          threadId,
          turnId,
          usage: accumulatedUsage
        };
      }
    }
  }

  async #resolveContinuationCommand(): Promise<{
    commandType: "prompt" | "follow_up";
    state: {
      isStreaming: boolean;
      pendingMessageCount: number;
      messageCount: number;
    };
  }> {
    const stateResponse = await this.#process.sendCommand({
      type: "get_state"
    });
    const statePayload = getRecord(stateResponse, "data");
    const isStreaming = statePayload?.isStreaming === true;
    const pendingMessageCount = Number(statePayload?.pendingMessageCount ?? 0);
    const messageCount = Number(statePayload?.messageCount ?? 0);
    const commandType =
      isStreaming || pendingMessageCount > 0 ? "follow_up" : "prompt";
    const state = {
      isStreaming,
      pendingMessageCount,
      messageCount
    };

    this.#logger.debug("Resolved Pi continuation command", {
      ...state,
      commandType
    });

    return {
      commandType,
      state
    };
  }

  #buildTurnFailure(
    code: string,
    message: string,
    context: PiTurnFailureContext,
    extras: {
      failureEvent?: PiTurnEventTraceEntry;
      promptResponse?: unknown;
    } = {}
  ): HarnessSessionError {
    return new HarnessSessionError(
      code,
      message,
      buildPiTurnDiagnostics({
        ...context,
        ...extras,
        processDiagnostics: this.#process.diagnosticsSnapshot()
      })
    );
  }
}

type PiTurnCommand =
  | {
      type: "prompt";
      message: string;
    }
  | {
      type: "follow_up";
      message: string;
    };

type PiTurnContinuationState = {
  isStreaming: boolean;
  pendingMessageCount: number;
  messageCount: number;
};

type PiTurnFailureContext = {
  turnSequence: number;
  threadId: string | null;
  command: PiTurnCommand;
  continuationState: PiTurnContinuationState | null;
  eventTrace: PiTurnEventTraceEntry[];
};

type PiTurnEventTraceEntry = {
  type: string | null;
  rawKeys: string[];
  usage: Record<string, number> | null;
  responseId?: string | null;
  role?: string | null;
  stopReason?: string | null;
  contentPartTypes?: string[];
  toolName?: string | null;
  toolCallId?: string | null;
  isError?: boolean;
  queueCounts?: Record<string, number>;
  queuePreview?: {
    steering: string[];
    followUp: string[];
    inProgress: string[];
    completed: string[];
    cancelled: string[];
  };
  reason?: string | null;
  projectionEventTypes?: string[];
  projectionLossKinds?: string[];
};

function pushPiTurnEventTrace(
  eventTrace: PiTurnEventTraceEntry[],
  entry: PiTurnEventTraceEntry
): void {
  eventTrace.push(entry);
  if (eventTrace.length > 50) {
    eventTrace.splice(0, eventTrace.length - 50);
  }
}

function buildPiTurnDiagnostics(input: {
  turnSequence: number;
  threadId: string | null;
  command: PiTurnCommand;
  continuationState: PiTurnContinuationState | null;
  eventTrace: PiTurnEventTraceEntry[];
  processDiagnostics: Record<string, unknown>;
  failureEvent?: PiTurnEventTraceEntry;
  promptResponse?: unknown;
}): Record<string, unknown> {
  return {
    turnSequence: input.turnSequence,
    threadId: input.threadId,
    command: {
      type: input.command.type,
      message: input.command.message,
      messageLength: input.command.message.length
    },
    continuationState: input.continuationState,
    promptResponse: input.promptResponse ?? null,
    failureEvent: input.failureEvent ?? null,
    eventTrace: input.eventTrace,
    processDiagnostics: input.processDiagnostics
  };
}

function summarizePiEventForDiagnostics(
  rawEvent: unknown,
  event: ReturnType<typeof decodePiRuntimeEvent>,
  eventType: string | null
): PiTurnEventTraceEntry {
  const rawKeys =
    rawEvent && typeof rawEvent === "object" && !Array.isArray(rawEvent)
      ? Object.keys(rawEvent as Record<string, unknown>).sort()
      : [];

  if (!event) {
    return {
      type: eventType,
      rawKeys,
      usage: null
    };
  }

  switch (event.type) {
    case "message_end":
      return {
        type: event.type,
        rawKeys,
        usage: summarizeUsage(event.usage),
        responseId: event.message?.responseId ?? null,
        role: event.message?.role ?? null,
        stopReason: event.stopReason,
        contentPartTypes: event.message?.content.map((part) => part.type) ?? []
      };
    case "turn_end":
      return {
        type: event.type,
        rawKeys,
        usage: summarizeUsage(event.usage),
        responseId: event.message?.responseId ?? null,
        role: event.message?.role ?? null,
        contentPartTypes: event.message?.content.map((part) => part.type) ?? []
      };
    case "tool_execution_start":
    case "tool_execution_update":
      return {
        type: event.type,
        rawKeys,
        usage: null,
        toolName: event.toolName,
        toolCallId: event.toolCallId
      };
    case "tool_execution_end":
      return {
        type: event.type,
        rawKeys,
        usage: null,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        isError: event.isError
      };
    case "queue_update":
      return {
        type: event.type,
        rawKeys,
        usage: null,
        queueCounts: {
          steering: event.steering.length,
          followUp: event.followUp.length,
          inProgress: event.inProgress.length,
          completed: event.completed.length,
          cancelled: event.cancelled.length,
          tasks: event.tasks.length
        },
        queuePreview: {
          steering: event.steering.slice(0, 3),
          followUp: event.followUp.slice(0, 3),
          inProgress: event.inProgress.slice(0, 3),
          completed: event.completed.slice(0, 3),
          cancelled: event.cancelled.slice(0, 3)
        }
      };
    case "process_exit":
      return {
        type: event.type,
        rawKeys,
        usage: null,
        reason: event.reason
      };
    case "session_started":
      return {
        type: event.type,
        rawKeys,
        usage: null
      };
    case "turn_start":
    case "extension_ui_request":
    case "agent_end":
      return {
        type: event.type,
        rawKeys,
        usage: null
      };
    case "unknown":
      return {
        type: event.rawType,
        rawKeys,
        usage: null
      };
  }
}

function defaultPromptFailureMessage(commandType: PiTurnCommand["type"]): string {
  return commandType === "prompt"
    ? "Pi RPC prompt command failed."
    : "Pi RPC follow_up command failed.";
}

function summarizeUsage(
  usage: {
    input: number;
    cacheRead: number;
    cacheWrite: number;
    output: number;
    totalTokens: number;
  } | null
): Record<string, number> | null {
  if (!usage) {
    return null;
  }

  return {
    input: usage.input,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    output: usage.output,
    totalTokens: usage.totalTokens
  };
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
