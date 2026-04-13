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
  readonly trackerIssueKey: string;
  readonly existingRunId: string;
  readonly existingStatus: Extract<
    SymphonyRuntimeRunStatus,
    "dispatching" | "running"
  >;

  constructor(input: {
    trackerIssueKey: string;
    existingRunId: string;
    existingStatus: Extract<SymphonyRuntimeRunStatus, "dispatching" | "running">;
  }) {
    super(
      `Issue ${input.trackerIssueKey} already has active run ${input.existingRunId} (${input.existingStatus}).`
    );
    this.name = "SymphonyActiveRunExistsError";
    this.trackerIssueKey = input.trackerIssueKey;
    this.existingRunId = input.existingRunId;
    this.existingStatus = input.existingStatus;
  }
}

export class SymphonyRouteWorkflowExistsError extends SymphonyDbError {
  readonly trackerIssueKey: string;
  readonly existingWorkflowId: string;

  constructor(input: {
    trackerIssueKey: string;
    existingWorkflowId: string;
  }) {
    super(
      `Issue ${input.trackerIssueKey} already has active route workflow ${input.existingWorkflowId}.`
    );
    this.name = "SymphonyRouteWorkflowExistsError";
    this.trackerIssueKey = input.trackerIssueKey;
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
