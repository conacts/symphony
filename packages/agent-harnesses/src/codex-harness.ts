import type { SymphonyAgentHarnessDefinition } from "./types.js";

export function createCodexHarnessDefinition(): SymphonyAgentHarnessDefinition {
  return {
    kind: "codex",
    displayName: "Codex",
    implemented: true,
    capabilities: [
      "session_transport",
      "todo_tracking",
      "token_usage",
      "tool_calls",
      "command_tracking",
      "file_changes"
    ],
    notes: [
      "Codex is the current first-class harness with full runtime integration.",
      "Codex analytics are the source schema for the existing Symphony operator UI."
    ]
  };
}
