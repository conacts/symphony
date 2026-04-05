import { codexHarnessModule } from "../codex/definition.js";
import { opencodeHarnessModule } from "../opencode/definition.js";
import { piHarnessModule } from "../pi/definition.js";
import type {
  SymphonyAgentHarnessDefinition,
  SymphonyAgentHarnessKind,
  SymphonyAgentHarnessModule
} from "./types.js";

const harnessModules: SymphonyAgentHarnessModule[] = [
  codexHarnessModule,
  opencodeHarnessModule,
  piHarnessModule
];

export function listAgentHarnessDefinitions(): SymphonyAgentHarnessDefinition[] {
  return harnessModules.map((module) => module.definition);
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
    `Symphony runtime harness "${kind}" is configured but not implemented yet. ${definition.displayName} is modeled in @symphony/agent-harnesses, but its runtime transport has not been wired into Symphony yet.`
  );
}
