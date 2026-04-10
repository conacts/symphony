import type {
  WorkflowPayload,
  WorkflowSignalSource
} from "./base.js";

export type WorkflowSignal<
  Type extends string = string,
  Payload = WorkflowPayload,
> = {
  id?: string;
  type: Type;
  source: WorkflowSignalSource;
  occurredAt?: string;
  causationId?: string | null;
  correlationId?: string | null;
  payload: Payload;
};

