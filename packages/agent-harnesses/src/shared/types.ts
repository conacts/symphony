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

export type SymphonyAgentHarnessTransportContract = {
  status: "implemented" | "planned";
  integration: "runtime" | "unknown";
  startSession?: (
    input: import("./session-types.js").HarnessLaunchSessionInput
  ) => Promise<import("./session-types.js").HarnessSession>;
  notes: string[];
};

export type SymphonyAgentHarnessAnalyticsContract<TAdapter = unknown> = {
  status: "implemented" | "planned";
  mode: "native" | "projection" | "unknown";
  lossiness: "none" | "best_effort" | "unknown";
  adapter: TAdapter | null;
  notes: string[];
};

export type SymphonyAgentHarnessModule<TAnalyticsAdapter = unknown> = {
  definition: SymphonyAgentHarnessDefinition;
  transport: SymphonyAgentHarnessTransportContract;
  analytics: SymphonyAgentHarnessAnalyticsContract<TAnalyticsAdapter>;
};

export type SymphonyAgentHarnessAnalyticsProjection<TEvent, TLoss> = {
  events: TEvent[];
  losses: TLoss[];
};
