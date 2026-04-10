import { Data } from "effect";

export class InvalidRouterDefinitionError extends Data.TaggedError(
  "InvalidRouterDefinitionError"
)<{
  readonly message: string;
  readonly detail?: Record<string, unknown> | null;
}> {}

export class InvalidRouterComparisonError extends Data.TaggedError(
  "InvalidRouterComparisonError"
)<{
  readonly message: string;
  readonly detail?: Record<string, unknown> | null;
}> {}

export class UnknownNodeError extends Data.TaggedError("UnknownNodeError")<{
  readonly nodeId: string;
}> {}

export class UnknownEdgeSelectionError extends Data.TaggedError(
  "UnknownEdgeSelectionError"
)<{
  readonly edgeId: string;
}> {}

export class ProjectionCorruptedError extends Data.TaggedError(
  "ProjectionCorruptedError"
)<{
  readonly message: string;
}> {}

export class AmbiguousTransitionError extends Data.TaggedError(
  "AmbiguousTransitionError"
)<{
  readonly currentNode: string | null;
  readonly edgeIds: string[];
}> {}

export class DuplicateSignalIdError extends Data.TaggedError(
  "DuplicateSignalIdError"
)<{
  readonly signalId: string;
}> {}

export class DuplicateCommandIdError extends Data.TaggedError(
  "DuplicateCommandIdError"
)<{
  readonly commandId: string;
}> {}

export type WorkflowRouterError =
  | InvalidRouterDefinitionError
  | InvalidRouterComparisonError
  | UnknownNodeError
  | UnknownEdgeSelectionError
  | ProjectionCorruptedError
  | AmbiguousTransitionError
  | DuplicateSignalIdError
  | DuplicateCommandIdError;

export function toWorkflowRouterError(
  error: unknown,
  fallbackMessage = "Unknown workflow router failure."
): WorkflowRouterError {
  if (
    error instanceof InvalidRouterDefinitionError ||
    error instanceof InvalidRouterComparisonError ||
    error instanceof UnknownNodeError ||
    error instanceof UnknownEdgeSelectionError ||
    error instanceof ProjectionCorruptedError ||
    error instanceof AmbiguousTransitionError ||
    error instanceof DuplicateSignalIdError ||
    error instanceof DuplicateCommandIdError
  ) {
    return error;
  }

  return new ProjectionCorruptedError({
    message: error instanceof Error ? error.message : fallbackMessage
  });
}
