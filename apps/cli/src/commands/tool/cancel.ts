import { Flags } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";
import { executeCancelTool } from "@symphony/runtime-tools";
import { BaseCommand } from "../../base-command.js";
import {
  loadCliCommandContext,
  loadCliRuntimeContext
} from "../../runtime-context.js";

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
  const response = await fetch(`${commandContext.apiBaseUrl}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      runId: commandContext.runId,
      turnId: commandContext.turnId,
      issue: commandContext.issue,
      arguments: cancelPayload
    })
  });

  const body = (await response.json()) as {
    ok?: boolean;
    data?: {
      success: boolean;
      output: string;
      contentItems: Array<{
        type: "inputText";
        text: string;
      }>;
    };
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !body.ok || !body.data) {
    throw new Error(
      body.error?.message ??
        `Symphony runtime tools API request failed with status ${response.status}.`
    );
  }

  return body.data;
}
