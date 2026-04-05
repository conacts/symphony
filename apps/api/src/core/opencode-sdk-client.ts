import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";
import {
  opencodeHarnessModule
} from "@symphony/agent-harnesses";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  HarnessSessionError,
  type HarnessSession,
  type HarnessSessionClient,
  type HarnessSessionLogger,
  type HarnessTurnResult
} from "./agent-session-types.js";
import {
  buildOpenCodePromptModel,
  fetchOpenCodeSessionDiff,
  fetchOpenCodeTodoSnapshot,
  formatOpenCodeMessageError,
  unwrapOpenCodeData
} from "./opencode-session-data.js";
import { startOpenCodeServer, type OpenCodeServerProcess } from "./opencode-server.js";

type OpenCodeSessionState = {
  sdkClient: OpencodeClient;
  sessionId: string;
  server: OpenCodeServerProcess;
  threadStarted: boolean;
  turnSequence: number;
  activeAbortController: AbortController | null;
};

export class OpenCodeSdkClient implements HarnessSessionClient {
  readonly #state: OpenCodeSessionState;

  constructor(state: OpenCodeSessionState) {
    this.#state = state;
  }

  static async startSession(input: {
    launchTarget: HarnessSession["launchTarget"];
    env: Record<string, string>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: HarnessSessionLogger;
  }): Promise<HarnessSession> {
    if (input.launchTarget.kind !== "container") {
      throw new HarnessSessionError(
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
      const createdSession = unwrapOpenCodeData(created, "OpenCode session.create");

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
      throw new HarnessSessionError(
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
    session: HarnessSession,
    input: Parameters<HarnessSessionClient["runTurn"]>[1]
  ): Promise<HarnessTurnResult> {
    const analyticsAdapter = opencodeHarnessModule.analytics.adapter;

    if (!analyticsAdapter) {
      throw new HarnessSessionError(
        "opencode_analytics_unavailable",
        "OpenCode analytics adapter is not configured."
      );
    }

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
      const promptResponse = unwrapOpenCodeData(response, "OpenCode session.prompt");

      const promptProjection = analyticsAdapter.projectPromptResponse({
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
          analyticsAdapter.projectTodoListEvent({
            sessionId: this.#state.sessionId,
            todos
          })
        );
      }

      if (completionEvent) {
        await input.onMessage(completionEvent);
      }

      if (promptResponse.info.error) {
        throw new HarnessSessionError(
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

        throw new HarnessSessionError("turn_aborted", error.message, error);
      }

      if (error instanceof HarnessSessionError) {
        throw error;
      }

      throw new HarnessSessionError(
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
