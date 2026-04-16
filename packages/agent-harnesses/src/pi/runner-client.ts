import {
  HarnessSessionError,
  type HarnessLaunchSessionInput,
  type HarnessSession,
  type HarnessSessionClient,
  type HarnessTurnResult
} from "../shared/session-types.js";
import { resolveHarnessModelRuntimePolicy } from "../shared/runtime-policy.js";
import { resolvePiIssueSelection } from "./model-selection.js";
import { PiRunnerProcess } from "./runner-process.js";
import {
  awaitSessionStartedEvent,
  buildPiRunnerBootstrapCommand,
  buildPiRunnerBootstrapInput,
  parsePiRunnerBootstrapEvent
} from "./client/bootstrap.js";
import { runPiRunnerTurnLoop } from "./internal/run-loop.js";
import { preparePiRunnerTurn } from "./internal/turn-preparation.js";

type SpawnSpecOverride = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  hostLaunchPath: string;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot?: string;
};

export class PiRunnerClient implements HarnessSessionClient {
  readonly #process: PiRunnerProcess;
  readonly #readTimeoutMs: number;
  readonly #stallTimeoutMs: number;
  readonly #toolTimeoutMs: number | null;
  #threadStartedEmitted = false;
  #turnSequence = 0;

  constructor(input: {
    process: PiRunnerProcess;
    readTimeoutMs: number;
    stallTimeoutMs: number;
    toolTimeoutMs: number | null;
  }) {
    this.#process = input.process;
    this.#readTimeoutMs = input.readTimeoutMs;
    this.#stallTimeoutMs = input.stallTimeoutMs;
    this.#toolTimeoutMs = input.toolTimeoutMs;
  }

  static async startSession(
    input: HarnessLaunchSessionInput,
    options?: {
      spawnSpecOverride?: SpawnSpecOverride;
    }
  ): Promise<HarnessSession> {
    const modelPolicy = resolveHarnessModelRuntimePolicy(input.runtimePolicy);
    const selection = resolvePiIssueSelection(input.issue, {
      model: modelPolicy.defaultModel,
      reasoningEffort: modelPolicy.defaultReasoningEffort,
      defaultPreset: modelPolicy.defaultPreset,
      presets: modelPolicy.presets
    });
    const started = await PiRunnerProcess.start(input, {
      spawnSpecOverride: options?.spawnSpecOverride
    });
    const client = new PiRunnerClient({
      process: started.process,
      readTimeoutMs: input.runtimePolicy.pi.readTimeoutMs,
      stallTimeoutMs: input.runtimePolicy.pi.stallTimeoutMs,
      toolTimeoutMs: input.runtimePolicy.pi.toolTimeoutMs
    });

    try {
      const runnerInput = buildPiRunnerBootstrapInput({
        issue: input.issue,
        runtimeWorkspacePath: started.runtimeWorkspacePath,
        runtimeWorkspaceRoot: started.runtimeWorkspaceRoot,
        selection,
        providerId:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.id ?? null)
            : null,
        providerName:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.name ?? null)
            : null
      });
      started.process.sendCommand(
        buildPiRunnerBootstrapCommand(runnerInput)
      );

      const firstEvent = await awaitSessionStartedEvent({
        process: started.process,
        timeoutMs: input.runtimePolicy.agentRuntime.readTimeoutMs
      });

      if (firstEvent.eventType !== "session_started") {
        throw new HarnessSessionError(
          "pi_runner_initialize_failed",
          `Expected the Pi runner to emit session_started first, received ${firstEvent.eventType}.`,
          firstEvent
        );
      }

      return {
        client,
        threadId: firstEvent.threadId ?? firstEvent.sessionId,
        workspacePath: started.runtimeWorkspacePath,
        hostLaunchPath: started.hostLaunchPath,
        hostWorkspacePath: input.launchTarget.hostWorkspacePath,
        launchTarget: input.launchTarget,
        issue: input.issue,
        processId: started.process.processId,
        autoApproveRequests:
          input.runtimePolicy.agentRuntime.approvalPolicy === "never",
        approvalPolicy: input.runtimePolicy.agentRuntime.approvalPolicy,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
        profile: modelPolicy.profile ?? null,
        providerId:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.id ?? null)
            : null,
        providerName:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.name ?? null)
            : null
      };
    } catch (error) {
      started.process.close();
      throw error;
    }
  }

  close(): void {
    this.#process.close();
  }

  async runTurn(
    session: HarnessSession,
    input: Parameters<HarnessSessionClient["runTurn"]>[1]
  ): Promise<HarnessTurnResult> {
    this.#turnSequence += 1;
    const preparedTurn = preparePiRunnerTurn({
      turnSequence: this.#turnSequence,
      promptTitle: input.title,
      promptText: input.prompt,
      turnTimeoutMs: input.turnTimeoutMs,
      stallTimeoutMs: this.#stallTimeoutMs,
      toolTimeoutMs:
        this.#toolTimeoutMs === null
          ? null
          : Math.min(this.#toolTimeoutMs, input.turnTimeoutMs)
    });

    if (!this.#threadStartedEmitted) {
      this.#threadStartedEmitted = true;
      await input.onMessage({
        event: {
          type: "thread.started",
          thread_id: session.threadId
        }
      });
    }

    this.#process.sendCommand(preparedTurn.command);

    return await runPiRunnerTurnLoop({
      process: this.#process,
      session,
      turnId: preparedTurn.turnId,
      readTimeoutMs: this.#readTimeoutMs,
      threadState: preparedTurn.threadState,
      onMessage: input.onMessage
    });
  }
}
export { parsePiRunnerBootstrapEvent };
