import type { SymphonyAgentHarnessModule } from "../shared/types.js";
import { CodexSdkClient } from "./sdk-client.js";

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
  },
  transport: {
    status: "implemented",
    integration: "runtime",
    startSession(input) {
      return CodexSdkClient.startSession(input);
    },
    notes: [
      "Codex is launched directly through the Symphony runtime."
    ]
  },
  analytics: {
    status: "implemented",
    mode: "native",
    lossiness: "none",
    adapter: null,
    notes: [
      "Codex events are the native shape for Symphony's current operator model."
    ]
  }
};

export function createCodexHarnessDefinition() {
  return codexHarnessModule.definition;
}
