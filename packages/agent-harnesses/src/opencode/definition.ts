import type { SymphonyAgentHarnessModule } from "../shared/types.js";
import {
  openCodeAnalyticsAdapter,
  type OpenCodeAnalyticsAdapter
} from "./analytics-adapter.js";

export const opencodeHarnessModule: SymphonyAgentHarnessModule<OpenCodeAnalyticsAdapter> = {
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
  },
  transport: {
    status: "implemented",
    integration: "runtime",
    notes: [
      "OpenCode sessions are launched through the Symphony runtime.",
      "OpenCode currently requires a container-backed launch target."
    ]
  },
  analytics: {
    status: "implemented",
    mode: "projection",
    lossiness: "best_effort",
    adapter: openCodeAnalyticsAdapter,
    notes: [
      "OpenCode analytics are projected into Symphony's canonical event model.",
      "Raw command output and some event parts do not currently map 1:1."
    ]
  }
};

export function createOpenCodeHarnessDefinition() {
  return opencodeHarnessModule.definition;
}
