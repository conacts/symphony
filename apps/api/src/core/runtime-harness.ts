import {
  createCodexHarnessDefinition,
  createOpenCodeHarnessDefinition,
  createUnsupportedHarnessError,
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
  startSession(input: {
    launchTarget: HarnessSession["launchTarget"];
    env: Record<string, string>;
    hostCommandEnvSource: Record<string, string | undefined>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: HarnessSessionLogger;
  }): Promise<HarnessSession>;
};

export function createCodexRuntimeHarness(): SymphonyRuntimeHarness {
  return {
    kind: createCodexHarnessDefinition().kind,
    startSession(input) {
      return CodexSdkClient.startSession(input);
    }
  };
}

export function createOpenCodeRuntimeHarness(): SymphonyRuntimeHarness {
  return {
    kind: createOpenCodeHarnessDefinition().kind,
    startSession(input) {
      return OpenCodeSdkClient.startSession(input);
    }
  };
}

export function resolveRuntimeHarness(
  harness: SymphonyRuntimeHarnessKind
): SymphonyRuntimeHarness {
  switch (harness) {
    case "codex":
      return createCodexRuntimeHarness();
    case "opencode":
      return createOpenCodeRuntimeHarness();
    case "pi":
      throw createUnsupportedHarnessError(harness);
    default: {
      const exhaustiveCheck: never = harness;
      throw new TypeError(`Unsupported Symphony runtime harness: ${exhaustiveCheck}`);
    }
  }
}
