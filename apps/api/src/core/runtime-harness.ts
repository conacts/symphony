import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  CodexSdkClient
} from "./codex-sdk-client.js";
import type {
  CodexAppServerLogger,
  CodexAppServerSession
} from "./codex-app-server-types.js";

export type SymphonyRuntimeHarnessKind = SymphonyAgentRuntimeConfig["agent"]["harness"];

export type SymphonyRuntimeHarness = {
  kind: SymphonyRuntimeHarnessKind;
  startSession(input: {
    launchTarget: CodexAppServerSession["launchTarget"];
    env: Record<string, string>;
    hostCommandEnvSource: Record<string, string | undefined>;
    runtimePolicy: SymphonyAgentRuntimeConfig;
    issue: SymphonyTrackerIssue;
    logger: CodexAppServerLogger;
  }): Promise<CodexAppServerSession>;
};

export function createCodexRuntimeHarness(): SymphonyRuntimeHarness {
  return {
    kind: "codex",
    startSession(input) {
      return CodexSdkClient.startSession(input);
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
    case "pi":
      throw new TypeError(
        `Symphony runtime harness "${harness}" is configured but not implemented yet. Codex is currently the only supported harness.`
      );
    default: {
      const exhaustiveCheck: never = harness;
      throw new TypeError(`Unsupported Symphony runtime harness: ${exhaustiveCheck}`);
    }
  }
}
