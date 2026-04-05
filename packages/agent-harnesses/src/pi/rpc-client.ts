import {
  getRecord,
  getString,
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
import { PiRpcProcess } from "./rpc-process.js";

export class PiRpcClient implements HarnessSessionClient {
  readonly #process: PiRpcProcess;
  #threadStartedEmitted = false;
  #turnSequence = 0;

  constructor(process: PiRpcProcess) {
    this.#process = process;
  }

  static async startSession(input: HarnessLaunchSessionInput): Promise<HarnessSession> {
    const { process, hostLaunchPath, launchSettings } =
      await PiRpcProcess.start(input);
    const client = new PiRpcClient(process);

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
    this.#process.close();
  }

  async runTurn(
    session: HarnessSession,
    input: Parameters<HarnessSessionClient["runTurn"]>[1]
  ): Promise<HarnessTurnResult> {
    const turnSequence = this.#turnSequence + 1;
    this.#turnSequence = turnSequence;
    const turnId = `pi-turn-${turnSequence}`;

    if (!this.#threadStartedEmitted && session.threadId) {
      this.#threadStartedEmitted = true;
      await input.onMessage({
        message: {
          type: "thread.started",
          thread_id: session.threadId
        }
      });
    }

    const promptResponse = await this.#process.sendCommand({
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
      const event = await this.#process.awaitEvent(input.turnTimeoutMs);
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

      const projection = piAnalyticsAdapter.projectRuntimeEvent({
        event
      });
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
