export type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

export type CommandExecutionStatus = "in_progress" | "completed" | "failed";

export type CommandExecutionItem = {
  id: string;
  type: "command_execution";
  command: string;
  aggregated_output: string;
  exit_code?: number;
  status: CommandExecutionStatus;
};

export type FileUpdateChange = {
  path: string;
  kind: "add" | "delete" | "update";
};

export type FileChangeStatus = "completed" | "failed";

export type FileChangeItem = {
  id: string;
  type: "file_change";
  changes: FileUpdateChange[];
  status: FileChangeStatus;
};

export type McpToolCallStatus = "in_progress" | "completed" | "failed";

export type McpToolCallItem = {
  id: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  result?: {
    content: unknown[];
    structured_content?: unknown;
  };
  error?: {
    message: string;
  };
  status: McpToolCallStatus;
};

export type AgentMessageItem = {
  id: string;
  type: "agent_message";
  text: string;
};

export type ReasoningItem = {
  id: string;
  type: "reasoning";
  text: string;
};

export type WebSearchItem = {
  id: string;
  type: "web_search";
  query: string;
};

export type ErrorItem = {
  id: string;
  type: "error";
  message: string;
};

export type TodoItem = {
  text: string;
  completed: boolean;
};

export type TodoListItem = {
  id: string;
  type: "todo_list";
  items: TodoItem[];
};

export type ThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem;

export type ThreadStartedEvent = {
  type: "thread.started";
  thread_id: string;
};

export type TurnStartedEvent = {
  type: "turn.started";
};

export type TurnCompletedEvent = {
  type: "turn.completed";
  usage: Usage;
};

export type ThreadError = {
  message: string;
};

export type TurnFailedEvent = {
  type: "turn.failed";
  error: ThreadError;
};

export type ItemStartedEvent = {
  type: "item.started";
  item: ThreadItem;
};

export type ItemUpdatedEvent = {
  type: "item.updated";
  item: ThreadItem;
};

export type ItemCompletedEvent = {
  type: "item.completed";
  item: ThreadItem;
};

export type ThreadErrorEvent = {
  type: "error";
  message: string;
};

export type ThreadEvent =
  | ThreadStartedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | ThreadErrorEvent;
