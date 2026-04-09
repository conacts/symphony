export class SymphonyDispatchRefusedError extends Error {
  readonly reason: "active_run_exists";
  readonly issueIdentifier: string;
  readonly activeRunId: string;
  readonly activeRunStatus: "dispatching" | "running";

  constructor(input: {
    reason: "active_run_exists";
    issueIdentifier: string;
    activeRunId: string;
    activeRunStatus: "dispatching" | "running";
  }) {
    super(
      `Dispatch refused for ${input.issueIdentifier}: active run ${input.activeRunId} is still ${input.activeRunStatus}.`
    );
    this.name = "SymphonyDispatchRefusedError";
    this.reason = input.reason;
    this.issueIdentifier = input.issueIdentifier;
    this.activeRunId = input.activeRunId;
    this.activeRunStatus = input.activeRunStatus;
  }
}

export class SymphonyDispatchCancelledError extends Error {
  readonly reason: "inactive" | "terminal";
  readonly issueIdentifier: string;

  constructor(input: {
    reason: "inactive" | "terminal";
    issueIdentifier: string;
  }) {
    super(
      input.reason === "terminal"
        ? `Dispatch cancelled for ${input.issueIdentifier}: issue entered a terminal state.`
        : `Dispatch cancelled for ${input.issueIdentifier}: issue became ineligible.`
    );
    this.name = "SymphonyDispatchCancelledError";
    this.reason = input.reason;
    this.issueIdentifier = input.issueIdentifier;
  }
}

export function isSymphonyDispatchRefusedError(
  error: unknown
): error is SymphonyDispatchRefusedError {
  return error instanceof SymphonyDispatchRefusedError;
}

export function isSymphonyDispatchCancelledError(
  error: unknown
): error is SymphonyDispatchCancelledError {
  return error instanceof SymphonyDispatchCancelledError;
}
