import type { Readable } from "node:stream";
import type { HarnessSessionLogger } from "./session-types.js";

const streamLogWarningPattern = /\b(error|warn|warning|failed|fatal|panic|exception)\b/i;

export const nonInteractiveToolInputAnswer =
  "This is a non-interactive session. Operator input is unavailable.";

export function attachLineBuffer(
  stream: Readable,
  onLine: (line: string) => void
): void {
  let buffer = "";

  stream.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      onLine(line);
    }
  });
}

export function buildApprovalAnswers(
  params: Record<string, unknown>
): {
  answers: Record<string, { answers: string[] }>;
  decision: string;
} | null {
  const questions = getArray(params, "questions");
  if (questions.length === 0) {
    return null;
  }

  const answers: Record<string, { answers: string[] }> = {};

  for (const question of questions) {
    const record = asRecord(question);
    const questionId = record ? getString(record, "id") : null;
    const options = record ? getArray(record, "options") : [];
    const answer = selectApprovalOption(options);

    if (!questionId || !answer) {
      return null;
    }

    answers[questionId] = {
      answers: [answer]
    };
  }

  return {
    answers,
    decision: "Approve this Session"
  };
}

export function buildUnavailableAnswers(
  params: Record<string, unknown>
): Record<string, { answers: string[] }> | null {
  const questions = getArray(params, "questions");
  if (questions.length === 0) {
    return null;
  }

  const answers: Record<string, { answers: string[] }> = {};

  for (const question of questions) {
    const record = asRecord(question);
    const questionId = record ? getString(record, "id") : null;

    if (!questionId) {
      return null;
    }

    answers[questionId] = {
      answers: [nonInteractiveToolInputAnswer]
    };
  }

  return answers;
}

export function normalizeToolResult(
  result: Record<string, unknown>
): Record<string, unknown> & {
  success: boolean;
  output: string;
  contentItems: unknown[];
} {
  const success = typeof result.success === "boolean" ? result.success : false;
  const output =
    typeof result.output === "string"
      ? result.output
      : toolResultOutput(result);
  const contentItems = Array.isArray(result.contentItems)
    ? result.contentItems
    : [
        {
          type: "inputText",
          text: output
        }
      ];

  return {
    ...result,
    success,
    output,
    contentItems
  };
}

export function toolCallName(params: Record<string, unknown>): string | null {
  const value = getString(params, "tool") ?? getString(params, "name");
  return value ? value.trim() : null;
}

export function toolCallArguments(params: Record<string, unknown>): unknown {
  return params.arguments ?? {};
}

export function safeJsonParse(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

export function needsInput(
  method: string,
  payload: Record<string, unknown>
): boolean {
  return method.startsWith("turn/") && inputRequiredMethod(method, payload);
}

export function logNonJsonStreamLine(
  logger: HarnessSessionLogger,
  line: string,
  stream: "stdout" | "stderr"
): void {
  const message = `Codex app-server ${stream} output`;

  if (streamLogWarningPattern.test(line)) {
    logger.warn(message, {
      line
    });
    return;
  }

  logger.debug(message, {
    line
  });
}

export function protocolMessageCandidate(line: string): boolean {
  return line.trimStart().startsWith("{");
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getRecord(
  value: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null {
  const nested = value?.[key];
  return nested !== null && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

export function getArray(
  value: Record<string, unknown> | null | undefined,
  key: string
): unknown[] {
  const nested = value?.[key];
  return Array.isArray(nested) ? nested : [];
}

export function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

export function getStringPath(
  value: Record<string, unknown> | null | undefined,
  pathSegments: string[]
): string | null {
  let current: unknown = value;

  for (const segment of pathSegments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" && current.trim() !== "" ? current : null;
}

export function getNumber(
  value: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const nested = value?.[key];
  return typeof nested === "number" && Number.isFinite(nested) ? nested : null;
}

function selectApprovalOption(options: unknown[]): string | null {
  const labels = options
    .map((option) => getString(asRecord(option), "label"))
    .filter((label): label is string => typeof label === "string");

  return (
    labels.find((label) => label === "Approve this Session") ??
    labels.find((label) => label === "Approve Once") ??
    labels.find((label) => /^approve|^allow/i.test(label)) ??
    null
  );
}

function toolResultOutput(result: Record<string, unknown>): string {
  const contentItems = Array.isArray(result.contentItems) ? result.contentItems : [];
  const firstItem = asRecord(contentItems[0]);
  const firstText = getString(firstItem, "text");

  if (firstText) {
    return firstText;
  }

  return JSON.stringify(result, null, 2);
}

function inputRequiredMethod(
  method: string,
  payload: Record<string, unknown>
): boolean {
  return (
    [
      "turn/input_required",
      "turn/needs_input",
      "turn/need_input",
      "turn/waiting_input"
    ].includes(method) ||
    needsInputField(payload) ||
    needsInputField(getRecord(payload, "params"))
  );
}

function needsInputField(payload: Record<string, unknown> | null): boolean {
  if (!payload) {
    return false;
  }

  return (
    payload.needsInput === true ||
    payload.inputRequired === true ||
    payload.requiresInput === true ||
    getString(payload, "status") === "input_required"
  );
}
