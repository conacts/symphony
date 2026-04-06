export type SymphonyAgentJsonValue =
  | string
  | number
  | boolean
  | null
  | SymphonyAgentJsonValue[]
  | { [key: string]: SymphonyAgentJsonValue };

export type SymphonyAgentCommandExecutionStatus =
  | "in_progress"
  | "completed"
  | "failed";

export type SymphonyAgentCommandExecutionItem = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: SymphonyAgentCommandExecutionStatus;
};

export type SymphonyAgentPatchChangeKind = "add" | "delete" | "update";

export type SymphonyAgentFileUpdateChange = {
  path: string;
  kind: SymphonyAgentPatchChangeKind;
};

export type SymphonyAgentPatchApplyStatus = "completed" | "failed";

export type SymphonyAgentFileChangeItem = {
  id: string;
  type: "file_change";
  changes: SymphonyAgentFileUpdateChange[];
  status: SymphonyAgentPatchApplyStatus;
};

export type SymphonyAgentMcpToolCallStatus =
  | "in_progress"
  | "completed"
  | "failed";

export type SymphonyAgentMcpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: SymphonyAgentJsonValue;
  result?: {
    content: SymphonyAgentJsonValue[];
    structured_content: SymphonyAgentJsonValue;
  };
  error?: {
    message: string;
  };
  status: SymphonyAgentMcpToolCallStatus;
};

export type SymphonyAgentMessageItem = {
  id: string;
  type: "agent_message";
  text: string;
};

export type SymphonyAgentReasoningItem = {
  id: string;
  type: "reasoning";
  text: string;
};

export type SymphonyAgentWebSearchItem = {
  id: string;
  type: "web_search";
  query: string;
};

export type SymphonyAgentErrorItem = {
  id: string;
  type: "error";
  message: string;
};

export type SymphonyAgentTodoItem = {
  text: string;
  completed: boolean;
};

export type SymphonyAgentTodoListItem = {
  id: string;
  type: "todo_list";
  items: SymphonyAgentTodoItem[];
};

export type SymphonyAgentThreadItem =
  | SymphonyAgentMessageItem
  | SymphonyAgentReasoningItem
  | SymphonyAgentCommandExecutionItem
  | SymphonyAgentFileChangeItem
  | SymphonyAgentMcpToolCallItem
  | SymphonyAgentWebSearchItem
  | SymphonyAgentTodoListItem
  | SymphonyAgentErrorItem;

export type SymphonyAgentThreadStartedEvent = {
  type: "thread.started";
  thread_id: string;
};

export type SymphonyAgentTurnStartedEvent = {
  type: "turn.started";
};

export type SymphonyAgentUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

export type SymphonyAgentTurnCompletedEvent = {
  type: "turn.completed";
  usage: SymphonyAgentUsage;
};

export type SymphonyAgentThreadError = {
  message: string;
};

export type SymphonyAgentTurnFailedEvent = {
  type: "turn.failed";
  error: SymphonyAgentThreadError;
};

export type SymphonyAgentItemStartedEvent = {
  type: "item.started";
  item: SymphonyAgentThreadItem;
};

export type SymphonyAgentItemUpdatedEvent = {
  type: "item.updated";
  item: SymphonyAgentThreadItem;
};

export type SymphonyAgentItemCompletedEvent = {
  type: "item.completed";
  item: SymphonyAgentThreadItem;
};

export type SymphonyAgentStreamErrorEvent = {
  type: "error";
  message: string;
};

export type SymphonyAgentThreadEvent =
  | SymphonyAgentThreadStartedEvent
  | SymphonyAgentTurnStartedEvent
  | SymphonyAgentTurnCompletedEvent
  | SymphonyAgentTurnFailedEvent
  | SymphonyAgentItemStartedEvent
  | SymphonyAgentItemUpdatedEvent
  | SymphonyAgentItemCompletedEvent
  | SymphonyAgentStreamErrorEvent;

export type SymphonyAgentSessionStartedEvent = {
  type: "session.started";
  session_id: string;
  thread_id: string | null;
  turn_id: string;
  agent_app_server_pid: string | null;
  model: string | null;
  reasoning_effort: string | null;
};

export type SymphonyAgentAnalyticsEvent =
  | SymphonyAgentSessionStartedEvent
  | SymphonyAgentThreadEvent;

export type SymphonyAgentAnalyticsEventType = SymphonyAgentAnalyticsEvent["type"];

export type SymphonyAgentThreadItemType = SymphonyAgentThreadItem["type"];

export type SymphonyAgentThreadItemStatus =
  | SymphonyAgentCommandExecutionStatus
  | SymphonyAgentPatchApplyStatus
  | SymphonyAgentMcpToolCallStatus
  | null;
