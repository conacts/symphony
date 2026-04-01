import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import type {
  SymphonyResolvedWorkflowConfig,
  SymphonyTrackerIssue
} from "@symphony/core";

const initializeRequestId = 1;
const threadStartRequestId = 2;
const turnStartRequestId = 3;
const nonInteractiveToolInputAnswer =
  "This is a non-interactive session. Operator input is unavailable.";
const defaultCodexModel = "gpt-5.4";
const defaultCodexReasoningEffort = "xhigh";
const supportedCodexModels = new Set([
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark"
]);
const supportedCodexReasoningEfforts = new Set([
  "low",
  "medium",
  "high",
  "xhigh"
]);
const codexModelLabelPrefix = "symphony:model:";
const codexReasoningLabelPrefix = "symphony:reasoning:";
const streamLogWarningPattern = /\b(error|warn|warning|failed|fatal|panic|exception)\b/i;

type CodexAppServerLogger = {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

type CodexLaunchSettings = {
  command: string;
  model: string;
  reasoningEffort: string;
};

type ControlMessageResult =
  | "continue"
  | "approval_required"
  | "input_required"
  | "unhandled";

export class CodexAppServerError extends Error {
  readonly code: string;
  readonly detail: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "CodexAppServerError";
    this.code = code;
    this.detail = detail ?? null;
  }
}

export type CodexAppServerSession = {
  client: CodexAppServerClient;
  threadId: string;
  workspacePath: string;
  issue: SymphonyTrackerIssue;
  processId: string | null;
  autoApproveRequests: boolean;
  approvalPolicy: string | Record<string, unknown>;
  model: string;
  reasoningEffort: string;
};

export type CodexAppServerTurnResult = {
  sessionId: string;
  threadId: string;
  turnId: string;
};

export type CodexAppServerToolExecutor = (
  toolName: string | null,
  argumentsPayload: unknown
) => Promise<Record<string, unknown>>;

