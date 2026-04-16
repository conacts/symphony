import type {
  SymphonyAgentRuntimeCompletion
} from "@symphony/orchestrator";
import type {
  SymphonyRuntimeLogStore,
  SymphonyRuntimeRunStore
} from "@symphony/db";
import type {
  JsonObject
} from "@symphony/contracts";
import {
  extractUsage
} from "@symphony/contracts";
import type {
  HarnessTurnResult
} from "@symphony/agent-harnesses";
import type {
  SymphonyAgentRuntimeConfig
} from "@symphony/orchestrator";
import {
  asRecord,
  getNumber,
  getString,
  toJsonValue
} from "./runtime-supervision-values.js";

export async function recordRuntimeLifecycleLog(input: {
  runtimeLogs: SymphonyRuntimeLogStore;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  issueIdentifier: string;
  runId: string | null;
  payload: JsonObject;
}): Promise<void> {
  await input.runtimeLogs.record({
    level: input.level,
    source: "agent_runtime",
    eventType: input.eventType,
    message: input.message,
    issueIdentifier: input.issueIdentifier,
    runId: input.runId,
    payload: input.payload
  });
}

export function buildRuntimeTerminalResultLogPayload(
  turnResult: HarnessTurnResult
): JsonObject {
  const moduleResult =
    turnResult.kind === "awaiting_input" || turnResult.kind === "blocked"
      ? turnResult.detail.moduleResult
      : turnResult.kind === "failed" &&
          turnResult.detail.kind === "terminal_result"
        ? turnResult.detail.result.moduleResult
        : null;

  return {
    terminalResultKind: turnResult.kind,
    threadId: turnResult.threadId,
    turnId: turnResult.turnId,
    usage: toJsonValue(turnResult.usage),
    reason:
      turnResult.kind === "completed"
        ? null
        : turnResult.reason,
    prompt:
      turnResult.kind === "awaiting_input"
        ? turnResult.prompt
        : null,
    failureClass:
      turnResult.kind === "failed"
        ? turnResult.failureClass
        : null,
    moduleId: moduleResult?.moduleId ?? null,
    moduleOutcome: moduleResult?.outcome ?? null,
    requestedState: moduleResult?.requestedState ?? null
  };
}

export async function recordRuntimeRunOutcome(input: {
  runtimeLogs: SymphonyRuntimeLogStore;
  issueIdentifier: string;
  runId: string | null;
  completion: SymphonyAgentRuntimeCompletion;
}): Promise<void> {
  const completed = input.completion.kind === "delivered";
  await recordRuntimeLifecycleLog({
    runtimeLogs: input.runtimeLogs,
    level: completed ? "info" : "warn",
    eventType: completed ? "runtime_run_completed" : "runtime_run_paused",
    message: completed
      ? "Agent runtime run completed."
      : "Agent runtime run paused.",
    issueIdentifier: input.issueIdentifier,
    runId: input.runId,
    payload: buildRuntimeRunOutcomePayload(input.completion)
  });
}

export function buildRuntimeRunOutcomePayload(
  completion: SymphonyAgentRuntimeCompletion
): JsonObject {
  const moduleResult =
    "moduleResult" in completion ? completion.moduleResult : null;
  return {
    outcome: completion.kind === "delivered" ? "completed" : "paused",
    completionKind: completion.kind,
    reason: runtimeOutcomeReasonForCompletion(completion),
    prompt:
      completion.kind === "awaiting_input"
        ? completion.prompt
        : null,
    moduleId: moduleResult?.moduleId ?? null,
    moduleOutcome: moduleResult?.outcome ?? null,
    requestedState: moduleResult?.requestedState ?? null,
    maxTurns:
      completion.kind === "max_turns_reached"
        ? completion.maxTurns
        : null
  };
}

