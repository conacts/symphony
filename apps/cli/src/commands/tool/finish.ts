import { Flags } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";
import { BaseCommand } from "../../base-command.js";
import { loadCliCommandContext } from "../../runtime-context.js";
import { postRuntimeToolRequest } from "../../runtime-tools-api.js";

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
      const result = await recordDeliveryReportThroughApi(
        commandContext,
        deliveryPayload
      );

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
  return await postRuntimeToolRequest({
    apiBaseUrl: commandContext.apiBaseUrl,
    endpoint: "finish",
    runId: commandContext.runId,
    turnId: commandContext.turnId,
    issue: commandContext.issue,
    argumentsPayload: deliveryPayload
  });
}
