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
  }
};
