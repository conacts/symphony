export class SymphonyRuntimePolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SymphonyRuntimePolicyError";
    this.code = code;
  }
}

export { SymphonyRuntimePolicyError as SymphonyWorkflowError };
