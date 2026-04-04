import type {
  SymphonyCodexAgentMessageListResult,
  SymphonyCodexCommandExecutionListResult,
  SymphonyCodexFileChangeListResult,
  SymphonyCodexItemListResult,
  SymphonyCodexReasoningListResult,
  SymphonyCodexRunTurnQuery,
  SymphonyCodexToolCallListResult,
  SymphonyCodexTurnListResult
} from "@symphony/contracts";
import type { CodexAnalyticsReadStore } from "@symphony/db";
import type { SymphonyCodexAnalyticsReadPort } from "./runtime-app-types.js";

export function createCodexAnalyticsReadPort(
  readStore: CodexAnalyticsReadStore
): SymphonyCodexAnalyticsReadPort {
  return {
    fetchRunArtifacts(runId) {
      return readStore.fetchRunArtifacts(runId);
    },
    async listTurns(runId) {
      return {
        runId,
        turns: await readStore.listTurns(runId)
      } satisfies SymphonyCodexTurnListResult;
    },
    async listItems(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listItems(input),
        "items"
      ) satisfies SymphonyCodexItemListResult;
    },
    async listCommandExecutions(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listCommandExecutions(input),
        "commandExecutions"
      ) satisfies SymphonyCodexCommandExecutionListResult;
    },
    async listToolCalls(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listToolCalls(input),
        "toolCalls"
      ) satisfies SymphonyCodexToolCallListResult;
    },
    async listAgentMessages(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listAgentMessages(input),
        "agentMessages"
      ) satisfies SymphonyCodexAgentMessageListResult;
    },
    async listReasoning(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listReasoning(input),
        "reasoning"
      ) satisfies SymphonyCodexReasoningListResult;
    },
    async listFileChanges(input) {
      return buildRunTurnListResult(
        input,
        await readStore.listFileChanges(input),
        "fileChanges"
      ) satisfies SymphonyCodexFileChangeListResult;
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
  input: SymphonyCodexRunTurnQuery,
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
