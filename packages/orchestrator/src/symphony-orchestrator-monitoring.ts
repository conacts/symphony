import type { AgentRuntime } from "./agent-runtime.js";
import { stallElapsedMs } from "./symphony-orchestrator-codex-state.js";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyClock,
  SymphonyOrchestratorState
} from "./symphony-orchestrator-types.js";

export async function reconcileStalledRunningIssues(input: {
  config: {
    codex: {
      stallTimeoutMs: number;
    };
  };
  state: SymphonyOrchestratorState;
  agentRuntime: AgentRuntime;
  clock: SymphonyClock;
  handleRunCompletion: (
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ) => Promise<void>;
}): Promise<void> {
  const timeoutMs = input.config.codex.stallTimeoutMs;
  if (timeoutMs <= 0) {
    return;
  }

  const runningIssueIds = Object.keys(input.state.running);
  if (runningIssueIds.length === 0) {
    return;
  }

  for (const issueId of runningIssueIds) {
    const runningEntry = input.state.running[issueId];
    if (!runningEntry) {
      continue;
    }

    const elapsedMs = stallElapsedMs(runningEntry, input.clock.now());
    if (elapsedMs === null || elapsedMs <= timeoutMs) {
      continue;
    }

    const reason = `stalled for ${elapsedMs}ms without codex activity`;

    await input.agentRuntime.stopRun({
      issue: runningEntry.issue,
      workspace: runningEntry.workspace,
      cleanupWorkspace: false
    });

    await input.handleRunCompletion(issueId, {
      kind: "stalled",
      reason
    });
  }
}
