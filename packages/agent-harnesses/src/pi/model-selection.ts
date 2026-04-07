import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError } from "../shared/session-types.js";

export const defaultPiModel = "xiaomi/mimo-v2-pro";
export const defaultPiReasoningEffort = "xhigh";
export const piModelLabelPrefix = "symphony:model:";
export const piPresetLabelPrefix = "symphony:pi-preset:";
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
  defaultPreset?: string | null;
  presets?: Record<
    string,
    {
      model: string | null;
      reasoningEffort: string | null;
    }
  >;
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
  defaults: PiIssueSelectionDefaults | string = defaultPiModel
): string {
  return resolvePiIssueSelection(
    issue,
    typeof defaults === "string" ? { model: defaults } : defaults
  ).model;
}

export function resolvePiIssueSelection(
  issue: SymphonyTrackerIssue,
  defaults: PiIssueSelectionDefaults = {}
): PiIssueSelection {
  const presetSelection = resolvePiPresetSelection(issue, defaults);

  return {
    model: selectPiIssueLabelOverride({
      issue,
      labelPrefix: piModelLabelPrefix,
      supportedValues: supportedPiModelSet,
      fallbackValue:
        presetSelection?.model ?? defaults.model ?? defaultPiModel,
      settingName: "model"
    }),
    reasoningEffort: selectPiIssueLabelOverride({
      issue,
      labelPrefix: piReasoningLabelPrefix,
      supportedValues: supportedPiReasoningEffortSet,
      fallbackValue:
        normalizePiThinkingLevel(
          presetSelection?.reasoningEffort ?? defaults.reasoningEffort
        ) ??
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

function resolvePiPresetSelection(
  issue: SymphonyTrackerIssue,
  defaults: PiIssueSelectionDefaults
): PiIssueSelectionDefaults | null {
  const presetName = selectPiPresetOverride(issue, defaults);
  if (!presetName) {
    return null;
  }

  const preset = defaults.presets?.[presetName];
  if (!preset) {
    throw new HarnessSessionError(
      "invalid_pi_label_override",
      `Unsupported preset override label on ${issue.identifier}: ${piPresetLabelPrefix}${presetName}`,
      {
        issueLabel: `${piPresetLabelPrefix}${presetName}`,
        availablePresets: Object.keys(defaults.presets ?? {})
      }
    );
  }

  return preset;
}

function selectPiPresetOverride(
  issue: SymphonyTrackerIssue,
  defaults: PiIssueSelectionDefaults
): string | null {
  for (const label of issue.labels) {
    if (!label.startsWith(piPresetLabelPrefix)) {
      continue;
    }

    return label.slice(piPresetLabelPrefix.length).trim();
  }

  const defaultPreset = defaults.defaultPreset?.trim();
  return defaultPreset ? defaultPreset : null;
}
