import type { SymphonyAgentRuntime } from "../orchestration/symphony-orchestrator.js";

export type AgentRuntime = SymphonyAgentRuntime;

export function createCodexAgentRuntime(runtime: AgentRuntime): AgentRuntime {
  return runtime;
}
