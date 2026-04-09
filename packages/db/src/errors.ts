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
