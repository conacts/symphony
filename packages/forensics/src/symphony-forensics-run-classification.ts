import type { SymphonyRunSummary } from "@symphony/run-journal";

const symphonyCompletedRunOutcomes = new Set([
  "completed",
  "completed_turn_batch",
  "merged",
  "done"
]);

export function problemSummary(runs: SymphonyRunSummary[]): Record<string, number> {
  return runs.reduce<Record<string, number>>((summary, run) => {
    if (!run.outcome) {
      return summary;
    }

    summary[run.outcome] = (summary[run.outcome] ?? 0) + 1;
    return summary;
  }, {});
}

export function isProblemOutcome(outcome: string | null): boolean {
  return outcome !== null && !symphonyCompletedRunOutcomes.has(outcome);
}

export function isCompletedOutcome(outcome: string | null): boolean {
  return outcome !== null && symphonyCompletedRunOutcomes.has(outcome);
}