function runtimeOutcomeReasonForCompletion(
  completion: SymphonyAgentRuntimeCompletion
): string | null {
  switch (completion.kind) {
    case "awaiting_input":
    case "blocked":
    case "failure":
    case "startup_failure":
    case "rate_limited":
    case "provider_transient":
    case "stalled":
    case "terminal_result_failure":
    case "max_turns_reached":
      return completion.reason;
    default:
      return null;
  }
}

type ExtractUsageEvent = Parameters<typeof extractUsage>[0];

export function extractRuntimeUsage(
  threadEvent: ExtractUsageEvent | null,
  payload: Record<string, unknown> | null
): {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
} | null {
  const eventUsage = threadEvent ? extractUsage(threadEvent) : null;
  if (eventUsage) {
    return eventUsage;
  }

  const directUsage =
    asRecord(payload?.usage) ??
    asRecord(asRecord(payload?.message)?.usage) ??
    asRecord(asRecord(asRecord(payload?.params)?.msg)?.usage);

  if (!directUsage) {
    return null;
  }

  const inputTokens = getNumber(directUsage, "input_tokens") ?? getNumber(directUsage, "input");
  const cachedInputTokens =
    getNumber(directUsage, "cached_input_tokens") ?? getNumber(directUsage, "cacheRead");
  const outputTokens =
    getNumber(directUsage, "output_tokens") ?? getNumber(directUsage, "output");

  return inputTokens !== null || cachedInputTokens !== null || outputTokens !== null
    ? {
        input_tokens: inputTokens ?? 0,
        cached_input_tokens: cachedInputTokens ?? 0,
        output_tokens: outputTokens ?? 0
      }
    : null;
}

export type CanonicalRuntimeEventPayload =
  Parameters<SymphonyRuntimeRunStore["recordEvent"]>[2]["payload"];

export type CanonicalRuntimeSessionStartedEvent = Extract<
  CanonicalRuntimeEventPayload,
  { type: "session.started" }
>;

export function shouldSynthesizeSessionStartedEvent(
  runtimePolicy: SymphonyAgentRuntimeConfig
): boolean {
  return !/(?:^|\s)app-server(?=\s|$)/u.test(runtimePolicy.agentRuntime.command.trim());
}

export function buildSyntheticSessionStartedEvent(input: {
  threadId: string | null;
  persistedTurnId: string;
  processId: string | null;
  model: string | null;
  reasoningEffort: string | null;
}): CanonicalRuntimeSessionStartedEvent | null {
  if (!input.threadId) {
    return null;
  }

  return {
    type: "session.started",
    session_id: input.threadId,
    thread_id: input.threadId,
    turn_id: input.persistedTurnId,
    agent_app_server_pid: input.processId,
    model: input.model,
    reasoning_effort: input.reasoningEffort
  };
}

export function extractCanonicalSessionStartedEvent(
  value: Record<string, unknown> | null | undefined
): CanonicalRuntimeSessionStartedEvent | null {
  if (getString(value, "type") !== "session.started") {
    return null;
  }

  const rawSessionId = getString(value, "session_id");
  const turnId = getString(value, "turn_id");

  if (!rawSessionId || !turnId) {
    return null;
  }

  return {
    type: "session.started",
    session_id: rawSessionId,
    thread_id: getString(value, "thread_id"),
    turn_id: turnId,
    agent_app_server_pid: getString(value, "agent_app_server_pid"),
    model: getString(value, "model"),
    reasoning_effort: getString(value, "reasoning_effort")
  };
}

export function summarizeCanonicalRuntimeEvent(
  event: CanonicalRuntimeEventPayload
): string | null {
  switch (event.type) {
    case "session.started":
      return "Runtime session started.";
    case "thread.started":
      return "Thread started.";
    case "turn.started":
      return "Turn started.";
    case "turn.completed":
      return "Turn completed.";
    case "turn.failed":
      return "Turn failed.";
    case "error":
      return event.message;
    case "item.started":
      return `${event.item.type} started.`;
    case "item.updated":
      return `${event.item.type} updated.`;
    case "item.completed":
      return `${event.item.type} completed.`;
    default:
      return null;
  }
}
