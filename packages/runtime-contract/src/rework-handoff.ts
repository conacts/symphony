export const runtimeReworkHandoffEventType = "rework_handoff_recorded";

export type SymphonyReworkHandoffSource = "github_review";

export type SymphonyReworkHandoff = {
  source: SymphonyReworkHandoffSource;
  triggerKind: string;
  reviewContextUrl: string | null;
  pullRequestUrl: string | null;
  actorLogin: string | null;
  feedbackBody: string | null;
  recordedAt: string;
};

export function isSymphonyReworkHandoff(
  value: unknown
): value is SymphonyReworkHandoff {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const source = getNonEmptyString(record.source);
  const triggerKind = getNonEmptyString(record.triggerKind);
  const recordedAt = getNonEmptyString(record.recordedAt);

  return (
    source === "github_review" &&
    triggerKind !== null &&
    recordedAt !== null
  );
}

export function formatSymphonyReworkHandoffSection(
  handoff: SymphonyReworkHandoff | null
): string | null {
  if (!handoff) {
    return null;
  }

  const sourceDescription =
    handoff.source === "github_review" ? "GitHub review feedback" : "review feedback";

  const lines = [
    "Rework handoff:",
    `- This run resumed because ${sourceDescription} triggered rework (${handoff.triggerKind}).`,
    `- Review context: ${handoff.reviewContextUrl ?? "unknown"}`,
    `- PR: ${handoff.pullRequestUrl ?? "unknown"}`,
    `- Actor: ${handoff.actorLogin ?? "unknown"}`,
    `- Recorded at: ${handoff.recordedAt}`
  ];

  if (handoff.feedbackBody) {
    lines.push("- Feedback:", handoff.feedbackBody);
  }

  lines.push(
    "- Required first step: read the linked review feedback and address it before making new changes."
  );

  return lines.join("\n");
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
