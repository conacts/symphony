import type {
  HarnessLaunchSessionInput,
  HarnessSession
} from "../shared/session-types.js";
import type { SymphonyAgentHarnessDefinition } from "../shared/types.js";
import { PiRunnerClient } from "./runner-client.js";

export type PiRunner = {
  kind: "pi";
  definition: SymphonyAgentHarnessDefinition;
  startSession(input: HarnessLaunchSessionInput): Promise<HarnessSession>;
};

export const piRunnerDefinition = {
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
    "Pi transport is wired through the Symphony runtime via the Pi runner.",
    "The harness emits Symphony's canonical thread narrative directly from the SDK-backed runner bridge."
  ]
} satisfies SymphonyAgentHarnessDefinition;

export async function startPiRunnerSession(
  input: HarnessLaunchSessionInput
): Promise<HarnessSession> {
  return await PiRunnerClient.startSession(input);
}

export function createPiRunner(): PiRunner {
  return {
    kind: "pi",
    definition: piRunnerDefinition,
    startSession: startPiRunnerSession
  };
}
