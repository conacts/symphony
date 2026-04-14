export const completedDeliveryTransitionStates = ["Done"] as const;

export type RuntimeToolExecutionResult = {
  success: boolean;
  output: string;
  contentItems: Array<{
    type: "inputText";
    text: string;
  }>;
};

export type RuntimeDeliveryReportResult = {
  reportId: string;
  status: "completed" | "blocked" | "partial";
  summary: string;
  prUrl: string | null;
  blockingReason: string | null;
};

export type RuntimeMergeResult = {
  status: "merged" | "blocked";
  summary: string;
  prUrl: string | null;
  mergeCommitSha: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
};

export function isCompletedDeliveryTransitionState(
  targetState: string | null | undefined
): boolean {
  const normalizedTargetState = targetState?.trim().toLowerCase();
  if (!normalizedTargetState) {
    return false;
  }

  return completedDeliveryTransitionStates.some(
    (state) => state.toLowerCase() === normalizedTargetState
  );
}
