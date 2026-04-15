const sdkRunnerSchemaVersion = "1" as const;

export const piSdkRunnerFailureClasses = [
  "runner_startup_failure",
  "bridge_protocol_failure",
  "transport_timeout",
  "model_idle_timeout",
  "run_timeout",
  "tool_timeout",
  "operator_input_required",
  "terminal_result_missing",
  "terminal_result_invalid",
  "provider_error",
  "runtime_crash"
] as const;

export type PiSdkRunnerFailureClass =
  (typeof piSdkRunnerFailureClasses)[number];

export const piSdkRunnerStopReasons = [
  "end_turn",
  "tool_calls",
  "max_tokens",
  "refusal",
  "error",
  "aborted",
  "unknown"
] as const;

export type PiSdkRunnerStopReason = (typeof piSdkRunnerStopReasons)[number];

export const piSdkRunnerApprovalModes = ["auto", "manual"] as const;

export type PiSdkRunnerApprovalMode =
  (typeof piSdkRunnerApprovalModes)[number];

export const piSdkRunnerFileChangeTypes = [
  "added",
  "modified",
  "deleted"
] as const;

export type PiSdkRunnerFileChangeType =
  (typeof piSdkRunnerFileChangeTypes)[number];

export type PiSdkRunnerUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type PiSdkRunnerInput = {
  schemaVersion: typeof sdkRunnerSchemaVersion;
  runId: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
  };
  workspace: {
    cwd: string;
    sessionFile: string;
    agentDir: string | null;
  };
  prompt: {
    title: string;
    text: string;
  };
  model: {
    id: string;
    reasoningEffort: string;
    profile: string | null;
    providerId: string | null;
    providerName: string | null;
  };
  timeouts: {
    runTimeoutMs: number;
    modelIdleTimeoutMs: number | null;
    toolTimeoutMs: number | null;
  };
  executionPolicy: {
    approvalMode: PiSdkRunnerApprovalMode;
    emitReasoning: boolean;
  };
};

export type PiSdkRunnerBootstrapCommand = {
  schemaVersion: typeof sdkRunnerSchemaVersion;
  commandType: "bootstrap";
  input: PiSdkRunnerInput;
};

export type PiSdkRunnerRunTurnCommand = {
  schemaVersion: typeof sdkRunnerSchemaVersion;
  commandType: "run_turn";
  runId: string;
  turnId: string;
  prompt: {
    title: string;
    text: string;
  };
  timeouts: {
    runTimeoutMs: number;
    modelIdleTimeoutMs: number | null;
    toolTimeoutMs: number | null;
  };
  executionPolicy: {
    emitReasoning: boolean;
  };
};

export type PiSdkRunnerShutdownCommand = {
  schemaVersion: typeof sdkRunnerSchemaVersion;
  commandType: "shutdown";
};

export type PiSdkRunnerCommand =
  | PiSdkRunnerBootstrapCommand
  | PiSdkRunnerRunTurnCommand
  | PiSdkRunnerShutdownCommand;

type PiSdkRunnerTerminalResultBase = {
  schemaVersion: typeof sdkRunnerSchemaVersion;
  providerStopReason: string | null;
  finalAssistantMessage: string | null;
  usage: PiSdkRunnerUsage | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
};

export type PiSdkRunnerCompletedTerminalResult =
  PiSdkRunnerTerminalResultBase & {
    kind: "completed";
    stopReason: PiSdkRunnerStopReason;
  };

export type PiSdkRunnerAwaitingInputTerminalResult =
  PiSdkRunnerTerminalResultBase & {
    kind: "awaiting_input";
    stopReason: PiSdkRunnerStopReason;
    reason: string;
    prompt: string;
  };

export type PiSdkRunnerBlockedTerminalResult = PiSdkRunnerTerminalResultBase & {
  kind: "blocked";
  stopReason: PiSdkRunnerStopReason;
  reason: string;
};

export type PiSdkRunnerFailedTerminalResult = PiSdkRunnerTerminalResultBase & {
  kind: "failed";
  stopReason: PiSdkRunnerStopReason | null;
  failureClass: PiSdkRunnerFailureClass;
  reason: string;
};

