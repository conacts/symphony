import type { SymphonyAgentHarnessModule } from "../shared/types.js";

export const codexHarnessModule: SymphonyAgentHarnessModule = {
  definition: {
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
      "Codex analytics remain the highest-fidelity source for the existing Symphony operator UI."
    ]
  }
};

export function createCodexHarnessDefinition() {
  return codexHarnessModule.definition;
}
