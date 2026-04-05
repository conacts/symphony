import {
  createCodexHarnessDefinition
} from "./codex-harness.js";
import {
  createOpenCodeHarnessDefinition
} from "./opencode-harness.js";
import type {
  SymphonyAgentHarnessDefinition,
  SymphonyAgentHarnessKind
} from "./types.js";

export function listAgentHarnessDefinitions(): SymphonyAgentHarnessDefinition[] {
  return [
    createCodexHarnessDefinition(),
    createOpenCodeHarnessDefinition(),
    {
      kind: "pi",
      displayName: "Pi",
      implemented: false,
      capabilities: ["session_transport"],
      notes: [
        "Pi is not integrated yet.",
        "Telemetry parity is unknown until we inspect its session and event model."
      ]
    }
  ];
}

export function resolveAgentHarnessDefinition(
  kind: SymphonyAgentHarnessKind
): SymphonyAgentHarnessDefinition {
  const match = listAgentHarnessDefinitions().find(
    (definition) => definition.kind === kind
  );

  if (!match) {
    throw new TypeError(`Unsupported Symphony harness kind: ${kind}`);
  }

  return match;
}

export function createUnsupportedHarnessError(
  kind: SymphonyAgentHarnessKind
): TypeError {
  const definition = resolveAgentHarnessDefinition(kind);
  return new TypeError(
    `Symphony runtime harness "${kind}" is configured but not implemented yet. ${definition.displayName} is modeled in @symphony/agent-harnesses, but only Codex is currently wired into the runtime.`
  );
}