export type PiSdkRunnerTerminalResult =
  | PiSdkRunnerCompletedTerminalResult
  | PiSdkRunnerAwaitingInputTerminalResult
  | PiSdkRunnerBlockedTerminalResult
  | PiSdkRunnerFailedTerminalResult;

type PiSdkRunnerEventBase<TType extends string> = {
  schemaVersion: typeof sdkRunnerSchemaVersion;
  eventType: TType;
  sequence: number;
  recordedAt: string;
  runId: string;
};

export type PiSdkRunnerSessionStartedEvent =
  PiSdkRunnerEventBase<"session_started"> & {
    sessionId: string;
    threadId: string | null;
    modelId: string;
    cwd: string;
  };

export type PiSdkRunnerPromptStartedEvent =
  PiSdkRunnerEventBase<"prompt_started"> & {
    promptTitle: string;
    promptText: string;
  };

export type PiSdkRunnerAssistantMessageStartedEvent =
  PiSdkRunnerEventBase<"assistant_message_started"> & {
    messageId: string;
  };

export type PiSdkRunnerAssistantTextDeltaEvent =
  PiSdkRunnerEventBase<"assistant_text_delta"> & {
    messageId: string;
    text: string;
  };

export type PiSdkRunnerAssistantReasoningDeltaEvent =
  PiSdkRunnerEventBase<"assistant_reasoning_delta"> & {
    messageId: string;
    text: string;
  };

export type PiSdkRunnerToolCallStartedEvent =
  PiSdkRunnerEventBase<"tool_call_started"> & {
    callId: string;
    toolName: string;
    argumentsText: string | null;
  };

export type PiSdkRunnerToolCallCompletedEvent =
  PiSdkRunnerEventBase<"tool_call_completed"> & {
    callId: string;
    toolName: string;
    outputText: string | null;
  };

export type PiSdkRunnerToolCallFailedEvent =
  PiSdkRunnerEventBase<"tool_call_failed"> & {
    callId: string;
    toolName: string;
    errorMessage: string;
    outputText: string | null;
  };

export type PiSdkRunnerCommandStartedEvent =
  PiSdkRunnerEventBase<"command_started"> & {
    commandId: string;
    commandText: string;
    workingDirectory: string | null;
  };

export type PiSdkRunnerCommandCompletedEvent =
  PiSdkRunnerEventBase<"command_completed"> & {
    commandId: string;
    commandText: string;
    exitCode: number;
    stdout: string | null;
    stderr: string | null;
  };

export type PiSdkRunnerCommandFailedEvent =
  PiSdkRunnerEventBase<"command_failed"> & {
    commandId: string;
    commandText: string;
    exitCode: number | null;
    reason: string;
    stdout: string | null;
    stderr: string | null;
  };

export type PiSdkRunnerFileChangeObservedEvent =
  PiSdkRunnerEventBase<"file_change_observed"> & {
    path: string;
    changeType: PiSdkRunnerFileChangeType;
    diffText: string | null;
  };

export type PiSdkRunnerIdleTimeoutTriggeredEvent =
  PiSdkRunnerEventBase<"idle_timeout_triggered"> & {
    failureClass: "model_idle_timeout";
    thresholdMs: number;
    lastActivityAt: string | null;
    lastActivityType: string | null;
  };

export type PiSdkRunnerRunTimeoutTriggeredEvent =
  PiSdkRunnerEventBase<"run_timeout_triggered"> & {
    failureClass: "run_timeout";
    thresholdMs: number;
    lastActivityAt: string | null;
    lastActivityType: string | null;
  };

export type PiSdkRunnerInputRequiredEvent =
  PiSdkRunnerEventBase<"input_required"> & {
    reason: string;
    prompt: string;
  };

export type PiSdkRunnerTerminalResultEvent =
  PiSdkRunnerEventBase<"terminal_result"> & {
    result: PiSdkRunnerTerminalResult;
  };

export type PiSdkRunnerRunnerErrorEvent =
  PiSdkRunnerEventBase<"runner_error"> & {
    failureClass: PiSdkRunnerFailureClass;
    reason: string;
  };

