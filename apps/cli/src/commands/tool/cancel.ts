import { Flags } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";
import { executeCancelTool } from "@symphony/runtime-tools";
import { BaseCommand } from "../../base-command.js";
import {
  loadCliCommandContext,
  loadCliRuntimeContext
} from "../../runtime-context.js";
import { postRuntimeToolRequest } from "../../runtime-tools-api.js";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

export default class ToolCancelCommand extends BaseCommand {
  static summary = "Cancel the active Symphony issue with a required explanation.";

  static description =
    "Agent-facing runtime command for canceling the active Symphony issue, posting the reason to Linear, and moving the issue to Canceled.";

  static flags = {
    ...BaseCommand.baseFlags,
    reason: Flags.string({
      description: "Required explanation for canceling the issue.",
      required: true
    }),
    state: Flags.string({
      description: "Optional state override. Defaults to Canceled."
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ToolCancelCommand);
    const commandContext = loadCliCommandContext();
    const cancelPayload = buildCancelPayload(flags);

    try {
      const result = commandContext.apiBaseUrl
        ? await cancelIssueThroughApi(commandContext, cancelPayload)
        : await cancelIssueLocally(commandContext, cancelPayload);

      this.printJson(JSON.parse(result.output));

      if (!result.success) {
        this.exit(1);
      }
    } catch (error) {
      logger.error("symphony tool cancel failed", {
        error
      });
      throw error;
    }
  }
}

async function cancelIssueLocally(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  cancelPayload: ReturnType<typeof buildCancelPayload>
) {
  const runtimeContext = loadCliRuntimeContext();

  try {
    return await executeCancelTool(
      {
        tracker: runtimeContext.tracker,
        issue: commandContext.issue,
        defaultTargetState: "Canceled"
      },
      cancelPayload
    );
  } finally {
    runtimeContext.db.close();
  }
}

function buildCancelPayload(flags: Awaited<ReturnType<ToolCancelCommand["parse"]>>["flags"]) {
  return {
    reason: flags.reason,
    state: flags.state ?? null
  };
}

async function cancelIssueThroughApi(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  cancelPayload: ReturnType<typeof buildCancelPayload>
) {
  return await postRuntimeToolRequest({
    apiBaseUrl: commandContext.apiBaseUrl!,
    endpoint: "cancel",
    runId: commandContext.runId,
    turnId: commandContext.turnId,
    issue: commandContext.issue,
    argumentsPayload: cancelPayload
  });
}
