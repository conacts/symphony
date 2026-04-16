import type {
  HarnessCompletionCandidate,
  HarnessRuntimeUpdate,
  HarnessSession,
  HarnessSessionClient,
  HarnessTurnResult
} from "@symphony/agent-harnesses";
import {
  parseSymphonyImplementationModuleResultMessage,
  type SymphonyImplementationModuleResult
} from "@symphony/runtime-contract";
import type { SymphonyRuntimeHarness } from "../core/runtime-harness.js";

type TranscriptDrivenFakeHarnessContext = {
  controller: TranscriptDrivenFakeHarnessController;
  session: HarnessSession;
  runTurnInput: Parameters<HarnessSessionClient["runTurn"]>[1];
};

type ScriptedValue<T> =
  | T
  | ((input: TranscriptDrivenFakeHarnessContext) => T | Promise<T>);

export type TranscriptDrivenFakeHarnessStep =
  | {
      kind: "update";
      update:
        | ScriptedValue<HarnessRuntimeUpdate>
        | ScriptedValue<HarnessRuntimeUpdate[]>;
    }
  | {
      kind: "resolve";
      result: ScriptedValue<HarnessTurnResult>;
    }
  | {
      kind: "throw";
      error: ScriptedValue<unknown>;
    }
  | {
      kind: "await_close_then_throw";
      error: ScriptedValue<Error>;
    };

export type TranscriptDrivenFakeHarnessController = {
  closeRequested: boolean;
  closeCount: number;
  sessionsStarted: number;
  runTurnCalls: Array<Parameters<HarnessSessionClient["runTurn"]>[1]>;
};

type TranscriptDrivenFakeHarnessSessionOverrides = Partial<
  Omit<HarnessSession, "client" | "launchTarget" | "issue">
>;

export class TranscriptDrivenFakeHarnessBuilder {
  readonly #steps: TranscriptDrivenFakeHarnessStep[] = [];

  update(
    update:
      | ScriptedValue<HarnessRuntimeUpdate>
      | ScriptedValue<HarnessRuntimeUpdate[]>
  ): this {
    this.#steps.push({
      kind: "update",
      update
    });
    return this;
  }

  resolve(result: ScriptedValue<HarnessTurnResult>): this {
    this.#steps.push({
      kind: "resolve",
      result
    });
    return this;
  }

  throw(error: ScriptedValue<unknown>): this {
    this.#steps.push({
      kind: "throw",
      error
    });
    return this;
  }

  awaitCloseThenThrow(error: ScriptedValue<Error>): this {
    this.#steps.push({
      kind: "await_close_then_throw",
      error
    });
    return this;
  }

  build(): TranscriptDrivenFakeHarnessStep[] {
    return [...this.#steps];
  }
}

export function createTranscriptDrivenFakeHarnessBuilder() {
  return new TranscriptDrivenFakeHarnessBuilder();
}

export function createTranscriptDrivenFakeHarnessStartSession(input: {
  transcript: TranscriptDrivenFakeHarnessStep[] | TranscriptDrivenFakeHarnessBuilder;
  session?: TranscriptDrivenFakeHarnessSessionOverrides;
}): {
  controller: TranscriptDrivenFakeHarnessController;
  startSession: SymphonyRuntimeHarness["startSession"];
} {
  const steps =
    input.transcript instanceof TranscriptDrivenFakeHarnessBuilder
      ? input.transcript.build()
      : [...input.transcript];
  const controller: TranscriptDrivenFakeHarnessController = {
    closeRequested: false,
    closeCount: 0,
    sessionsStarted: 0,
    runTurnCalls: []
  };
  let closeWaiter:
    | (() => void)
    | null = null;

  return {
    controller,
    startSession: async ({ launchTarget, issue }) => {
      controller.sessionsStarted += 1;
      controller.closeRequested = false;
      closeWaiter = null;

      const session = {} as HarnessSession;
      const client: HarnessSessionClient = {
        close() {
          controller.closeRequested = true;
          controller.closeCount += 1;
          const pendingWaiter = closeWaiter;
          closeWaiter = null;
          pendingWaiter?.();
        },
        async runTurn(_session, runTurnInput) {
          controller.runTurnCalls.push(runTurnInput);
          const context: TranscriptDrivenFakeHarnessContext = {
            controller,
            session,
            runTurnInput
          };

          for (const step of steps) {
            switch (step.kind) {
              case "update": {
                const resolved = await resolveScriptedValue(step.update, context);
                const updates = Array.isArray(resolved) ? resolved : [resolved];
                for (const update of updates) {
                  await runTurnInput.onMessage(update);
                }
                break;
              }
              case "resolve":
                return await resolveScriptedValue(step.result, context);
              case "throw":
                throw await resolveScriptedValue(step.error, context);
              case "await_close_then_throw": {
                const resolvedError = await resolveScriptedValue(step.error, context);
                if (controller.closeRequested) {
                  throw resolvedError;
                }

                return await new Promise<never>((_resolve, reject) => {
                  closeWaiter = () => {
                    reject(resolvedError);
                  };
                });
              }
              default:
                break;
            }
          }

          throw new TypeError(
            "Transcript-driven fake harness ended without a terminal result or thrown error."
          );
        }
      };

      const builtSession: HarnessSession = {
        client,
        threadId: "thread-1",
        workspacePath: "/workspace",
        hostLaunchPath: "/tmp/symphony-runtime",
        hostWorkspacePath: "/tmp/symphony-runtime",
        launchTarget,
        issue,
        processId: "1234",
        autoApproveRequests: true,
        approvalPolicy: "never",
        model: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
        profile: null,
        providerId: "openrouter",
        providerName: "OpenRouter",
        ...input.session
      };
      Object.assign(session, builtSession);

      return session;
    }
  };
}