export type PiSdkRunnerEvent =
  | PiSdkRunnerSessionStartedEvent
  | PiSdkRunnerPromptStartedEvent
  | PiSdkRunnerAssistantMessageStartedEvent
  | PiSdkRunnerAssistantTextDeltaEvent
  | PiSdkRunnerAssistantReasoningDeltaEvent
  | PiSdkRunnerToolCallStartedEvent
  | PiSdkRunnerToolCallCompletedEvent
  | PiSdkRunnerToolCallFailedEvent
  | PiSdkRunnerCommandStartedEvent
  | PiSdkRunnerCommandCompletedEvent
  | PiSdkRunnerCommandFailedEvent
  | PiSdkRunnerFileChangeObservedEvent
  | PiSdkRunnerIdleTimeoutTriggeredEvent
  | PiSdkRunnerRunTimeoutTriggeredEvent
  | PiSdkRunnerInputRequiredEvent
  | PiSdkRunnerTerminalResultEvent
  | PiSdkRunnerRunnerErrorEvent;

const failureClassSet = new Set<string>(piSdkRunnerFailureClasses);
const stopReasonSet = new Set<string>(piSdkRunnerStopReasons);
const approvalModeSet = new Set<string>(piSdkRunnerApprovalModes);
const fileChangeTypeSet = new Set<string>(piSdkRunnerFileChangeTypes);

export function parsePiSdkRunnerInput(value: unknown): PiSdkRunnerInput {
  const record = requireRecord(value, "Pi SDK runner input must be an object.");
  requireSchemaVersion(record, "Pi SDK runner input");

  return {
    schemaVersion: sdkRunnerSchemaVersion,
    runId: requireNonEmptyString(record, "runId"),
    issue: parseIssue(requireRecord(record.issue, "issue must be an object.")),
    workspace: parseWorkspace(
      requireRecord(record.workspace, "workspace must be an object.")
    ),
    prompt: parsePrompt(requireRecord(record.prompt, "prompt must be an object.")),
    model: parseModel(requireRecord(record.model, "model must be an object.")),
    timeouts: parseTimeouts(
      requireRecord(record.timeouts, "timeouts must be an object.")
    ),
    executionPolicy: parseExecutionPolicy(
      requireRecord(
        record.executionPolicy,
        "executionPolicy must be an object."
      )
    )
  };
}

export function parsePiSdkRunnerCommand(value: unknown): PiSdkRunnerCommand {
  const record = requireRecord(value, "Pi SDK runner command must be an object.");
  requireSchemaVersion(record, "Pi SDK runner command");
  const commandType = requireString(record, "commandType");

  switch (commandType) {
    case "bootstrap":
      return {
        schemaVersion: sdkRunnerSchemaVersion,
        commandType,
        input: parsePiSdkRunnerInput(record.input)
      };
    case "run_turn":
      return {
        schemaVersion: sdkRunnerSchemaVersion,
        commandType,
        runId: requireNonEmptyString(record, "runId"),
        turnId: requireNonEmptyString(record, "turnId"),
        prompt: parsePrompt(
          requireRecord(record.prompt, "prompt must be an object.")
        ),
        timeouts: parseTimeouts(
          requireRecord(record.timeouts, "timeouts must be an object.")
        ),
        executionPolicy: parseRunTurnExecutionPolicy(
          requireRecord(
            record.executionPolicy,
            "executionPolicy must be an object."
          )
        )
      };
    case "shutdown":
      return {
        schemaVersion: sdkRunnerSchemaVersion,
        commandType
      };
    default:
      throw new TypeError(
        `Pi SDK runner commandType is unsupported: ${JSON.stringify(commandType)}.`
      );
  }
}

export function parsePiSdkRunnerTerminalResult(
  value: unknown
): PiSdkRunnerTerminalResult {
  const record = requireRecord(
    value,
    "Pi SDK runner terminal result must be an object."
  );
  requireSchemaVersion(record, "Pi SDK runner terminal result");
  const kind = requireString(record, "kind");
  const base = parseTerminalResultBase(record);

  switch (kind) {
    case "completed":
      return {
        ...base,
        kind,
        stopReason: requireStopReason(record, "stopReason")
      };
    case "awaiting_input":
      return {
        ...base,
        kind,
        stopReason: requireStopReason(record, "stopReason"),
        reason: requireNonEmptyString(record, "reason"),
        prompt: requireNonEmptyString(record, "prompt")
      };
    case "blocked":
      return {
        ...base,
        kind,
        stopReason: requireStopReason(record, "stopReason"),
        reason: requireNonEmptyString(record, "reason")
      };
    case "failed":
      return {
        ...base,
        kind,
        stopReason: requireNullableStopReason(record, "stopReason"),
        failureClass: requireFailureClass(record, "failureClass"),
        reason: requireNonEmptyString(record, "reason")
      };
    default:
      throw new TypeError(
        `Pi SDK runner terminal result kind must be one of ["completed","awaiting_input","blocked","failed"]. Received ${JSON.stringify(kind)}.`
      );
  }
}

