import { stringify as stringifyYaml } from "yaml";
import type { SymphonyResolvedWorkflowConfig } from "@symphony/core";
import { buildSymphonyWorkflowConfig } from "./core-builders.js";

export function renderSymphonyWorkflowMarkdown(input: {
  config?: Partial<SymphonyResolvedWorkflowConfig>;
  promptTemplate?: string;
} = {}): string {
  const config = buildSymphonyWorkflowConfig(input.config);
  const yaml = stringifyYaml(config).trimEnd();

  return `---\n${yaml}\n---\n${input.promptTemplate ?? "Prompt body"}\n`;
}
