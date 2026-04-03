export class SymphonyWorkflowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SymphonyWorkflowError";
    this.code = code;
  }
}
