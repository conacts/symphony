import type { SymphonyAgentHarnessModule } from "../shared/types.js";

export const piHarnessModule: SymphonyAgentHarnessModule = {
  definition: {
    kind: "pi",
    displayName: "Pi",
    implemented: false,
    capabilities: ["session_transport"],
    notes: [
      "Pi is not integrated yet.",
      "Telemetry parity is unknown until we inspect its session and event model."
    ]
  },
  transport: {
    status: "planned",
    integration: "unknown",
    notes: [
      "Pi transport is not integrated yet."
    ]
  },
  analytics: {
    status: "planned",
    mode: "unknown",
    lossiness: "unknown",
    adapter: null,
    notes: [
      "Pi analytics mapping is unproven until we inspect its telemetry surface."
    ]
  }
};
