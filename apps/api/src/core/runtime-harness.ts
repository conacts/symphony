import {
  piHarnessModule,
  type ActiveSymphonyAgentHarnessKind as SymphonyRuntimeHarnessKind
} from "@symphony/agent-harnesses";
import { AgentAppServerClient } from "./agent-app-server-client.js";

export type SymphonyRuntimeHarness = {
  kind: SymphonyRuntimeHarnessKind;
  definition: typeof piHarnessModule.definition;
  startSession: NonNullable<typeof piHarnessModule.transport.startSession>;
};

export function createPiRuntimeHarness(): SymphonyRuntimeHarness {
  const startSession: SymphonyRuntimeHarness["startSession"] = async (input) => {
    const command = input.runtimePolicy.agentRuntime.command.trim();
    if (/(?:^|\s)app-server(?=\s|$)/u.test(command)) {
      return await AgentAppServerClient.startSession({
        launchTarget: input.launchTarget,
        env: input.env,
        hostCommandEnvSource: input.hostCommandEnvSource ?? {},
        runtimePolicy: input.runtimePolicy,
        issue: input.issue,
        logger: input.logger
      });
    }

    const defaultStartSession = piHarnessModule.transport.startSession;
    if (!defaultStartSession) {
      throw new TypeError("Pi runtime harness is not implemented.");
    }

    return await defaultStartSession(input);
  };

  if (piHarnessModule.transport.status !== "implemented") {
    throw new TypeError("Pi runtime harness is not implemented.");
  }

  return {
    kind: "pi",
    definition: piHarnessModule.definition,
    startSession
  };
}
