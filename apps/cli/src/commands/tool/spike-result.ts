import { readFile } from "node:fs/promises";
import { Flags } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";
import { executeSpikeResultTool } from "@symphony/runtime-tools";
import { BaseCommand } from "../../base-command.js";
import {
  loadCliCommandContext,
  loadCliRuntimeContext
} from "../../runtime-context.js";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

export default class ToolSpikeResultCommand extends BaseCommand {
  static summary = "Post the spike result to the active Symphony issue and transition it out of active execution.";

  static description =
    "Agent-facing runtime command for investigation runs. Posts a structured spike result comment and moves the issue to the pause state by default.";

  static flags = {
    ...BaseCommand.baseFlags,
    summary: Flags.string({
      description: "Short spike conclusion shown at the top of the Linear comment.",
      required: true
    }),
    details: Flags.string({
      description: "Detailed markdown body for the spike result comment."
    }),
    "details-file": Flags.string({
      description: "Path to a markdown file containing the detailed spike findings."
    }),
    state: Flags.string({
      description: "Optional issue state to move to after posting the spike result."
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ToolSpikeResultCommand);
    const commandContext = loadCliCommandContext();
    const spikePayload = await buildSpikeResultPayload(flags);

    try {
      const result = commandContext.apiBaseUrl
        ? await submitSpikeResultThroughApi(commandContext, spikePayload)
        : await submitSpikeResultLocally(commandContext, spikePayload);

      this.printJson(JSON.parse(result.output));

      if (!result.success) {
        this.exit(1);
      }
    } catch (error) {
      logger.error("symphony tool spike-result failed", {
        error
      });
      throw error;
    }
  }
}

async function submitSpikeResultLocally(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  spikePayload: Awaited<ReturnType<typeof buildSpikeResultPayload>>
) {
  const runtimeContext = loadCliRuntimeContext();

  try {
    return await executeSpikeResultTool(
      {
        tracker: runtimeContext.tracker,
        issue: commandContext.issue,
        defaultTargetState: runtimeContext.trackerConfig.pauseTransitionToState
      },
      spikePayload
    );
  } finally {
    runtimeContext.db.close();
  }
}

async function submitSpikeResultThroughApi(
  commandContext: ReturnType<typeof loadCliCommandContext>,
  spikePayload: Awaited<ReturnType<typeof buildSpikeResultPayload>>
) {
  const response = await fetch(`${commandContext.apiBaseUrl}/spike-result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      runId: commandContext.runId,
      turnId: commandContext.turnId,
      issue: commandContext.issue,
      arguments: spikePayload
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

async function buildSpikeResultPayload(
  flags: Awaited<ReturnType<ToolSpikeResultCommand["parse"]>>["flags"]
) {
  const details = await resolveSpikeResultDetails(flags);

  return {
    summary: flags.summary,
    details,
    state: flags.state ?? null
  };
}

async function resolveSpikeResultDetails(
  flags: Awaited<ReturnType<ToolSpikeResultCommand["parse"]>>["flags"]
): Promise<string> {
  if (flags.details && flags["details-file"]) {
    throw new TypeError(
      "Provide either `--details` or `--details-file` to `symphony tool spike-result`, not both."
    );
  }

  if (flags.details) {
    return flags.details;
  }

  if (flags["details-file"]) {
    return await readFile(flags["details-file"], "utf8");
  }

  throw new TypeError(
    "`symphony tool spike-result` requires either `--details` or `--details-file`."
  );
}
