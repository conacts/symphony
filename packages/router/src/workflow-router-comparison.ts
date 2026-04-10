import { Effect } from "effect";
import {
  InvalidRouterComparisonError,
  type WorkflowRouterError
} from "./router-errors.js";
import type {
  WorkflowRouterCandidate,
  WorkflowRouterComparisonEntry,
  WorkflowRouterComparisonResult,
  WorkflowRouterComparisonSummary,
  WorkflowSignal
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";

export class WorkflowRouterComparison<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> {
  static make<Node extends WorkflowNodeId, Data, Policy>(input: {
    candidates: ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>>;
  }): Effect.Effect<
    WorkflowRouterComparison<Node, Data, Policy>,
    InvalidRouterComparisonError,
    never
  > {
    return Effect.try({
      try: () => {
        if (input.candidates.length === 0) {
          throw new InvalidRouterComparisonError({
            message: "Workflow router comparison requires at least one candidate."
          });
        }

        const seenIds = new Set<string>();
        for (const candidate of input.candidates) {
          const candidateId = candidate.id.trim();
          if (candidateId.length === 0) {
            throw new InvalidRouterComparisonError({
              message: "Workflow router comparison candidate id is required."
            });
          }

          if (seenIds.has(candidateId)) {
            throw new InvalidRouterComparisonError({
              message: `Duplicate workflow router comparison candidate id: ${candidateId}.`,
              detail: {
                candidateId
              }
            });
          }

          seenIds.add(candidateId);
        }

        return new WorkflowRouterComparison(
          input.candidates.map((candidate) => ({
            ...candidate,
            id: candidate.id.trim()
          }))
        );
      },
      catch: (error) => error as InvalidRouterComparisonError
    });
  }

  readonly #candidates: ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>>;

  private constructor(
    candidates: ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>>
  ) {
    this.#candidates = candidates;
  }

  candidates(): ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>> {
    return this.#candidates;
  }

  compare(input: {
    workflowId: string;
    signals: ReadonlyArray<WorkflowSignal>;
  }): Effect.Effect<
    WorkflowRouterComparisonResult<Node, Data>,
    WorkflowRouterError,
    never
  > {
    return Effect.gen(this, function* () {
      const entries: WorkflowRouterComparisonEntry<Node, Data>[] = [];

      for (const candidate of this.#candidates) {
        const simulation = yield* candidate.router.simulate({
          workflowId: input.workflowId,
          history: candidate.history,
          signals: input.signals,
          policy: candidate.policy
        });

        entries.push({
          candidateId: candidate.id,
          simulation
        });
      }

      return {
        workflowId: input.workflowId,
        signals: input.signals,
        entries,
        summary: summarizeComparison(entries)
      };
    });
  }
}

export function createWorkflowRouterComparison<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  candidates: ReadonlyArray<WorkflowRouterCandidate<Node, Data, Policy>>;
}): Effect.Effect<
  WorkflowRouterComparison<Node, Data, Policy>,
  InvalidRouterComparisonError,
  never
> {
  return WorkflowRouterComparison.make(input);
}

function summarizeComparison<Node extends WorkflowNodeId, Data>(
  entries: ReadonlyArray<WorkflowRouterComparisonEntry<Node, Data>>
): WorkflowRouterComparisonSummary<Node> {
  const finalNodeByCandidate: Record<string, Node | null> = {};
  const reasonCodesByCandidate: Record<string, string[]> = {};
  const pendingCommandCountsByCandidate: Record<string, number> = {};

  for (const entry of entries) {
    finalNodeByCandidate[entry.candidateId] = entry.simulation.projection.currentNode;
    reasonCodesByCandidate[entry.candidateId] = entry.simulation.steps.map(
      (step) => step.result.decision.reasonCode
    );
    pendingCommandCountsByCandidate[entry.candidateId] =
      entry.simulation.projection.pendingCommands.length;
  }

  const nodeSignatures = new Set(
    Object.values(finalNodeByCandidate).map((value) => value ?? "__null__")
  );
  const reasonSignatures = new Set(
    Object.values(reasonCodesByCandidate).map((value) => value.join("\u0000"))
  );
  const pendingCommandSignatures = new Set(
    Object.values(pendingCommandCountsByCandidate)
  );

  return {
    diverged:
      nodeSignatures.size > 1 ||
      reasonSignatures.size > 1 ||
      pendingCommandSignatures.size > 1,
    finalNodeByCandidate,
    reasonCodesByCandidate,
    pendingCommandCountsByCandidate
  };
}
