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

export type SymphonyAgentHarnessModule = {
  definition: SymphonyAgentHarnessDefinition;
};

export type SymphonyAgentHarnessAnalyticsProjection<TEvent, TLoss> = {
  events: TEvent[];
  losses: TLoss[];
};
