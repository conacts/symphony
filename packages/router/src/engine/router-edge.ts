import type {
  WorkflowCommand,
  WorkflowEvaluationContext,
  WorkflowTransitionContext
} from "../types/index.js";
import type { WorkflowNodeId } from "../types/base.js";

export type WorkflowEdgeFrom<Node extends WorkflowNodeId> = Node | "*";

export type WorkflowEdgeGuard<
  Data,
  Policy,
> = (
  input: WorkflowEvaluationContext<WorkflowNodeId, Data, Policy>
) => boolean;

export type WorkflowEdgeCommandFactory<
  Data,
  Policy,
> = (
  input: WorkflowTransitionContext<WorkflowNodeId, Data, Policy>
) => WorkflowCommand[];

export type WorkflowEdgeOptions<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  id: string;
  from: WorkflowEdgeFrom<Node>;
  to: Node;
  reasonCode: string;
  priority?: number;
  guard?: WorkflowEdgeGuard<Data, Policy>;
  commands?: WorkflowEdgeCommandFactory<Data, Policy>;
};

export class WorkflowEdge<
  Node extends WorkflowNodeId,
  Data = Record<string, never>,
  Policy = Record<string, never>,
> {
  readonly id: string;
  readonly from: WorkflowEdgeFrom<Node>;
  readonly to: Node;
  readonly reasonCode: string;
  readonly priority: number;
  readonly #guard: WorkflowEdgeGuard<Data, Policy> | null;
  readonly #commands: WorkflowEdgeCommandFactory<Data, Policy> | null;

  constructor(input: WorkflowEdgeOptions<Node, Data, Policy>) {
    this.id = normalizeRequiredText(input.id, "edge id");
    this.from =
      input.from === "*" ? "*" : (normalizeRequiredText(input.from, "edge from") as Node);
    this.to = normalizeRequiredText(input.to, "edge to") as Node;
    this.reasonCode = normalizeRequiredText(input.reasonCode, "edge reasonCode");
    this.priority = Number.isFinite(input.priority) ? input.priority ?? 0 : 0;
    this.#guard = input.guard ?? null;
    this.#commands = input.commands ?? null;
  }

  matchesCurrentNode(currentNode: Node | null): boolean {
    return this.from === "*" || this.from === currentNode;
  }

  accepts(input: WorkflowEvaluationContext<Node, Data, Policy>): boolean {
    if (!this.matchesCurrentNode(input.projection.currentNode)) {
      return false;
    }

    return this.#guard ? this.#guard(input) : true;
  }

  emitCommands(
    input: WorkflowTransitionContext<Node, Data, Policy>
  ): WorkflowCommand[] {
    return this.#commands?.(input) ?? [];
  }
}

function normalizeRequiredText(value: string, subject: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${subject} is required.`);
  }

  return normalized;
}
