import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError } from "../shared/session-types.js";

export const defaultPiModel = "xiaomi/mimo-v2-pro";
export const defaultPiReasoningEffort = "xhigh";
export const piModelLabelPrefix = "symphony:model:";
export const piReasoningLabelPrefix = "symphony:reasoning:";

const supportedPiModelSet = new Set([
  "xiaomi/mimo-v2-pro",
  "gpt-5.4",
  "gpt-5.4-mini"
]);

const supportedPiReasoningEffortSet = new Set([
  "low",
  "medium",
  "high",
  "xhigh"
]);
const acceptedPiThinkingLevelSet = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
]);

export type PiIssueSelectionDefaults = {
  model?: string | null;
  reasoningEffort?: string | null;
};

export type PiIssueSelection = {
  model: string;
  reasoningEffort: string;
};

export function listSupportedPiModels(): string[] {
  return [...supportedPiModelSet];
}

export function resolvePiIssueModel(
  issue: SymphonyTrackerIssue,
  defaultModel = defaultPiModel
): string {
  return selectPiIssueLabelOverride({
    issue,
    labelPrefix: piModelLabelPrefix,
    supportedValues: supportedPiModelSet,
    fallbackValue: defaultModel,
    settingName: "model"
  });
}

export function resolvePiIssueSelection(
  issue: SymphonyTrackerIssue,
  defaults: PiIssueSelectionDefaults = {}
): PiIssueSelection {
  return {
    model: selectPiIssueLabelOverride({
      issue,
      labelPrefix: piModelLabelPrefix,
      supportedValues: supportedPiModelSet,
      fallbackValue: defaults.model ?? defaultPiModel,
      settingName: "model"
    }),
    reasoningEffort: selectPiIssueLabelOverride({
      issue,
      labelPrefix: piReasoningLabelPrefix,
      supportedValues: supportedPiReasoningEffortSet,
      fallbackValue:
        normalizePiThinkingLevel(defaults.reasoningEffort) ??
        defaultPiReasoningEffort,
      settingName: "reasoning effort"
    })
  };
}

export function normalizePiThinkingLevel(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }

  return acceptedPiThinkingLevelSet.has(normalized) ? normalized : "medium";
}

function selectPiIssueLabelOverride(input: {
  issue: SymphonyTrackerIssue;
  labelPrefix: string;
  supportedValues: Set<string>;
  fallbackValue: string;
  settingName: string;
}): string {
  for (const label of input.issue.labels) {
    if (!label.startsWith(input.labelPrefix)) {
      continue;
    }

    const overrideValue = label.slice(input.labelPrefix.length).trim();
    if (input.supportedValues.has(overrideValue)) {
      return overrideValue;
    }

    throw new HarnessSessionError(
      "invalid_pi_label_override",
      `Unsupported ${input.settingName} override label on ${input.issue.identifier}: ${label}`,
      {
        issueLabel: label,
        fallback: input.fallbackValue
      }
    );
  }

  return input.fallbackValue;
}
