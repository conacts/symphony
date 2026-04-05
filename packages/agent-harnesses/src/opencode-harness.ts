import type { SymphonyAgentHarnessDefinition } from "./types.js";

export function createOpenCodeHarnessDefinition(): SymphonyAgentHarnessDefinition {
  return {
    kind: "opencode",
    displayName: "OpenCode",
    implemented: false,
    capabilities: [
      "session_transport",
      "todo_tracking",
      "token_usage",
      "tool_calls",
      "command_tracking",
      "file_changes"
    ],
    notes: [
      "OpenCode transport is not wired into the Symphony runtime yet.",
      "Analytics parity is best-effort: command output, exit status, and tool provenance do not map 1:1 to Codex."
    ]
  };
}
