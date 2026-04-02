import { parse as parseYaml } from "yaml";
import { isRecord } from "../internal/records.js";
import { SymphonyWorkflowError } from "./symphony-workflow-errors.js";
import { normalizeObjectKeys } from "./symphony-workflow-values.js";

export function splitWorkflowFrontMatter(content: string): {
  frontMatter: string;
  promptLines: string[];
} {
  const lines = content.split(/\r?\n/u);

  if (lines[0] !== "---") {
    return {
      frontMatter: "",
      promptLines: lines
    };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    return {
      frontMatter: lines.slice(1).join("\n"),
      promptLines: []
    };
  }

  return {
    frontMatter: lines.slice(1, closingIndex).join("\n"),
    promptLines: lines.slice(closingIndex + 1)
  };
}

export function parseWorkflowFrontMatter(
  frontMatter: string
): Record<string, unknown> {
  if (frontMatter.trim() === "") {
    return {};
  }

  const parsed = parseYaml(frontMatter);
  if (!isRecord(parsed)) {
    throw new SymphonyWorkflowError(
      "workflow_front_matter_not_a_map",
      "Workflow front matter must decode to a map."
    );
  }

  return normalizeObjectKeys(parsed);
}
