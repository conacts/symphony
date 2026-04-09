import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError } from "../shared/session-types.js";

export const defaultPiModel = "xiaomi/mimo-v2-pro";
export const defaultPiReasoningEffort = "xhigh";
export const piModelLabelPrefix = "model:";
export const piPresetLabelPrefix = "model:";
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
      authMode?: "provider" | "subscription" | null;
    }
  >;
};

export type PiIssueSelection = {
  presetName: string | null;
  model: string;
  reasoningEffort: string;
  authMode: "provider" | "subscription";
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
    presetName: presetSelection?.presetName ?? normalizedDefaultPreset(defaults),
    model: selectPiIssueModelOverride(issue, defaults, presetSelection?.model ?? null),
    reasoningEffort: selectPiIssueLabelOverride({
      issue,
      labelPrefixes: [piReasoningLabelPrefix],
      supportedValues: supportedPiReasoningEffortSet,
      fallbackValue:
        normalizePiThinkingLevel(
          presetSelection?.reasoningEffort ?? defaults.reasoningEffort
        ) ??
        defaultPiReasoningEffort,
      settingName: "reasoning effort"
    }),
    authMode: presetSelection?.authMode ?? "provider"
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
  labelPrefixes: string[];
  supportedValues: Set<string>;
  fallbackValue: string;
  settingName: string;
}): string {
  for (const label of input.issue.labels) {
    const matchedPrefix = input.labelPrefixes.find((labelPrefix) =>
      label.startsWith(labelPrefix)
    );
    if (!matchedPrefix) {
      continue;
    }

    const overrideValue = label.slice(matchedPrefix.length).trim();
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
) {
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

  return {
    ...preset,
    presetName,
    authMode: preset.authMode ?? "provider"
  };
}

function selectPiPresetOverride(
  issue: SymphonyTrackerIssue,
  defaults: PiIssueSelectionDefaults
): string | null {
  const availablePresets = Object.keys(defaults.presets ?? {});
  const availablePresetSet = new Set(availablePresets);

  for (const label of issue.labels) {
    if (label.startsWith(piPresetLabelPrefix)) {
      const overrideValue = label.slice(piPresetLabelPrefix.length).trim();
      if (availablePresetSet.has(overrideValue)) {
        return overrideValue;
      }

      if (supportedPiModelSet.has(overrideValue)) {
        continue;
      }

      throw new HarnessSessionError(
        "invalid_pi_label_override",
        `Unsupported preset override label on ${issue.identifier}: ${label}`,
        {
          issueLabel: label,
          availablePresets
        }
      );
    }
  }

  return normalizedDefaultPreset(defaults);
}

function selectPiIssueModelOverride(
  issue: SymphonyTrackerIssue,
  defaults: PiIssueSelectionDefaults,
  presetModel: string | null
): string {
  const fallbackValue = presetModel ?? defaults.model ?? defaultPiModel;
  const availablePresetSet = new Set(Object.keys(defaults.presets ?? {}));

  for (const label of issue.labels) {
    if (!label.startsWith(piModelLabelPrefix)) {
      continue;
    }

    const overrideValue = label.slice(piModelLabelPrefix.length).trim();
    if (availablePresetSet.has(overrideValue)) {
      continue;
    }

    if (supportedPiModelSet.has(overrideValue)) {
      return overrideValue;
    }

    throw new HarnessSessionError(
      "invalid_pi_label_override",
      `Unsupported model override label on ${issue.identifier}: ${label}`,
      {
        issueLabel: label,
        fallback: fallbackValue
      }
    );
  }

  return fallbackValue;
}

function normalizedDefaultPreset(defaults: PiIssueSelectionDefaults): string | null {
  const defaultPreset = defaults.defaultPreset?.trim();
  return defaultPreset ? defaultPreset : null;
}
