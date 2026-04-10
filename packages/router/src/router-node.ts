import type {
  WorkflowCommand,
  WorkflowTransitionContext
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";

export type WorkflowNodeCommandFactory<
  Data,
  Policy,
> = (
  input: WorkflowTransitionContext<WorkflowNodeId, Data, Policy>
) => WorkflowCommand[];

export type WorkflowNodeOptions<
  Data,
  Policy,
> = {
  terminal?: boolean;
  enter?: WorkflowNodeCommandFactory<Data, Policy>;
  exit?: WorkflowNodeCommandFactory<Data, Policy>;
};

export class WorkflowNode<
  Node extends WorkflowNodeId,
  Data = Record<string, never>,
  Policy = Record<string, never>,
> {
  readonly id: Node;
  readonly terminal: boolean;
  readonly #enter: WorkflowNodeCommandFactory<Data, Policy> | null;
  readonly #exit: WorkflowNodeCommandFactory<Data, Policy> | null;

  constructor(
    id: Node,
    options: WorkflowNodeOptions<Data, Policy> = {}
  ) {
    this.id = normalizeRequiredText(id, "node id") as Node;
    this.terminal = options.terminal ?? false;
    this.#enter = options.enter ?? null;
    this.#exit = options.exit ?? null;
  }

  isTerminal(): boolean {
    return this.terminal;
  }

  emitEnterCommands(
    input: WorkflowTransitionContext<Node, Data, Policy>
  ): WorkflowCommand[] {
    return this.#enter?.(input) ?? [];
  }

  emitExitCommands(
    input: WorkflowTransitionContext<Node, Data, Policy>
  ): WorkflowCommand[] {
    return this.#exit?.(input) ?? [];
  }
}

function normalizeRequiredText(value: string, subject: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${subject} is required.`);
  }

  return normalized;
}