export class CodexAppServerClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #pendingResponses = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  readonly #queuedMessages: Record<string, unknown>[] = [];
  readonly #messageWaiters: Array<(message: Record<string, unknown>) => void> = [];
  readonly #requestTimeoutMs: number;
  readonly #logger: CodexAppServerLogger;
  readonly processId: string | null;
  #closed = false;

  constructor(input: {
    command: string;
    workspacePath: string;
    readTimeoutMs: number;
    logger: CodexAppServerLogger;
  }) {
    this.#requestTimeoutMs = input.readTimeoutMs;
    this.#logger = input.logger;

    const child = spawn("bash", ["-lc", input.command], {
      cwd: input.workspacePath,
      stdio: "pipe"
    });
    this.#child = child;
    this.processId = child.pid ? String(child.pid) : null;

    attachLineBuffer(child.stdout, (line) => {
      this.#handleLine(line, "stdout");
    });
    attachLineBuffer(child.stderr, (line) => {
      this.#handleLine(line, "stderr");
    });

    child.once("exit", (code, signal) => {
      const reason = signal ? `signal:${signal}` : `code:${code ?? "unknown"}`;
      this.#closed = true;

      for (const [, pending] of this.#pendingResponses) {
        pending.reject(new Error(`Codex app-server exited (${reason}).`));
      }
      this.#pendingResponses.clear();

      while (this.#messageWaiters.length > 0) {
        const waiter = this.#messageWaiters.shift();
        waiter?.({
          method: "port/exited",
          params: {
            reason
          }
        });
      }
    });
  }

  static async startSession(input: {
    workspacePath: string;
    workflowConfig: SymphonyResolvedWorkflowConfig;
    issue: SymphonyTrackerIssue;
    logger: CodexAppServerLogger;
  }): Promise<CodexAppServerSession> {
    const workspacePath = await validateWorkspaceCwd(
      input.workspacePath,
      input.workflowConfig.workspace.root
    );
    const launchSettings = resolveCodexLaunchSettings(
      input.workflowConfig.codex.command,
      input.issue
    );
    const client = new CodexAppServerClient({
      command: launchSettings.command,
      workspacePath,
      readTimeoutMs: input.workflowConfig.codex.readTimeoutMs,
      logger: input.logger
    });

    try {
      await client.sendRequest(initializeRequestId, "initialize", {
        capabilities: {
          experimentalApi: true
        },
        clientInfo: {
          name: "symphony-orchestrator",
          title: "Symphony Orchestrator",
          version: "0.1.0"
        }
      });
      client.sendNotification("initialized", {});

      const threadResponse = await client.sendRequest(
        threadStartRequestId,
        "thread/start",
        {
          approvalPolicy: input.workflowConfig.codex.approvalPolicy,
          sandbox: input.workflowConfig.codex.threadSandbox,
          cwd: workspacePath,
          dynamicTools: buildDynamicToolSpecs()
        }
      );
      const threadId =
        getStringPath(threadResponse, ["thread", "id"]) ??
        getStringPath(threadResponse, ["id"]);

      if (!threadId) {
        throw new CodexAppServerError(
          "invalid_thread_payload",
          "Codex thread/start response did not include a thread id.",
          threadResponse
        );
      }

      return {
        client,
        threadId,
        workspacePath,
        issue: input.issue,
        processId: client.processId,
        autoApproveRequests: input.workflowConfig.codex.approvalPolicy === "never",
        approvalPolicy: input.workflowConfig.codex.approvalPolicy,
        model: launchSettings.model,
        reasoningEffort: launchSettings.reasoningEffort
      };
    } catch (error) {
      client.close();
      throw wrapSessionError(error);
    }
  }

  async runTurn(
    session: CodexAppServerSession,
    input: {
      prompt: string;
      title: string;
      sandboxPolicy: Record<string, unknown> | null;
      toolExecutor: CodexAppServerToolExecutor;
      onMessage: (message: Record<string, unknown>) => Promise<void> | void;
      turnTimeoutMs: number;
    }
  ): Promise<CodexAppServerTurnResult> {
    const turnResponse = await this.sendRequest(turnStartRequestId, "turn/start", {
      threadId: session.threadId,
      input: [
        {
          type: "text",
          text: input.prompt
        }
      ],
      cwd: session.workspacePath,
      title: input.title,
      approvalPolicy: session.approvalPolicy,
      sandboxPolicy: input.sandboxPolicy
    });

    const turnId =
      getStringPath(turnResponse, ["turn", "id"]) ??
      getStringPath(turnResponse, ["id"]);

    if (!turnId) {
      throw new CodexAppServerError(
        "invalid_turn_payload",
        "Codex turn/start response did not include a turn id.",
        turnResponse
      );
    }

    const sessionId = `${session.threadId}-${turnId}`;

    await input.onMessage({
      event: "session_started",
      session_id: sessionId,
      thread_id: session.threadId,
      turn_id: turnId,
      codex_app_server_pid: session.processId,
      model: session.model,
      reasoning_effort: session.reasoningEffort
    });

    while (true) {
      const message = await this.awaitMessage(input.turnTimeoutMs);
      const explicitEvent = getString(message, "event");
      const method = getString(message, "method");

      if (explicitEvent && !method) {
        await input.onMessage(message);
        continue;
      }

      if (!method) {
        continue;
      }

      const handled = await this.#maybeHandleControlRequest(
        session,
        message,
        input.toolExecutor,
        input.onMessage
      );

      if (handled === "continue") {
        continue;
      }

      if (handled === "approval_required") {
        await input.onMessage({
          event: "approval_required",
          payload: message,
          raw: getString(message, "raw")
        });

        throw new CodexAppServerError(
          "approval_required",
          "Codex approval request requires operator input.",
          message
        );
      }

      if (handled === "input_required") {
        await input.onMessage({
          event: "turn_input_required",
          payload: message,
          raw: getString(message, "raw")
        });

        throw new CodexAppServerError(
          "turn_input_required",
          "Codex turn requires operator input.",
          message
        );
      }

      if (method === "port/exited") {
        throw new CodexAppServerError(
          "port_exited",
          `Codex app-server exited (${JSON.stringify(getRecord(message, "params") ?? {})}).`,
          message
        );
      }

      if (needsInput(method, message)) {
        await input.onMessage({
          event: "turn_input_required",
          payload: message,
          raw: getString(message, "raw")
        });

        throw new CodexAppServerError(
          "turn_input_required",
          "Codex turn requires operator input.",
          message
        );
      }

      if (method === "turn/completed") {
        await input.onMessage({
          event: "turn_completed",
          ...message
        });

        return {
          sessionId,
          threadId: session.threadId,
          turnId
        };
      }

      if (method === "turn/failed") {
        await input.onMessage({
          event: "turn_failed",
          ...message
        });
        throw new CodexAppServerError("turn_failed", "Codex turn failed.", message);
      }

      if (method === "turn/cancelled") {
        await input.onMessage({
          event: "turn_cancelled",
          ...message
        });
        throw new CodexAppServerError(
          "turn_cancelled",
          "Codex turn was cancelled.",
          message
        );
      }

      await input.onMessage({
        event: method,
        ...message
      });
    }
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#child.kill("SIGTERM");
  }

  async #maybeHandleControlRequest(
    session: CodexAppServerSession,
    message: Record<string, unknown>,
    toolExecutor: CodexAppServerToolExecutor,
    onMessage: (message: Record<string, unknown>) => Promise<void> | void
  ): Promise<ControlMessageResult> {
    const method = getString(message, "method");
    const id = getNumber(message, "id");
    const params = getRecord(message, "params") ?? {};
    const raw = getString(message, "raw");

    if (!method || id === null) {
      return "unhandled";
    }

    if (method === "item/tool/call") {
      const toolName = toolCallName(params);
      const argumentsPayload = toolCallArguments(params);

      try {
        const result = normalizeToolResult(
          await toolExecutor(toolName, argumentsPayload)
        );

        this.sendResponse(id, result);

        await onMessage({
          event:
            result.success === true
              ? "tool_call_completed"
              : toolName === null
                ? "unsupported_tool_call"
                : "tool_call_failed",
          payload: message,
          raw
        });
      } catch (error) {
        const result = normalizeToolResult({
          success: false,
          output: error instanceof Error ? error.message : String(error)
        });

        this.sendResponse(id, result);
        await onMessage({
          event: toolName === null ? "unsupported_tool_call" : "tool_call_failed",
          payload: message,
          raw
        });
      }

      return "continue";
    }

    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval"
    ) {
      if (!session.autoApproveRequests) {
        return "approval_required";
      }

      this.sendResponse(id, {
        decision: "acceptForSession"
      });
      await onMessage({
        event: "approval_auto_approved",
        payload: message,
        raw,
        decision: "acceptForSession"
      });
      return "continue";
    }

    if (method === "execCommandApproval" || method === "applyPatchApproval") {
      if (!session.autoApproveRequests) {
        return "approval_required";
      }

      this.sendResponse(id, {
        decision: "approved_for_session"
      });
      await onMessage({
        event: "approval_auto_approved",
        payload: message,
        raw,
        decision: "approved_for_session"
      });
      return "continue";
    }

    if (method === "item/tool/requestUserInput") {
      const approvalAnswers = session.autoApproveRequests
        ? buildApprovalAnswers(params)
        : null;

      if (approvalAnswers) {
        this.sendResponse(id, {
          answers: approvalAnswers.answers
        });
        await onMessage({
          event: "approval_auto_approved",
          payload: message,
          raw,
          decision: approvalAnswers.decision
        });
        return "continue";
      }

      const unavailableAnswers = buildUnavailableAnswers(params);
      if (!unavailableAnswers) {
        return "input_required";
      }

      this.sendResponse(id, {
        answers: unavailableAnswers
      });
      await onMessage({
        event: "tool_input_auto_answered",
        payload: message,
        raw,
        answer: nonInteractiveToolInputAnswer
      });
      return "continue";
    }

    return "unhandled";
  }

  async sendRequest(
    id: number,
    method: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingResponses.delete(id);
        reject(new Error(`Timed out waiting for Codex response ${id}.`));
      }, this.#requestTimeoutMs);

      this.#pendingResponses.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      const line = JSON.stringify({
        id,
        method,
        params
      });

      this.#child.stdin.write(`${line}\n`);
    });
  }

  sendNotification(method: string, params: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  sendResponse(id: number, result: Record<string, unknown>): void {
    this.#child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  async awaitMessage(timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.#queuedMessages.length > 0) {
      return this.#queuedMessages.shift()!;
    }

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.#messageWaiters.indexOf(waiter);
        if (index >= 0) {
          this.#messageWaiters.splice(index, 1);
        }
        reject(new Error("Timed out waiting for Codex app-server message."));
      }, timeoutMs);

      const waiter = (message: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(message);
      };

      this.#messageWaiters.push(waiter);
    });
  }

  #handleLine(line: string, stream: "stdout" | "stderr"): void {
    const trimmed = line.trim();
    if (trimmed === "") {
      return;
    }

    const parsed = safeJsonParse(trimmed);
    if (!parsed) {
      logNonJsonStreamLine(this.#logger, trimmed, stream);

      if (protocolMessageCandidate(trimmed)) {
        this.#enqueueMessage({
          event: "malformed",
          payload: trimmed,
          raw: trimmed
        });
      }

      return;
    }

    const message = {
      ...parsed,
      raw: trimmed
    };
    const id = getNumber(parsed, "id");
    if (id !== null && !("method" in parsed)) {
      const pending = this.#pendingResponses.get(id);
      if (!pending) {
        return;
      }

      this.#pendingResponses.delete(id);

      const errorPayload = getRecord(parsed, "error");
      if (errorPayload) {
        pending.reject(new Error(JSON.stringify(errorPayload)));
        return;
      }

      pending.resolve(getRecord(parsed, "result") ?? parsed);
      return;
    }

    this.#enqueueMessage(message);
  }

  #enqueueMessage(message: Record<string, unknown>): void {
    const waiter = this.#messageWaiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }

    this.#queuedMessages.push(message);
  }
}

