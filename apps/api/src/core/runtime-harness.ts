import {
  createUnsupportedHarnessError,
  resolveAgentHarnessModule,
  type SymphonyAgentHarnessKind
} from "@symphony/agent-harnesses";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  CodexSdkClient
} from "./codex-sdk-client.js";
import {
  OpenCodeSdkClient
} from "./opencode-sdk-client.js";
import type {
  HarnessSession,
  HarnessSessionLogger
} from "./agent-session-types.js";

export type SymphonyRuntimeHarnessKind = SymphonyAgentHarnessKind;

export type SymphonyRuntimeHarness = {
  kind: SymphonyRuntimeHarnessKind;
  definition: ReturnType<typeof resolveAgentHarnessModule>["definition"];
  startSession(input: {
    launchTarget: HarnessSession["launchTarget"];
    env: Record<string, string>;
    hostCommandEnvSource: Record<string, string | undefined>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: HarnessSessionLogger;
  }): Promise<HarnessSession>;
};

const runtimeHarnessStartSession: Partial<
  Record<SymphonyRuntimeHarnessKind, SymphonyRuntimeHarness["startSession"]>
> = {
  codex(input) {
    return CodexSdkClient.startSession(input);
  },
  opencode(input) {
    return OpenCodeSdkClient.startSession(input);
  }
};

export function createRuntimeHarness(
  kind: SymphonyRuntimeHarnessKind
): SymphonyRuntimeHarness {
  const module = resolveAgentHarnessModule(kind);
  const startSession = runtimeHarnessStartSession[kind];

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
  switch (harness) {
    case "codex":
      return createRuntimeHarness(harness);
    case "opencode":
      return createRuntimeHarness(harness);
    case "pi":
      throw createUnsupportedHarnessError(harness);
    default: {
      const exhaustiveCheck: never = harness;
      throw new TypeError(`Unsupported Symphony runtime harness: ${exhaustiveCheck}`);
    }
  }
}
