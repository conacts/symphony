import {
  createPiRunner,
  type PiRunner as SymphonyRuntimeHarness
} from "@symphony/agent-harnesses";

export type { SymphonyRuntimeHarness };

export function createPiRuntimeHarness(): SymphonyRuntimeHarness {
  return createPiRunner();
}