function attachLineBuffer(
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

function wrapSessionError(error: unknown): Error {
  if (error instanceof CodexAppServerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Timed out waiting for Codex response 1")) {
    return new CodexAppServerError("initialize_failed", message, error);
  }

  if (message.includes("Timed out waiting for Codex response 2")) {
    return new CodexAppServerError("thread_start_failed", message, error);
  }

  return error instanceof Error ? error : new Error(message);
}

async function validateWorkspaceCwd(
  workspacePath: string,
  workspaceRoot: string
): Promise<string> {
  const expandedWorkspace = path.resolve(workspacePath);
  const expandedRoot = path.resolve(workspaceRoot);
  const expandedRootPrefix = `${expandedRoot}${path.sep}`;

  try {
    const canonicalWorkspace = await realpath(expandedWorkspace);
    const canonicalRoot = await realpath(expandedRoot);
    const canonicalRootPrefix = `${canonicalRoot}${path.sep}`;

    if (canonicalWorkspace === canonicalRoot) {
      throw new CodexAppServerError(
        "invalid_workspace_cwd",
        `Workspace path must not equal the workspace root: ${canonicalWorkspace}`,
        {
          reason: "workspace_root",
          path: canonicalWorkspace
        }
      );
    }

    if (canonicalWorkspace.startsWith(canonicalRootPrefix)) {
      return canonicalWorkspace;
    }

    if (expandedWorkspace.startsWith(expandedRootPrefix)) {
      throw new CodexAppServerError(
        "invalid_workspace_cwd",
        `Workspace path escaped the workspace root via symlink: ${expandedWorkspace}`,
        {
          reason: "symlink_escape",
          path: expandedWorkspace,
          root: canonicalRoot
        }
      );
    }

    throw new CodexAppServerError(
      "invalid_workspace_cwd",
      `Workspace path is outside the workspace root: ${canonicalWorkspace}`,
      {
        reason: "outside_workspace_root",
        path: canonicalWorkspace,
        root: canonicalRoot
      }
    );
  } catch (error) {
    if (error instanceof CodexAppServerError) {
      throw error;
    }

    throw new CodexAppServerError(
      "invalid_workspace_cwd",
      `Workspace path could not be resolved: ${expandedWorkspace}`,
      {
        reason: "path_unreadable",
        path: expandedWorkspace,
        error: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

function resolveCodexLaunchSettings(
  baseCommand: string,
  issue: SymphonyTrackerIssue
): CodexLaunchSettings {
  const model = selectCodexIssueOverride(
    issue,
    codexModelLabelPrefix,
    supportedCodexModels,
    defaultCodexModel,
    "model"
  );
  const reasoningEffort = selectCodexIssueOverride(
    issue,
    codexReasoningLabelPrefix,
    supportedCodexReasoningEfforts,
    defaultCodexReasoningEffort,
    "reasoning_effort"
  );
  const cleanedCommand = stripCodexReasoningOverrides(
    stripCodexModelOverrides(baseCommand)
  ).trim();
  const appServerMatch = /(?:^|\s)(app-server)(?=\s|$)/.exec(cleanedCommand);

  if (!appServerMatch || appServerMatch.index === undefined) {
    throw new CodexAppServerError(
      "invalid_codex_command",
      `Codex command must include app-server: ${baseCommand}`,
      {
        reason: "missing_app_server",
        command: baseCommand
      }
    );
  }

  const appServerIndex = appServerMatch.index + appServerMatch[0].lastIndexOf("app-server");
  const beforeAppServer = cleanedCommand.slice(0, appServerIndex).trimEnd();
  const appServerAndAfter = cleanedCommand.slice(appServerIndex).trimStart();

  return {
    command: [
      beforeAppServer,
      `--model ${model}`,
      `--config model_reasoning_effort=${reasoningEffort}`,
      appServerAndAfter
    ]
      .filter((segment) => segment !== "")
      .join(" "),
    model,
    reasoningEffort
  };
}

function selectCodexIssueOverride(
  issue: SymphonyTrackerIssue,
  prefix: string,
  supportedValues: Set<string>,
  defaultValue: string,
  kind: string
): string {
  const values = (Array.isArray(issue.labels) ? issue.labels : [])
    .map((label) => normalizeCodexLabel(label))
    .filter((label) => label.startsWith(prefix))
    .map((label) => normalizeCodexLabelValue(label.slice(prefix.length)))
    .filter((value) => value !== "")
    .sort();
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 0) {
    return defaultValue;
  }

  if (uniqueValues.length > 1) {
    throw new CodexAppServerError(
      "invalid_issue_label_override",
      `Conflicting Codex ${kind} labels: ${uniqueValues.join(", ")}`,
      {
        kind,
        values: uniqueValues
      }
    );
  }

  const value = uniqueValues[0]!;
  if (supportedValues.has(value)) {
    return value;
  }

  throw new CodexAppServerError(
    "invalid_issue_label_override",
    `Unsupported Codex ${kind} label override: ${value}`,
    {
      kind,
      value,
      supportedValues: [...supportedValues]
    }
  );
}

function normalizeCodexLabel(label: string): string {
  return label.trim().toLowerCase();
}

function normalizeCodexLabelValue(value: string): string {
  return normalizeCodexLabel(value).replace(/\s+/g, "-");
}

function stripCodexModelOverrides(command: string): string {
  return command.replace(/\s+(?:--model|-m)\s+\S+/g, "");
}

function stripCodexReasoningOverrides(command: string): string {
  return command.replace(
    /\s+(?:--config|-c)\s+(?:["'])?model_reasoning_effort=[^"'\s]+(?:["'])?/g,
    ""
  );
}

function buildDynamicToolSpecs(): Array<Record<string, unknown>> {
  return [
    {
      name: "linear_graphql",
      description:
        "Execute a raw GraphQL query or mutation against Linear using Symphony's configured auth.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description:
              "GraphQL query or mutation document to execute against Linear."
          },
          variables: {
            type: ["object", "null"],
            description: "Optional GraphQL variables object.",
            additionalProperties: true
          }
        }
      }
    }
  ];
}

function buildApprovalAnswers(
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

function buildUnavailableAnswers(
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

function normalizeToolResult(result: Record<string, unknown>): Record<string, unknown> & {
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

function toolResultOutput(result: Record<string, unknown>): string {
  const contentItems = Array.isArray(result.contentItems) ? result.contentItems : [];
  const firstItem = asRecord(contentItems[0]);
  const firstText = getString(firstItem, "text");

  if (firstText) {
    return firstText;
  }

  return JSON.stringify(result, null, 2);
}

function toolCallName(params: Record<string, unknown>): string | null {
  const value = getString(params, "tool") ?? getString(params, "name");
  return value ? value.trim() : null;
}

function toolCallArguments(params: Record<string, unknown>): unknown {
  return params.arguments ?? {};
}

function safeJsonParse(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function needsInput(
  method: string,
  payload: Record<string, unknown>
): boolean {
  return method.startsWith("turn/") && inputRequiredMethod(method, payload);
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
      "turn/request_input",
      "turn/request_response",
      "turn/provide_input",
      "turn/approval_required"
    ].includes(method) || requestPayloadRequiresInput(payload)
  );
}

function requestPayloadRequiresInput(payload: Record<string, unknown>): boolean {
  return (
    needsInputField(payload) ||
    needsInputField(getRecord(payload, "params"))
  );
}

function needsInputField(payload: Record<string, unknown> | null): boolean {
  if (!payload) {
    return false;
  }

  return (
    payload.requiresInput === true ||
    payload.needsInput === true ||
    payload.input_required === true ||
    payload.inputRequired === true ||
    payload.type === "input_required" ||
    payload.type === "needs_input"
  );
}

function logNonJsonStreamLine(
  logger: CodexAppServerLogger,
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

function protocolMessageCandidate(line: string): boolean {
  return line.trimStart().startsWith("{");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRecord(
  value: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null {
  const nested = value?.[key];
  return nested !== null && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

function getArray(
  value: Record<string, unknown> | null | undefined,
  key: string
): unknown[] {
  const nested = value?.[key];
  return Array.isArray(nested) ? nested : [];
}

function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function getStringPath(
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

function getNumber(
  value: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const nested = value?.[key];
  return typeof nested === "number" && Number.isFinite(nested) ? nested : null;
}
