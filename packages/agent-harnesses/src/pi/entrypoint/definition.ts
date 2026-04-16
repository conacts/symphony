import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import type {
  PiSdkRunnerInput,
  PiSdkRunnerUsage
} from "../sdk-runner-contract.js";

export type PiSdkRunnerSession = {
  abort: AgentSession["abort"];
  dispose: AgentSession["dispose"];
  prompt: AgentSession["prompt"];
  state: {
    messages: AgentSession["state"]["messages"];
  };
  subscribe: AgentSession["subscribe"];
};

export type PiSdkRunnerRuntime = {
  bootstrap: PiSdkRunnerInput;
  resolvedAgentDir: string;
  model: Model<Api>;
  session: PiSdkRunnerSession;
  sessionId: string;
  threadId: string | null;
};

export type PiSdkPromptExecutionState = {
  messageIds: Set<string>;
  toolCalls: Map<
    string,
    {
      toolName: string;
      args: unknown;
      commandText: string | null;
      startedAt: string;
      lastHeartbeatAt: string | null;
    }
  >;
  finalAssistantMessage: AssistantMessage | null;
  finalAssistantText: string | null;
  usage: PiSdkRunnerUsage | null;
  providerStopReason: string | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
};

export type PiSdkTimeoutFailure = {
  failureClass: "model_idle_timeout" | "run_timeout" | "tool_timeout";
  reason: string;
};

export type PiSdkTimeoutController = {
  recordActivity(recordedAt: string, activityType: string): void;
  getTriggeredFailure(): PiSdkTimeoutFailure | null;
  dispose(): void;
};

export function createPromptExecutionState(
  promptStartedAt: string
): PiSdkPromptExecutionState {
  return {
    messageIds: new Set(),
    toolCalls: new Map(),
    finalAssistantMessage: null,
    finalAssistantText: null,
    usage: null,
    providerStopReason: null,
    lastActivityAt: promptStartedAt,
    lastActivityType: "prompt_started"
  };
}
