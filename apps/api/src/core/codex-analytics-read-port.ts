import type {
  SymphonyAgentCommandExecutionListResult,
  SymphonyAgentFileChangeListResult,
  SymphonyAgentItemListResult,
  SymphonyAgentMessageListResult,
  SymphonyAgentOverflowResult,
  SymphonyAgentReasoningBlockListResult,
  SymphonyAgentRunTurnQuery,
  SymphonyAgentToolCallListResult,
  SymphonyAgentTurnListResult
} from "@symphony/contracts";
import type { AgentAnalyticsReadStore } from "@symphony/db";
import type { SymphonyAgentAnalyticsReadPort } from "./runtime-app-types.js";

export function createAgentAnalyticsReadPort(
  readStore: AgentAnalyticsReadStore
): SymphonyAgentAnalyticsReadPort {
  return {
    fetchRunArtifacts(runId) {
      return readStore.fetchRunArtifacts(runId);
    },
    async fetchOverflow(runId, overflowId) {
      const overflow = await readStore.fetchOverflow(runId, overflowId);

      return overflow
        ? ({
            runId,
            overflow
          } satisfies SymphonyAgentOverflowResult)
        : null;
    },
    async listTurns(runId) {
      return {
        runId,
        turns: await readStore.listTurns(runId)
      } satisfies SymphonyAgentTurnListResult;
    },
    async listItems(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listItems(input),
        "items"
      ) satisfies SymphonyAgentItemListResult;
    },
    async listCommandExecutions(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listCommandExecutions(input),
        "commandExecutions"
      ) satisfies SymphonyAgentCommandExecutionListResult;
    },
    async listToolCalls(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listToolCalls(input),
        "toolCalls"
      ) satisfies SymphonyAgentToolCallListResult;
    },
    async listAgentMessages(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listAgentMessages(input),
        "agentMessages"
      ) satisfies SymphonyAgentMessageListResult;
    },
    async listReasoning(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listReasoning(input),
        "reasoning"
      ) satisfies SymphonyAgentReasoningBlockListResult;
    },
    async listFileChanges(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listFileChanges(input),
        "fileChanges"
      ) satisfies SymphonyAgentFileChangeListResult;
    }
  };
}

type RunTurnCollectionKey =
  | "items"
  | "commandExecutions"
  | "toolCalls"
  | "agentMessages"
  | "reasoning"
  | "fileChanges";

function buildRunTurnListResult<K extends RunTurnCollectionKey, V>(
  input: SymphonyAgentRunTurnQuery,
  items: V,
  key: K
): {
  runId: string;
  turnId: string | null;
} & Record<K, V> {
  return {
    runId: input.runId,
    turnId: input.turnId ?? null,
    [key]: items
  } as {
    runId: string;
    turnId: string | null;
  } & Record<K, V>;
}

export const createCodexAnalyticsReadPort = createAgentAnalyticsReadPort;
