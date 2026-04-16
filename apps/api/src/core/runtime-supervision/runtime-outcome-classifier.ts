import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyStartupFailureOrigin,
  SymphonyStartupFailureStage
} from "@symphony/orchestrator";
import {
  HarnessSessionError,
  isHarnessRunnerErrorFailureDetail,
  isHarnessTransportTimeoutFailureDetail,
  piSdkRunnerFailureClasses,
  type HarnessCompletionCandidate,
  type HarnessFailedTurnDetail,
  type HarnessTurnResult,
  type PiSdkRunnerFailureClass
} from "@symphony/agent-harnesses";
import type { JsonObject } from "@symphony/contracts";
import type { RuntimeFailureClassification } from "./runtime-supervision-types.js";
import {
  toJsonValue
} from "./runtime-supervision-values.js";

const piSdkRunnerFailureClassSet = new Set<string>(piSdkRunnerFailureClasses);

export type ExplicitCompletionRequirement =
  | "none"
  | "terminal_result";

export function resolveExplicitCompletionRequirement(
  capabilityManagedRun: boolean
): ExplicitCompletionRequirement {
  return capabilityManagedRun ? "none" : "terminal_result";
}

export function classifyHarnessTurnFailure(input: {
  turnResult: Extract<HarnessTurnResult, { kind: "failed" }>;
  providerId: string | null;
}): RuntimeFailureClassification {
  return classifyPiFailure({
    failureClass:
      typeof input.turnResult.failureClass === "string" &&
      piSdkRunnerFailureClassSet.has(input.turnResult.failureClass)
        ? (input.turnResult.failureClass as PiSdkRunnerFailureClass)
        : null,
    reason: input.turnResult.reason,
    detail: input.turnResult.detail,
    providerId: input.providerId
  });
}

export function classifyHarnessExecutionFailure(input: {
  error: unknown;
  providerId: string | null;
}): RuntimeFailureClassification | null {
  const harnessError = input.error instanceof HarnessSessionError ? input.error : null;
  if (!harnessError) {
    return null;
  }

  if (harnessError.code === "pi_sdk_runner_transport_timeout") {
    return classifyPiFailure({
      failureClass: "transport_timeout",
      reason: harnessError.message,
      detail: isHarnessTransportTimeoutFailureDetail(harnessError.detail)
        ? harnessError.detail
        : null,
      providerId: input.providerId
    });
  }

  if (harnessError.code !== "pi_sdk_runner_failed") {
    return null;
  }

  const failureClass = isHarnessRunnerErrorFailureDetail(harnessError.detail)
    ? toPiFailureClass(harnessError.detail.failureClass)
    : null;
  return classifyPiFailure({
    failureClass,
    reason: harnessError.message,
    detail: harnessError.detail,
    providerId: input.providerId
  });
}

export function completionFromHarnessTurnResult(
  turnResult: Exclude<HarnessTurnResult, { kind: "completed" }>
): SymphonyAgentRuntimeCompletion {
  switch (turnResult.kind) {
    case "awaiting_input": {
      const moduleResult = extractHarnessModuleResult(
        turnResult.detail.moduleResult,
        "awaiting_input"
      );
      return moduleResult
        ? {
            kind: "awaiting_input",
            reason: turnResult.reason,
            prompt: turnResult.prompt,
            moduleResult
          }
        : {
            kind: "failure",
            reason:
              "Runtime requested user input without emitting a valid awaiting_input module result."
          };
    }
    case "blocked": {
      const moduleResult = extractHarnessModuleResult(
        turnResult.detail.moduleResult,
        "blocked"
      );
      return {
        kind: "blocked",
        reason: turnResult.reason,
        moduleResult
      };
    }
    case "failed":
      return {
        kind: "failure",
        reason: turnResult.reason
      };
  }
}

export function missingExplicitCompletion(): SymphonyAgentRuntimeCompletion {
  return missingTerminalResultCompletion();
}

export function completionFromHarnessCompletionCandidate(
  candidate: HarnessCompletionCandidate | null
): Extract<
  SymphonyAgentRuntimeCompletion,
  { kind: "delivered" | "awaiting_input" | "blocked" }
> | null {
  if (!candidate) {
    return null;
  }

  return completionFromModuleResult(candidate.moduleResult);
}

export function capabilityManagedRunCompletion(input: {
  completionCandidate: HarnessCompletionCandidate | null;
}): SymphonyAgentRuntimeCompletion {
  return (
    completionFromHarnessCompletionCandidate(input.completionCandidate) ??
    implicitCapabilityRunCompletion()
  );
}

