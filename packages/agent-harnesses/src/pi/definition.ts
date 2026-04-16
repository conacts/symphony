import type { SymphonyAgentHarnessModule } from "../shared/types.js";
import { PiSdkRunnerClient } from "./sdk-runner-client.js";

export const piHarnessModule: SymphonyAgentHarnessModule = {
  definition: {
    kind: "pi",
    displayName: "Pi",
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
      "Pi transport is wired through the Symphony runtime via the Pi SDK runner.",
      "The harness emits Symphony's canonical thread narrative directly from the SDK-backed runner bridge."
    ]
  },
  transport: {
    status: "implemented",
    integration: "runtime",
    startSession(input) {
      return PiSdkRunnerClient.startSession(input);
    },
    notes: [
      "Pi sessions are launched through Docker-backed workspace containers.",
      "The default transport is the host-side SDK runner launched inside the workspace container."
    ]
  },
  analytics: {
    status: "implemented",
    mode: "native",
    lossiness: "none",
    adapter: null,
    notes: [
      "The SDK runner bridge emits canonical Symphony thread events directly.",
      "Command outcomes, file changes, tool calls, usage, and terminal assistant completion are preserved at the harness boundary."
    ]
  }
};
