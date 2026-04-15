export type SymphonyPromptCompletionContract = "module_result";

export type SymphonyImplementationModuleOutcome =
  | "completed"
  | "awaiting_input"
  | "blocked";

export type SymphonyImplementationModuleRequestedState =
  | "done"
  | "awaiting_input"
  | "blocked";

export type SymphonyImplementationVerificationStatus =
  | "passed"
  | "failed"
  | "skipped";

export type SymphonyImplementationVerificationRecord = {
  command: string;
  status: SymphonyImplementationVerificationStatus;
  details: string | null;
};

export type SymphonyImplementationModuleEvidence = {
  filesChanged: string[];
  verification: SymphonyImplementationVerificationRecord[];
  notes: string | null;
};

export type SymphonyImplementationModuleResult = {
  schemaVersion: "1";
  moduleId: "implement.spec";
  outcome: SymphonyImplementationModuleOutcome;
  summary: string;
  evidence: SymphonyImplementationModuleEvidence;
  requestedState: SymphonyImplementationModuleRequestedState;
  nextInputPrompt: string | null;
  blockers: string[];
};
