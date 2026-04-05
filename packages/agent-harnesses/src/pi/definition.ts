import type { SymphonyAgentHarnessModule } from "../shared/types.js";
import {
  piAnalyticsAdapter,
  type PiAnalyticsAdapter
} from "./analytics-adapter.js";
import { PiRpcClient } from "./rpc-client.js";

export const piHarnessModule: SymphonyAgentHarnessModule<PiAnalyticsAdapter> = {
  definition: {
    kind: "pi",
    displayName: "Pi",
    implemented: true,
    capabilities: [
      "session_transport",
      "token_usage",
      "tool_calls",
      "command_tracking"
    ],
    notes: [
      "Pi transport is wired through the Symphony runtime via Pi RPC mode.",
      "Analytics parity is promising: Pi exposes turn lifecycle, tool execution events, and token usage in its JSON/RPC stream."
    ]
  },
  transport: {
    status: "implemented",
    integration: "runtime",
    startSession(input) {
      return PiRpcClient.startSession(input);
    },
    notes: [
      "Pi sessions are launched through Docker-backed workspace containers.",
      "Pi currently relies on the CLI RPC stream rather than the host-side SDK."
    ]
  },
  analytics: {
    status: "implemented",
    mode: "projection",
    lossiness: "best_effort",
    adapter: piAnalyticsAdapter,
    notes: [
      "Pi analytics are projected from the RPC event stream into Symphony's canonical event model.",
      "Exit codes and some non-text tool payload details are not exposed directly."
    ]
  }
};