export function buildHarnessRuntimeUpdate(input: {
  event: HarnessRuntimeUpdate["event"];
  completionCandidate?: HarnessCompletionCandidate | null;
  rawPayload?: unknown;
}): HarnessRuntimeUpdate {
  return {
    event: input.event,
    completionCandidate: input.completionCandidate ?? null,
    rawPayload: input.rawPayload
  };
}

export function buildHarnessAgentMessageCompletedUpdate(input: {
  text: string;
  id?: string;
  completionCandidate?: HarnessCompletionCandidate | null;
  rawPayload?: unknown;
}): HarnessRuntimeUpdate {
  const parsedCompletionCandidate =
    input.completionCandidate === undefined
      ? parseHarnessCompletionCandidate(input.text)
      : input.completionCandidate;

  return buildHarnessRuntimeUpdate({
    event: {
      type: "item.completed",
      item: {
        id: input.id ?? "agent-message-1",
        type: "agent_message",
        text: input.text
      }
    },
    completionCandidate: parsedCompletionCandidate ?? null,
    rawPayload: input.rawPayload
  });
}

export function buildHarnessCommandCompletedUpdate(input: {
  command: string;
  aggregatedOutput?: string;
  exitCode?: number;
  id?: string;
  rawPayload?: unknown;
}): HarnessRuntimeUpdate {
  return buildHarnessRuntimeUpdate({
    event: {
      type: "item.completed",
      item: {
        id: input.id ?? "command-1",
        type: "command_execution",
        command: input.command,
        aggregated_output: input.aggregatedOutput ?? "",
        exit_code: input.exitCode ?? 0,
        status: "completed"
      }
    },
    rawPayload: input.rawPayload
  });
}

export function buildHarnessCompletedTurnResult(
  overrides: Partial<Extract<HarnessTurnResult, { kind: "completed" }>> = {}
): Extract<HarnessTurnResult, { kind: "completed" }> {
  return {
    kind: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    usage: null,
    ...overrides
  };
}

export function buildHarnessAwaitingInputTurnResult(
  overrides: Partial<Extract<HarnessTurnResult, { kind: "awaiting_input" }>>
): Extract<HarnessTurnResult, { kind: "awaiting_input" }> {
  return {
    kind: "awaiting_input",
    threadId: "thread-1",
    turnId: "turn-1",
    usage: null,
    reason: "Need more input before continuing.",
    prompt: "Provide the missing input.",
    detail: {
      finalAssistantMessage: null,
      moduleResult: null,
      stopReason: null,
      providerStopReason: null,
      lastActivityAt: null,
      lastActivityType: null
    },
    ...overrides
  };
}

export function buildHarnessBlockedTurnResult(
  overrides: Partial<Extract<HarnessTurnResult, { kind: "blocked" }>>
): Extract<HarnessTurnResult, { kind: "blocked" }> {
  return {
    kind: "blocked",
    threadId: "thread-1",
    turnId: "turn-1",
    usage: null,
    reason: "Blocked on an external dependency.",
    detail: {
      finalAssistantMessage: null,
      moduleResult: null,
      stopReason: null,
      providerStopReason: null,
      lastActivityAt: null,
      lastActivityType: null
    },
    ...overrides
  };
}

export function buildHarnessFailedTurnResult(
  overrides: Partial<Extract<HarnessTurnResult, { kind: "failed" }>>
): Extract<HarnessTurnResult, { kind: "failed" }> {
  return {
    kind: "failed",
    threadId: "thread-1",
    turnId: "turn-1",
    usage: null,
    reason: "Harness execution failed.",
    failureClass: null,
    detail: {
      kind: "runner_error",
      failureClass: null,
      runnerEventType: null,
      diagnostics: null
    },
    ...overrides
  };
}

export function buildImplementationModuleResult(
  overrides: Partial<SymphonyImplementationModuleResult> = {}
): SymphonyImplementationModuleResult {
  return {
    schemaVersion: "1",
    moduleId: "implement.spec",
    outcome: "completed",
    summary: "Implemented the requested issue behavior.",
    evidence: {
      filesChanged: ["apps/api/src/example.ts"],
      verification: [],
      notes: null
    },
    requestedState: "done",
    nextInputPrompt: null,
    blockers: [],
    ...overrides
  };
}

export function buildImplementationModuleResultMessage(
  overrides: Partial<SymphonyImplementationModuleResult> = {}
): string {
  return [
    "```json",
    JSON.stringify(buildImplementationModuleResult(overrides), null, 2),
    "```"
  ].join("\n");
}

export function buildHarnessCompletionCandidate(
  overrides: Partial<SymphonyImplementationModuleResult> = {}
): HarnessCompletionCandidate {
  return {
    kind: "module_result",
    moduleResult: buildImplementationModuleResult(overrides)
  };
}

function parseHarnessCompletionCandidate(
  messageText: string
): HarnessCompletionCandidate | null {
  const parsed = parseSymphonyImplementationModuleResultMessage({
    messageText
  });

  return parsed.kind === "parsed"
    ? {
        kind: "module_result",
        moduleResult: parsed.result
      }
    : null;
}

async function resolveScriptedValue<T>(
  value: ScriptedValue<T>,
  context: TranscriptDrivenFakeHarnessContext
): Promise<T> {
  return typeof value === "function"
    ? await (value as (input: TranscriptDrivenFakeHarnessContext) => T | Promise<T>)(
        context
      )
    : value;
}