export function parsePiSdkRunnerEvent(value: unknown): PiSdkRunnerEvent {
  const record = requireRecord(value, "Pi SDK runner event must be an object.");
  requireSchemaVersion(record, "Pi SDK runner event");
  const eventType = requireString(record, "eventType");
  const base = parseEventBase(record);

  switch (eventType) {
    case "session_started":
      return {
        ...base,
        eventType,
        sessionId: requireNonEmptyString(record, "sessionId"),
        threadId: requireNullableString(record, "threadId"),
        modelId: requireNonEmptyString(record, "modelId"),
        cwd: requireNonEmptyString(record, "cwd")
      };
    case "prompt_started":
      return {
        ...base,
        eventType,
        promptTitle: requireNonEmptyString(record, "promptTitle"),
        promptText: requireNonEmptyString(record, "promptText")
      };
    case "assistant_message_started":
      return {
        ...base,
        eventType,
        messageId: requireNonEmptyString(record, "messageId")
      };
    case "assistant_text_delta":
    case "assistant_reasoning_delta":
      return {
        ...base,
        eventType,
        messageId: requireNonEmptyString(record, "messageId"),
        text: requireNonEmptyString(record, "text")
      };
    case "tool_call_started":
      return {
        ...base,
        eventType,
        callId: requireNonEmptyString(record, "callId"),
        toolName: requireNonEmptyString(record, "toolName"),
        argumentsText: requireNullableString(record, "argumentsText")
      };
    case "tool_call_completed":
      return {
        ...base,
        eventType,
        callId: requireNonEmptyString(record, "callId"),
        toolName: requireNonEmptyString(record, "toolName"),
        outputText: requireNullableString(record, "outputText")
      };
    case "tool_call_failed":
      return {
        ...base,
        eventType,
        callId: requireNonEmptyString(record, "callId"),
        toolName: requireNonEmptyString(record, "toolName"),
        errorMessage: requireNonEmptyString(record, "errorMessage"),
        outputText: requireNullableString(record, "outputText")
      };
    case "command_started":
      return {
        ...base,
        eventType,
        commandId: requireNonEmptyString(record, "commandId"),
        commandText: requireNonEmptyString(record, "commandText"),
        workingDirectory: requireNullableString(record, "workingDirectory")
      };
    case "command_completed":
      return {
        ...base,
        eventType,
        commandId: requireNonEmptyString(record, "commandId"),
        commandText: requireNonEmptyString(record, "commandText"),
        exitCode: requireNonNegativeInteger(record, "exitCode"),
        stdout: requireNullableString(record, "stdout"),
        stderr: requireNullableString(record, "stderr")
      };
    case "command_failed":
      return {
        ...base,
        eventType,
        commandId: requireNonEmptyString(record, "commandId"),
        commandText: requireNonEmptyString(record, "commandText"),
        exitCode: requireNullableNonNegativeInteger(record, "exitCode"),
        reason: requireNonEmptyString(record, "reason"),
        stdout: requireNullableString(record, "stdout"),
        stderr: requireNullableString(record, "stderr")
      };
    case "file_change_observed":
      return {
        ...base,
        eventType,
        path: requireNonEmptyString(record, "path"),
        changeType: requireFileChangeType(record, "changeType"),
        diffText: requireNullableString(record, "diffText")
      };
    case "idle_timeout_triggered":
      return {
        ...base,
        eventType,
        failureClass: requireExactFailureClass(
          record,
          "failureClass",
          "model_idle_timeout"
        ),
        thresholdMs: requirePositiveInteger(record, "thresholdMs"),
        lastActivityAt: requireNullableTimestamp(record, "lastActivityAt"),
        lastActivityType: requireNullableString(record, "lastActivityType")
      };
    case "run_timeout_triggered":
      return {
        ...base,
        eventType,
        failureClass: requireExactFailureClass(
          record,
          "failureClass",
          "run_timeout"
        ),
        thresholdMs: requirePositiveInteger(record, "thresholdMs"),
        lastActivityAt: requireNullableTimestamp(record, "lastActivityAt"),
        lastActivityType: requireNullableString(record, "lastActivityType")
      };
    case "input_required":
      return {
        ...base,
        eventType,
        reason: requireNonEmptyString(record, "reason"),
        prompt: requireNonEmptyString(record, "prompt")
      };
    case "terminal_result":
      return {
        ...base,
        eventType,
        result: parsePiSdkRunnerTerminalResult(record.result)
      };
    case "runner_error":
      return {
        ...base,
        eventType,
        failureClass: requireFailureClass(record, "failureClass"),
        reason: requireNonEmptyString(record, "reason")
      };
    default:
      throw new TypeError(
        `Pi SDK runner eventType is unsupported: ${JSON.stringify(eventType)}.`
      );
  }
}

