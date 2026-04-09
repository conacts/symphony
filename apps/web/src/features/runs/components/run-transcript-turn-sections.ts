import type { AgentRunTranscriptEntry } from "@/features/runs/model/agent-run-transcript";

type TranscriptSection = {
  key: string;
  label: string;
  description: string;
  entries: AgentRunTranscriptEntry[];
};

export function buildTranscriptSections(
  entries: AgentRunTranscriptEntry[]
): TranscriptSection[] {
  const sections: TranscriptSection[] = [];

  for (const entry of entries) {
    const descriptor = describeTranscriptEntryGroup(entry);
    const previousSection = sections.at(-1);

    if (
      previousSection &&
      previousSection.label === descriptor.label &&
      previousSection.description === descriptor.description
    ) {
      previousSection.entries.push(entry);
      continue;
    }

    sections.push({
      key: `${descriptor.label}:${entry.itemId}`,
      label: descriptor.label,
      description: descriptor.description,
      entries: [entry]
    });
  }

  return sections;
}

function describeTranscriptEntryGroup(
  entry: AgentRunTranscriptEntry
): Pick<TranscriptSection, "label" | "description"> {
  if (entry.kind === "reasoning") {
    return {
      label: "Reasoning",
      description: "The agent's internal analysis and planning before or between actions."
    };
  }

  if (entry.kind === "agent-message") {
    return {
      label: "Assistant output",
      description: "User-facing responses and delivery-oriented summaries from the agent."
    };
  }

  if (entry.kind === "todo-list") {
    return {
      label: "Task timeline",
      description: "Structured task-state updates captured during the turn."
    };
  }

  return {
    label: "Execution log",
    description: "Commands, tools, and file operations captured while the turn was running."
  };
}
