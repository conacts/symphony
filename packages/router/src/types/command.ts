import type { WorkflowPayload } from "./base.js";

export type WorkflowCommand<
  Kind extends string = string,
  Payload = WorkflowPayload,
> = {
  id: string;
  kind: Kind;
  payload: Payload;
  dedupeKey: string | null;
};
