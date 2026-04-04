export type SymphonyCodexJsonValue =
  | string
  | number
  | boolean
  | null
  | SymphonyCodexJsonValue[]
  | { [key: string]: SymphonyCodexJsonValue };

export type SymphonyCodexCommandExecutionStatus =
  | "in_progress"
  | "completed"
  | "failed";

export type SymphonyCodexCommandExecutionItem = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: SymphonyCodexCommandExecutionStatus;
};

export type SymphonyCodexPatchChangeKind = "add" | "delete" | "update";

export type SymphonyCodexFileUpdateChange = {
  path: string;
  kind: SymphonyCodexPatchChangeKind;
};

export type SymphonyCodexPatchApplyStatus = "completed" | "failed";

export type SymphonyCodexFileChangeItem = {
  id: string;
  type: "file_change";
  changes: SymphonyCodexFileUpdateChange[];
  status: SymphonyCodexPatchApplyStatus;
};

export type SymphonyCodexMcpToolCallStatus =
  | "in_progress"
  | "completed"
  | "failed";

export type SymphonyCodexMcpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: SymphonyCodexJsonValue;
  result?: {
    content: SymphonyCodexJsonValue[];
    structured_content: SymphonyCodexJsonValue;
  };
  error?: {
    message: string;
  };
  status: SymphonyCodexMcpToolCallStatus;
};

export type SymphonyCodexAgentMessageItem = {
  id: string;
  type: "agent_message";
  text: string;
};

export type SymphonyCodexReasoningItem = {
  id: string;
  type: "reasoning";
  text: string;
};

export type SymphonyCodexWebSearchItem = {
  id: string;
  type: "web_search";
  query: string;
};

export type SymphonyCodexErrorItem = {
  id: string;
  type: "error";
  message: string;
};

export type SymphonyCodexTodoItem = {
  text: string;
  completed: boolean;
};

export type SymphonyCodexTodoListItem = {
  id: string;
  type: "todo_list";
  items: SymphonyCodexTodoItem[];
};

export type SymphonyCodexThreadItem =
  | SymphonyCodexAgentMessageItem
  | SymphonyCodexReasoningItem
  | SymphonyCodexCommandExecutionItem
  | SymphonyCodexFileChangeItem
  | SymphonyCodexMcpToolCallItem
  | SymphonyCodexWebSearchItem
  | SymphonyCodexTodoListItem
  | SymphonyCodexErrorItem;

export type SymphonyCodexThreadStartedEvent = {
  type: "thread.started";
  thread_id: string;
};

export type SymphonyCodexTurnStartedEvent = {
  type: "turn.started";
};

export type SymphonyCodexUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

export type SymphonyCodexTurnCompletedEvent = {
  type: "turn.completed";
  usage: SymphonyCodexUsage;
};

export type SymphonyCodexThreadError = {
  message: string;
};

export type SymphonyCodexTurnFailedEvent = {
  type: "turn.failed";
  error: SymphonyCodexThreadError;
};

export type SymphonyCodexItemStartedEvent = {
  type: "item.started";
  item: SymphonyCodexThreadItem;
};

export type SymphonyCodexItemUpdatedEvent = {
  type: "item.updated";
  item: SymphonyCodexThreadItem;
};

export type SymphonyCodexItemCompletedEvent = {
  type: "item.completed";
  item: SymphonyCodexThreadItem;
};

export type SymphonyCodexStreamErrorEvent = {
  type: "error";
  message: string;
};

export type SymphonyCodexThreadEvent =
  | SymphonyCodexThreadStartedEvent
  | SymphonyCodexTurnStartedEvent
  | SymphonyCodexTurnCompletedEvent
  | SymphonyCodexTurnFailedEvent
  | SymphonyCodexItemStartedEvent
  | SymphonyCodexItemUpdatedEvent
  | SymphonyCodexItemCompletedEvent
  | SymphonyCodexStreamErrorEvent;

export type SymphonyCodexSessionStartedEvent = {
  type: "session.started";
  session_id: string;
  thread_id: string | null;
  turn_id: string;
  codex_app_server_pid: string | null;
  model: string | null;
  reasoning_effort: string | null;
};

export type SymphonyCodexAnalyticsEvent =
  | SymphonyCodexSessionStartedEvent
  | SymphonyCodexThreadEvent;

export type SymphonyCodexAnalyticsEventType = SymphonyCodexAnalyticsEvent["type"];

export type SymphonyCodexThreadItemType = SymphonyCodexThreadItem["type"];

export type SymphonyCodexThreadItemStatus =
  | SymphonyCodexCommandExecutionStatus
  | SymphonyCodexPatchApplyStatus
  | SymphonyCodexMcpToolCallStatus
  | null;
