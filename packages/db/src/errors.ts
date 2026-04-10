import type { SymphonyRuntimeRunStatus } from "./runtime-run-types.js";

export class SymphonyDbError extends Error {
  readonly fatal = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SymphonyDbError";
  }
}

export class SymphonyDbMigrationError extends SymphonyDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SymphonyDbMigrationError";
  }
}

export class SymphonyActiveRunExistsError extends SymphonyDbError {
  readonly issueIdentifier: string;
  readonly existingRunId: string;
  readonly existingStatus: Extract<
    SymphonyRuntimeRunStatus,
    "dispatching" | "running"
  >;

  constructor(input: {
    issueIdentifier: string;
    existingRunId: string;
    existingStatus: Extract<SymphonyRuntimeRunStatus, "dispatching" | "running">;
  }) {
    super(
      `Issue ${input.issueIdentifier} already has active run ${input.existingRunId} (${input.existingStatus}).`
    );
    this.name = "SymphonyActiveRunExistsError";
    this.issueIdentifier = input.issueIdentifier;
    this.existingRunId = input.existingRunId;
    this.existingStatus = input.existingStatus;
  }
}

export class SymphonyRouteWorkflowExistsError extends SymphonyDbError {
  readonly issueIdentifier: string;
  readonly existingWorkflowId: string;

  constructor(input: {
    issueIdentifier: string;
    existingWorkflowId: string;
  }) {
    super(
      `Issue ${input.issueIdentifier} already has active route workflow ${input.existingWorkflowId}.`
    );
    this.name = "SymphonyRouteWorkflowExistsError";
    this.issueIdentifier = input.issueIdentifier;
    this.existingWorkflowId = input.existingWorkflowId;
  }
}

export class SymphonyRouteWorkflowNotFoundError extends SymphonyDbError {
  readonly workflowId: string;

  constructor(input: {
    workflowId: string;
  }) {
    super(`Route workflow ${input.workflowId} was not found.`);
    this.name = "SymphonyRouteWorkflowNotFoundError";
    this.workflowId = input.workflowId;
  }
}