export function classifyStartupFailure(error: unknown): {
  failureStage: SymphonyStartupFailureStage;
  failureOrigin: SymphonyStartupFailureOrigin;
} | null {
  const harnessError = error instanceof HarnessSessionError ? error : null;
  if (harnessError) {
    if (
      [
        "initialize_failed",
        "thread_start_failed",
        "invalid_workspace_cwd",
        "invalid_thread_payload",
        "invalid_turn_payload",
        "invalid_issue_label_override",
        "pi_launch_unsupported",
        "pi_sdk_runner_launch_unsupported",
        "pi_sdk_runner_initialize_failed",
        "pi_sdk_runner_initialize_timeout",
        "pi_session_start_failed",
        "pi_turn_start_failed"
      ].includes(harnessError.code)
    ) {
      return {
        failureStage: "runtime_session_start",
        failureOrigin: "pi_startup"
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Pi SDK runner")) {
    return {
      failureStage: "runtime_session_start",
      failureOrigin: "pi_startup"
    };
  }

  return null;
}

export function isRateLimitedError(error: unknown): boolean {
  const harnessError = error instanceof HarnessSessionError ? error : null;
  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (harnessError?.detail) {
    messages.push(JSON.stringify(harnessError.detail));
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("rate limit") ||
      normalized.includes("rate_limit") ||
      normalized.includes("ratelimit") ||
      normalized.includes("too many requests") ||
      normalized.includes("rate_limit_exceeded")
    );
  });
}

export function isTransientProviderError(
  error: unknown,
  providerId: string | null
): boolean {
  if (!providerId) {
    return false;
  }

  const harnessError = error instanceof HarnessSessionError ? error : null;
  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (harnessError?.detail) {
    messages.push(JSON.stringify(harnessError.detail));
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("502 bad gateway") ||
      normalized.includes("503 service unavailable") ||
      normalized.includes("504 gateway timeout") ||
      normalized.includes("error code: 502") ||
      normalized.includes("error code: 503") ||
      normalized.includes("error code: 504") ||
      normalized.includes("unexpected status 502") ||
      normalized.includes("unexpected status 503") ||
      normalized.includes("unexpected status 504") ||
      normalized.includes("socket hang up") ||
      normalized.includes("connection reset") ||
      normalized.includes("econnreset") ||
      normalized.includes("etimedout") ||
      normalized.includes("eai_again") ||
      normalized.includes("temporary failure in name resolution") ||
      normalized.includes("upstream connect error") ||
      normalized.includes("upstream request timeout")
    );
  });
}

function classifyPiFailure(input: {
  failureClass: PiSdkRunnerFailureClass | "transport_timeout" | null;
  reason: string;
  detail: unknown;
  providerId: string | null;
}): RuntimeFailureClassification {
  const payload = buildRuntimeFailurePayload({
    failureClass: input.failureClass,
    reason: input.reason,
    detail: input.detail
  });
  const failureError = new HarnessSessionError(
    "pi_sdk_runner_failed",
    input.reason,
    input.detail
  );

  switch (input.failureClass) {
    case "model_idle_timeout":
      return {
        completion: {
          kind: "stalled",
          reason: input.reason
        },
        level: "warn",
        eventType: "runtime_timeout_classified",
        message: "Agent runtime timeout classified.",
        payload: {
          ...payload,
          timeoutClass: "model_idle_timeout"
        }
      };
    case "run_timeout":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_timeout_classified",
        message: "Agent runtime timeout classified.",
        payload: {
          ...payload,
          timeoutClass: "run_timeout"
        }
      };
    case "tool_timeout":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_timeout_classified",
        message: "Agent runtime timeout classified.",
        payload: {
          ...payload,
          timeoutClass: "tool_timeout"
        }
      };
    case "transport_timeout":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_timeout_classified",
        message: "Agent runtime timeout classified.",
        payload: {
          ...payload,
          timeoutClass: "transport_timeout"
        }
      };
    case "provider_error":
      if (isRateLimitedError(failureError)) {
        return {
          completion: {
            kind: "rate_limited",
            reason: input.reason
          },
          level: "warn",
          eventType: "runtime_rate_limited",
          message: "Agent runtime hit a provider rate limit.",
          payload
        };
      }
      if (isTransientProviderError(failureError, input.providerId)) {
        return {
          completion: {
            kind: "provider_transient",
            reason: input.reason
          },
          level: "warn",
          eventType: "runtime_provider_transient",
          message: "Agent runtime hit a transient provider failure.",
          payload
        };
      }
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_provider_error",
        message: "Agent runtime failed because the provider returned an error.",
        payload
      };
    case "terminal_result_missing":
      return {
        completion: {
          kind: "terminal_result_failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_terminal_result_missing",
        message: "Agent runtime ended without a terminal result.",
        payload
      };
    case "terminal_result_invalid":
      return {
        completion: {
          kind: "terminal_result_failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_terminal_result_invalid",
        message: "Agent runtime produced an invalid terminal result.",
        payload
      };
    case "bridge_protocol_failure":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_bridge_protocol_failure",
        message: "Agent runtime bridge protocol failed.",
        payload
      };
    case "runtime_crash":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_runner_crash",
        message: "Agent runtime process crashed during execution.",
        payload
      };
    case "runner_startup_failure":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_runner_startup_failure",
        message: "Agent runtime process failed during startup.",
        payload
      };
    case "operator_input_required":
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "warn",
        eventType: "runtime_operator_input_required",
        message: "Agent runtime required operator input that Symphony does not support automatically.",
        payload
      };
    default:
      return {
        completion: {
          kind: "failure",
          reason: input.reason
        },
        level: "error",
        eventType: "runtime_execution_failed",
        message: "Agent runtime execution failed.",
        payload
      };
  }
}

