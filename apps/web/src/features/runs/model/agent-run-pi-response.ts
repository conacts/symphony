import type {
  SymphonyAgentMessageRecord,
  SymphonyAgentReasoningBlockRecord,
  SymphonyAgentRunArtifactsResult
} from "@symphony/contracts";
import {
  formatCount,
  formatLabel,
  formatTimestamp
} from "@/core/display-formatters";
import { sortCounts } from "@/core/counts";
import type { AgentRunViewModel } from "./agent-run-view-model";
import type { PiResponseMetadata } from "./agent-run-transcript";

type PiResponseRecord = PiResponseMetadata & {
  recordedAt: string;
};

export function buildPiResponseCards(
  runArtifacts: SymphonyAgentRunArtifactsResult | null,
  compareDescending: (left: string | null, right: string | null) => number
): AgentRunViewModel["piResponseCards"] {
  const responses = collectPiResponses(runArtifacts);

  if (responses.length === 0) {
    return [
      {
        label: "Pi responses",
        value: "n/a",
        detail: "No typed Pi response metadata was captured for this run."
      },
      {
        label: "Dominant model",
        value: "n/a",
        detail: "No Pi response model metadata was captured for this run."
      },
      {
        label: "Top stop reason",
        value: "n/a",
        detail: "No Pi stop-reason metadata was captured for this run."
      }
    ];
  }

  const totalTokens = responses.reduce((sum, response) => sum + response.totalTokens, 0);
  const cachedInputTokens = responses.reduce(
    (sum, response) => sum + response.cachedInputTokens,
    0
  );
  const dominantModel = sortCounts(
    countResponseField(responses, (response) => response.model ?? "Unknown model")
  )[0];
  const dominantStopReason = sortCounts(
    countResponseField(
      responses,
      (response) => response.stopReason ?? "No stop reason"
    )
  )[0];
  const latestResponse = [...responses].sort((left, right) =>
    compareDescending(
      left.responseTimestamp ?? left.recordedAt,
      right.responseTimestamp ?? right.recordedAt
    )
  )[0];

  return [
    {
      label: "Pi responses",
      value: formatCount(responses.length),
      detail: `${formatCount(totalTokens)} total tokens · ${formatCount(
        cachedInputTokens
      )} cached input.`
    },
    {
      label: "Dominant model",
      value: dominantModel?.[0] ?? "n/a",
      detail: dominantModel
        ? `${formatCount(dominantModel[1])} response items used this model.`
        : "No Pi response model metadata was captured for this run."
    },
    {
      label: "Top stop reason",
      value: formatLabel(dominantStopReason?.[0] ?? "n/a"),
      detail: latestResponse
        ? `Latest ${formatLabel(latestResponse.provider ?? "provider")} / ${formatLabel(
            latestResponse.api ?? "api"
          )} at ${formatTimestamp(latestResponse.responseTimestamp ?? latestResponse.recordedAt)}.`
        : "No Pi stop-reason metadata was captured for this run."
    }
  ];
}

export function mapPiResponseMetadata(
  value:
    | SymphonyAgentMessageRecord["piMessage"]
    | SymphonyAgentReasoningBlockRecord["piMessage"]
    | undefined
): PiResponseMetadata | null {
  if (!value) {
    return null;
  }

  return {
    responseId: value.responseId,
    api: value.api,
    provider: value.provider,
    model: value.model,
    stopReason: value.stopReason,
    responseTimestamp: value.responseTimestamp,
    inputTokens: value.inputTokens,
    cachedInputTokens: value.cachedInputTokens,
    cacheWriteTokens: value.cacheWriteTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens
  };
}

function collectPiResponses(runArtifacts: SymphonyAgentRunArtifactsResult | null): PiResponseRecord[] {
  const messages = runArtifacts?.agentMessages ?? [];
  const reasoning = runArtifacts?.reasoning ?? [];

  return [...messages, ...reasoning].flatMap((record) =>
    record.piMessage
      ? [
          {
            ...record.piMessage,
            recordedAt: record.recordedAt
          }
        ]
      : []
  );
}

function countResponseField(
  responses: PiResponseRecord[],
  getValue: (response: PiResponseRecord) => string
) {
  const counts = new Map<string, number>();

  for (const response of responses) {
    const value = getValue(response);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}
