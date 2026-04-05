import type { SymphonyAgentHarnessModule } from "../shared/types.js";

export const opencodeHarnessModule: SymphonyAgentHarnessModule = {
  definition: {
    kind: "opencode",
    displayName: "OpenCode",
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
      "OpenCode transport is wired into the Symphony runtime.",
      "Analytics parity is best-effort: command output, exit status, and tool provenance do not map 1:1 to Codex."
    ]
  }
};

export function createOpenCodeHarnessDefinition() {
  return opencodeHarnessModule.definition;
}