function parseIssue(
  record: Record<string, unknown>
): PiSdkRunnerInput["issue"] {
  return {
    id: requireNonEmptyString(record, "id"),
    identifier: requireNonEmptyString(record, "identifier"),
    title: requireNonEmptyString(record, "title")
  };
}

function parseWorkspace(
  record: Record<string, unknown>
): PiSdkRunnerInput["workspace"] {
  return {
    cwd: requireNonEmptyString(record, "cwd"),
    sessionFile: requireNonEmptyString(record, "sessionFile"),
    agentDir: requireNullableString(record, "agentDir")
  };
}

function parsePrompt(
  record: Record<string, unknown>
): PiSdkRunnerInput["prompt"] {
  return {
    title: requireNonEmptyString(record, "title"),
    text: requireNonEmptyString(record, "text")
  };
}

function parseModel(
  record: Record<string, unknown>
): PiSdkRunnerInput["model"] {
  return {
    id: requireNonEmptyString(record, "id"),
    reasoningEffort: requireNonEmptyString(record, "reasoningEffort"),
    profile: requireNullableString(record, "profile"),
    providerId: requireNullableString(record, "providerId"),
    providerName: requireNullableString(record, "providerName")
  };
}

function parseTimeouts(
  record: Record<string, unknown>
): PiSdkRunnerInput["timeouts"] {
  return {
    runTimeoutMs: requirePositiveInteger(record, "runTimeoutMs"),
    modelIdleTimeoutMs: requireNullablePositiveInteger(
      record,
      "modelIdleTimeoutMs"
    ),
    toolTimeoutMs: requireNullablePositiveInteger(record, "toolTimeoutMs")
  };
}

function parseExecutionPolicy(
  record: Record<string, unknown>
): PiSdkRunnerInput["executionPolicy"] {
  const approvalMode = requireString(record, "approvalMode");
  if (!approvalModeSet.has(approvalMode)) {
    throw new TypeError(
      `approvalMode must be one of ${JSON.stringify(piSdkRunnerApprovalModes)}.`
    );
  }

  return {
    approvalMode: approvalMode as PiSdkRunnerApprovalMode,
    emitReasoning: requireBoolean(record, "emitReasoning")
  };
}

function parseRunTurnExecutionPolicy(
  record: Record<string, unknown>
): PiSdkRunnerRunTurnCommand["executionPolicy"] {
  return {
    emitReasoning: requireBoolean(record, "emitReasoning")
  };
}

function parseTerminalResultBase(
  record: Record<string, unknown>
): PiSdkRunnerTerminalResultBase {
  return {
    schemaVersion: sdkRunnerSchemaVersion,
    providerStopReason: requireNullableString(record, "providerStopReason"),
    finalAssistantMessage: requireNullableString(record, "finalAssistantMessage"),
    usage: requireNullableUsage(record, "usage"),
    lastActivityAt: requireNullableTimestamp(record, "lastActivityAt"),
    lastActivityType: requireNullableString(record, "lastActivityType")
  };
}

