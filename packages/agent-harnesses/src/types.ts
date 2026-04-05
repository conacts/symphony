export type SymphonyAgentHarnessKind = "codex" | "opencode" | "pi";

export type SymphonyAgentHarnessCapability =
  | "session_transport"
  | "todo_tracking"
  | "token_usage"
  | "tool_calls"
  | "command_tracking"
  | "file_changes";

export type SymphonyAgentHarnessDefinition = {
  kind: SymphonyAgentHarnessKind;
  displayName: string;
  implemented: boolean;
  capabilities: SymphonyAgentHarnessCapability[];
  notes: string[];
};
