import { Flags } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";
import { executeDeliveryReportTool } from "@symphony/runtime-tools";
import { BaseCommand } from "../../base-command.js";
import {
  loadCliCommandContext,
  loadCliRuntimeContext
} from "../../runtime-context.js";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

export default class ToolFinishCommand extends BaseCommand {
  static summary = "Record delivery for the active Symphony run and move completed work to In Review.";

  static description =
    "Agent-facing runtime command for finishing the active Symphony run by recording the delivery report.";

  static flags = {
    ...BaseCommand.baseFlags,
    status: Flags.string({
      description: "Delivery status for the active issue.",
      required: true,
      options: ["completed", "blocked", "partial"]
    }),
    summary: Flags.string({
      description: "Short delivery summary.",
      required: true
    }),
    "pr-url": Flags.string({
      description: "Opened PR URL. Required when status is completed."
    }),
    "pr-number": Flags.string({
      description: "Optional PR number."
    }),
    "branch-name": Flags.string({
      description: "Optional branch name."
    }),
    "blocking-reason": Flags.string({
      description: "Blocking reason. Required when status is blocked."
    }),
    "tests-summary": Flags.string({
      description: "Optional verification summary."
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ToolFinishCommand);
    const commandContext = loadCliCommandContext();
    const deliveryPayload = buildDeliveryReportPayload(flags);

    try {
      const result = commandContext.apiBaseUrl
        ? await recordDeliveryReportThroughApi(commandContext, deliveryPayload)
        : await recordDeliveryReportLocally(commandContext, deliveryPayload);

      this.printJson(JSON.parse(result.output));

      if (!result.success) {
        this.exit(1);
      }
    } catch (error) {
      logger.error("symphony tool finish failed", {
        error
      });
      throw error;
    }
  }
}

async function recordDeliveryReportLocally(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  deliveryPayload: ReturnType<typeof buildDeliveryReportPayload>
) {
  const runtimeContext = loadCliRuntimeContext();
  try {
    return await executeDeliveryReportTool(
      buildDeliveryExecutionContext(runtimeContext, commandContext),
      deliveryPayload
    );
  } finally {
    runtimeContext.db.close();
  }
}

function buildDeliveryExecutionContext(
  runtimeContext: ReturnType<typeof loadCliRuntimeContext>,
  commandContext: ReturnType<typeof loadCliCommandContext>
) {
  return {
    tracker: runtimeContext.tracker,
    deliveryReports: runtimeContext.deliveryReports,
    issue: commandContext.issue,
    runId: commandContext.runId,
    turnId: commandContext.turnId
  };
}

function buildDeliveryReportPayload(flags: Awaited<ReturnType<ToolFinishCommand["parse"]>>["flags"]) {
  return {
    status: flags.status,
    summary: flags.summary,
    prUrl: flags["pr-url"] ?? null,
    prNumber: flags["pr-number"] ?? null,
    branchName: flags["branch-name"] ?? null,
    blockingReason: flags["blocking-reason"] ?? null,
    testsSummary: flags["tests-summary"] ?? null
  };
}

async function recordDeliveryReportThroughApi(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  deliveryPayload: ReturnType<typeof buildDeliveryReportPayload>
) {
  const response = await fetch(`${commandContext.apiBaseUrl}/finish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      runId: commandContext.runId,
      turnId: commandContext.turnId,
      issue: commandContext.issue,
      arguments: deliveryPayload
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