function parseEventBase(
  record: Record<string, unknown>
): Omit<PiSdkRunnerEventBase<string>, "eventType"> {
  return {
    schemaVersion: sdkRunnerSchemaVersion,
    sequence: requirePositiveInteger(record, "sequence"),
    recordedAt: requireTimestamp(record, "recordedAt"),
    runId: requireNonEmptyString(record, "runId")
  };
}

function requireSchemaVersion(
  record: Record<string, unknown>,
  label: string
): void {
  const schemaVersion = requireString(record, "schemaVersion");
  if (schemaVersion !== sdkRunnerSchemaVersion) {
    throw new TypeError(
      `${label} schemaVersion must be "${sdkRunnerSchemaVersion}". Received ${JSON.stringify(schemaVersion)}.`
    );
  }
}

function requireRecord(
  value: unknown,
  message: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }

  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a string.`);
  }

  return value;
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string
): string {
  const value = requireString(record, key).trim();
  if (value === "") {
    throw new TypeError(`${key} must be a non-empty string.`);
  }

  return value;
}

function requireNullableString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a string or null.`);
  }

  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new TypeError(`${key} must be a boolean.`);
  }

  return value;
}

function requireTimestamp(
  record: Record<string, unknown>,
  key: string
): string {
  const value = requireNonEmptyString(record, key);
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${key} must be an ISO-8601 timestamp.`);
  }

  return value;
}

function requireNullableTimestamp(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${key} must be an ISO-8601 timestamp or null.`);
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${key} must be an ISO-8601 timestamp or null.`);
  }

  return value;
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string
): number {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${key} must be a positive integer.`);
  }

  return value as number;
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  key: string
): number {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${key} must be a non-negative integer.`);
  }

  return value as number;
}

function requireNullablePositiveInteger(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${key} must be a positive integer or null.`);
  }

  return value as number;
}

function requireNullableNonNegativeInteger(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${key} must be a non-negative integer or null.`);
  }

  return value as number;
}

function requireFailureClass(
  record: Record<string, unknown>,
  key: string
): PiSdkRunnerFailureClass {
  const value = requireString(record, key);
  if (!failureClassSet.has(value)) {
    throw new TypeError(
      `${key} must be one of ${JSON.stringify(piSdkRunnerFailureClasses)}.`
    );
  }

  return value as PiSdkRunnerFailureClass;
}

function requireExactFailureClass<TClass extends PiSdkRunnerFailureClass>(
  record: Record<string, unknown>,
  key: string,
  expected: TClass
): TClass {
  const value = requireFailureClass(record, key);
  if (value !== expected) {
    throw new TypeError(
      `${key} must be ${JSON.stringify(expected)} for this event type.`
    );
  }

  return expected;
}

function requireStopReason(
  record: Record<string, unknown>,
  key: string
): PiSdkRunnerStopReason {
  const value = requireString(record, key);
  if (!stopReasonSet.has(value)) {
    throw new TypeError(
      `${key} must be one of ${JSON.stringify(piSdkRunnerStopReasons)}.`
    );
  }

  return value as PiSdkRunnerStopReason;
}

function requireNullableStopReason(
  record: Record<string, unknown>,
  key: string
): PiSdkRunnerStopReason | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !stopReasonSet.has(value)) {
    throw new TypeError(
      `${key} must be one of ${JSON.stringify(piSdkRunnerStopReasons)} or null.`
    );
  }

  return value as PiSdkRunnerStopReason;
}

function requireFileChangeType(
  record: Record<string, unknown>,
  key: string
): PiSdkRunnerFileChangeType {
  const value = requireString(record, key);
  if (!fileChangeTypeSet.has(value)) {
    throw new TypeError(
      `${key} must be one of ${JSON.stringify(piSdkRunnerFileChangeTypes)}.`
    );
  }

  return value as PiSdkRunnerFileChangeType;
}

function requireNullableUsage(
  record: Record<string, unknown>,
  key: string
): PiSdkRunnerUsage | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }

  const usage = requireRecord(value, `${key} must be an object or null.`);
  return {
    inputTokens: requireNonNegativeInteger(usage, "inputTokens"),
    cachedInputTokens: requireNonNegativeInteger(usage, "cachedInputTokens"),
    outputTokens: requireNonNegativeInteger(usage, "outputTokens"),
    totalTokens: requireNonNegativeInteger(usage, "totalTokens")
  };
}
