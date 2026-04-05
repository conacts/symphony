import {
  piHarnessModule,
  type ActiveSymphonyAgentHarnessKind as SymphonyRuntimeHarnessKind
} from "@symphony/agent-harnesses";

export type SymphonyRuntimeHarness = {
  kind: SymphonyRuntimeHarnessKind;
  definition: typeof piHarnessModule.definition;
  startSession: NonNullable<typeof piHarnessModule.transport.startSession>;
};

export function createPiRuntimeHarness(): SymphonyRuntimeHarness {
  const startSession = piHarnessModule.transport.startSession;

  if (!startSession || piHarnessModule.transport.status !== "implemented") {
    throw new TypeError("Pi runtime harness is not implemented.");
  }

  return {
    kind: "pi",
    definition: piHarnessModule.definition,
    startSession
  };
}
