import {
  createUnsupportedHarnessError,
  resolveAgentHarnessModule,
  type SymphonyAgentHarnessKind
} from "@symphony/agent-harnesses";

export type SymphonyRuntimeHarnessKind = SymphonyAgentHarnessKind;

export type SymphonyRuntimeHarness = {
  kind: SymphonyRuntimeHarnessKind;
  definition: ReturnType<typeof resolveAgentHarnessModule>["definition"];
  startSession: NonNullable<
    ReturnType<typeof resolveAgentHarnessModule>["transport"]["startSession"]
  >;
};

export function createRuntimeHarness(
  kind: SymphonyRuntimeHarnessKind
): SymphonyRuntimeHarness {
  const module = resolveAgentHarnessModule(kind);
  const startSession = module.transport.startSession;

  if (!startSession || module.transport.status !== "implemented") {
    throw createUnsupportedHarnessError(kind);
  }

  return {
    kind: module.definition.kind,
    definition: module.definition,
    startSession
  };
}

export function resolveRuntimeHarness(
  harness: SymphonyRuntimeHarnessKind
): SymphonyRuntimeHarness {
  return createRuntimeHarness(harness);
}
