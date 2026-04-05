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

export function listAgentHarnessModules(): SymphonyAgentHarnessModule[] {
  return [...harnessModules];
}

export function resolveAgentHarnessModule(
  kind: SymphonyAgentHarnessKind
): SymphonyAgentHarnessModule {
  const match = harnessModules.find((module) => module.definition.kind === kind);

  if (!match) {
    throw new TypeError(`Unsupported Symphony harness kind: ${kind}`);
  }

  return match;
}

export function resolveAgentHarnessDefinition(
  kind: SymphonyAgentHarnessKind
): SymphonyAgentHarnessDefinition {
  return resolveAgentHarnessModule(kind).definition;
}

export function createUnsupportedHarnessError(
  kind: SymphonyAgentHarnessKind
): TypeError {
  const module = resolveAgentHarnessModule(kind);
  const definition = module.definition;
  return new TypeError(
    `Symphony runtime harness "${kind}" is configured but not implemented yet. ${definition.displayName} is modeled in @symphony/agent-harnesses, but its transport contract is still ${module.transport.status}.`
  );
}