function buildRuntimeFailurePayload(input: {
  failureClass: PiSdkRunnerFailureClass | "transport_timeout" | null;
  reason: string;
  detail: unknown;
}): JsonObject {
  if (isHarnessTransportTimeoutFailureDetail(input.detail)) {
    return {
      failureClass: input.failureClass,
      reason: input.reason,
      thresholdMs: input.detail.transportTimeoutMs,
      lastActivityAt: null,
      lastActivityType: null,
      stopReason: null,
      providerStopReason: null,
      callId: null,
      toolName: null,
      commandText: null,
      runnerEventType: null,
      diagnostics: toJsonValue(input.detail.diagnostics),
      detail: toJsonValue(input.detail)
    };
  }

  if (isHarnessRunnerErrorFailureDetail(input.detail)) {
    return {
      failureClass: input.failureClass,
      reason: input.reason,
      thresholdMs: null,
      lastActivityAt: null,
      lastActivityType: null,
      stopReason: null,
      providerStopReason: null,
      callId: null,
      toolName: null,
      commandText: null,
      runnerEventType: input.detail.runnerEventType,
      diagnostics: toJsonValue(input.detail.diagnostics),
      detail: toJsonValue(input.detail)
    };
  }

  if (isHarnessFailedTerminalResultDetail(input.detail)) {
    return {
      failureClass: input.failureClass,
      reason: input.reason,
      thresholdMs: input.detail.timeoutTrigger?.thresholdMs ?? null,
      lastActivityAt:
        input.detail.timeoutTrigger?.lastActivityAt ??
        input.detail.result.lastActivityAt,
      lastActivityType:
        input.detail.timeoutTrigger?.lastActivityType ??
        input.detail.result.lastActivityType,
      stopReason: input.detail.result.stopReason,
      providerStopReason: input.detail.result.providerStopReason,
      callId: input.detail.timeoutTrigger?.callId ?? null,
      toolName: input.detail.timeoutTrigger?.toolName ?? null,
      commandText: input.detail.timeoutTrigger?.commandText ?? null,
      runnerEventType: null,
      diagnostics: null,
      detail: toJsonValue(input.detail)
    };
  }

  return {
    failureClass: input.failureClass,
    reason: input.reason,
    thresholdMs: null,
    lastActivityAt: null,
    lastActivityType: null,
    stopReason: null,
    providerStopReason: null,
    callId: null,
    toolName: null,
    commandText: null,
    runnerEventType: null,
    diagnostics: null,
    detail: toJsonValue(input.detail)
  };
}

function extractHarnessModuleResult(
  moduleResult: Extract<
    SymphonyAgentRuntimeCompletion,
    { kind: "delivered" | "awaiting_input" | "blocked" }
  >["moduleResult"] | null,
  expectedOutcome: "awaiting_input" | "blocked"
) {
  if (!moduleResult || moduleResult.outcome !== expectedOutcome) {
    return null;
  }

  return moduleResult;
}

function missingTerminalResultCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "failure",
    reason:
      "Run ended without recording an explicit terminal result. Non-capability-managed runs must report completion before the run can complete."
  };
}

function implicitCapabilityRunCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "terminal_result_failure",
    reason:
      "Capability-managed run ended without a structured terminal module result."
  };
}

function completionFromModuleResult(
  moduleResult: HarnessCompletionCandidate["moduleResult"]
): Extract<
  SymphonyAgentRuntimeCompletion,
  { kind: "delivered" | "awaiting_input" | "blocked" }
> {
  switch (moduleResult.outcome) {
    case "completed":
      return {
        kind: "delivered",
        moduleResult
      };
    case "awaiting_input":
      return {
        kind: "awaiting_input",
        reason: moduleResult.summary,
        prompt:
          moduleResult.nextInputPrompt ??
          "Capability-managed run requires explicit user input.",
        moduleResult
      };
    case "blocked":
      return {
        kind: "blocked",
        reason: moduleResult.blockers.join("; "),
        moduleResult
      };
  }

  throw new TypeError(
    `Unsupported implementation module result outcome: ${String(moduleResult.outcome)}`
  );
}

function isHarnessFailedTerminalResultDetail(
  value: unknown
): value is Extract<HarnessFailedTurnDetail, { kind: "terminal_result" }> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === "terminal_result"
  );
}

function toPiFailureClass(value: string | null): PiSdkRunnerFailureClass | null {
  return value && piSdkRunnerFailureClassSet.has(value)
    ? (value as PiSdkRunnerFailureClass)
    : null;
}
