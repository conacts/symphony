import { piHarnessModule } from "../pi/definition.js";
import type {
  SymphonyAgentHarnessDefinition,
  SymphonyAgentHarnessKind,
  SymphonyAgentHarnessModule
} from "./types.js";

export function listAgentHarnessDefinitions(): SymphonyAgentHarnessDefinition[] {
  return [piHarnessModule.definition];
}

export function listAgentHarnessModules(): SymphonyAgentHarnessModule[] {
  return [piHarnessModule];
}

export function resolveAgentHarnessModule(
  kind: SymphonyAgentHarnessKind
): SymphonyAgentHarnessModule {
  void kind;
  return piHarnessModule;
}

export function resolveAgentHarnessDefinition(
  kind: SymphonyAgentHarnessKind
): SymphonyAgentHarnessDefinition {
  return resolveAgentHarnessModule(kind).definition;
}
