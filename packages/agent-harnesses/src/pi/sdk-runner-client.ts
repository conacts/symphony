import {
  HarnessSessionError,
  type HarnessLaunchSessionInput,
  type HarnessSession,
  type HarnessSessionClient,
  type HarnessTurnResult
} from "../shared/session-types.js";
import { resolveHarnessModelRuntimePolicy } from "../shared/runtime-policy.js";
import { resolvePiIssueSelection } from "./model-selection.js";
import { PiSdkRunnerProcess } from "./sdk-runner-process.js";
import {
  awaitSessionStartedEvent,
  buildPiSdkRunnerBootstrapCommand,
  buildPiSdkRunnerBootstrapInput,
  parsePiSdkRunnerBootstrapEvent
} from "./client/bootstrap.js";
import { runPiSdkRunnerTurnLoop } from "./internal/run-loop.js";
import { preparePiSdkRunnerTurn } from "./internal/turn-preparation.js";

type SpawnSpecOverride = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  hostLaunchPath: string;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot?: string;
};

export class PiSdkRunnerClient implements HarnessSessionClient {
  readonly #process: PiSdkRunnerProcess;
  readonly #readTimeoutMs: number;
  readonly #stallTimeoutMs: number;
  readonly #toolTimeoutMs: number | null;
  #threadStartedEmitted = false;
  #turnSequence = 0;

  constructor(input: {
    process: PiSdkRunnerProcess;
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
    const started = await PiSdkRunnerProcess.start(input, {
      spawnSpecOverride: options?.spawnSpecOverride
    });
    const client = new PiSdkRunnerClient({
      process: started.process,
      readTimeoutMs: input.runtimePolicy.pi.readTimeoutMs,
      stallTimeoutMs: input.runtimePolicy.pi.stallTimeoutMs,
      toolTimeoutMs: input.runtimePolicy.pi.toolTimeoutMs
    });

    try {
      const runnerInput = buildPiSdkRunnerBootstrapInput({
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
        buildPiSdkRunnerBootstrapCommand(runnerInput)
      );

      const firstEvent = await awaitSessionStartedEvent({
        process: started.process,
        timeoutMs: input.runtimePolicy.agentRuntime.readTimeoutMs
      });

      if (firstEvent.eventType !== "session_started") {
        throw new HarnessSessionError(
          "pi_sdk_runner_initialize_failed",
          `Expected the Pi SDK runner to emit session_started first, received ${firstEvent.eventType}.`,
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
    const preparedTurn = preparePiSdkRunnerTurn({
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

    return await runPiSdkRunnerTurnLoop({
      process: this.#process,
      session,
      turnId: preparedTurn.turnId,
      readTimeoutMs: this.#readTimeoutMs,
      threadState: preparedTurn.threadState,
      onMessage: input.onMessage
    });
  }
}
export { parsePiSdkRunnerBootstrapEvent };
