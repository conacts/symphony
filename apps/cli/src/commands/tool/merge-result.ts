import { Flags } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";
import { BaseCommand } from "../../base-command.js";
import { loadCliCommandContext } from "../../runtime-context.js";
import { postRuntimeToolRequest } from "../../runtime-tools-api.js";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

export default class ToolMergeResultCommand extends BaseCommand {
  static summary =
    "Record the merge outcome for the active approved Symphony run.";

  static description =
    "Agent-facing runtime command for approved merge runs. Posts a merge-result comment and records the explicit merge outcome for the active run.";

  static flags = {
    ...BaseCommand.baseFlags,
    status: Flags.string({
      description: "Merge outcome for the active approved run.",
      required: true,
      options: ["merged", "blocked"]
    }),
    summary: Flags.string({
      description: "Short merge outcome summary.",
      required: true
    }),
    "pr-url": Flags.string({
      description: "Optional PR URL for the merged or blocked branch."
    }),
    "merge-commit-sha": Flags.string({
      description: "Optional merge commit SHA."
    }),
    "blocking-reason": Flags.string({
      description: "Blocking reason. Required when status is blocked."
    }),
    "tests-summary": Flags.string({
      description: "Optional verification summary."
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ToolMergeResultCommand);
    const commandContext = loadCliCommandContext();
    const mergePayload = buildMergeResultPayload(flags);

    try {
      const result = await submitMergeResultThroughApi(
        commandContext,
        mergePayload
      );

      this.printJson(JSON.parse(result.output));

      if (!result.success) {
        this.exit(1);
      }
    } catch (error) {
      logger.error("symphony tool merge-result failed", {
        error
      });
      throw error;
    }
  }
}

function buildMergeResultPayload(
  flags: Awaited<ReturnType<ToolMergeResultCommand["parse"]>>["flags"]
) {
  return {
    status: flags.status,
    summary: flags.summary,
    prUrl: flags["pr-url"] ?? null,
    mergeCommitSha: flags["merge-commit-sha"] ?? null,
    blockingReason: flags["blocking-reason"] ?? null,
    testsSummary: flags["tests-summary"] ?? null
  };
}

async function submitMergeResultThroughApi(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  mergePayload: ReturnType<typeof buildMergeResultPayload>
) {
  return await postRuntimeToolRequest({
    apiBaseUrl: commandContext.apiBaseUrl,
    endpoint: "merge-result",
    runId: commandContext.runId,
    turnId: commandContext.turnId,
    issue: commandContext.issue,
    argumentsPayload: mergePayload
  });
}
