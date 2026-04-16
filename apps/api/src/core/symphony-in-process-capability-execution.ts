import type {
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId,
  SymphonyWorkflowCapabilityExecutionCommand,
  SymphonyWorkflowTicketExecutionContract,
  WorkflowCapabilityExecutionEngine
} from "@symphony/router";

type SymphonyCapabilityExecutionAttemptContext = {
  workEpoch: number;
  attempt: number;
};

export function createSymphonyInProcessCapabilityExecutionEngine(): WorkflowCapabilityExecutionEngine<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
  return {
    async execute(command) {
      const context = readExecutionAttemptContext(command);

      switch (command.payload.capabilityId) {
        case "implement.spec":
          return {
            kind: "completed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: context.workEpoch,
            attempt: context.attempt,
            summary: "Completed implement.spec in-process.",
            evidenceProduced: [
              {
                evidenceId: "change_set",
                summary: "Produced the implementation change set.",
                artifacts: []
              }
            ]
          };
        case "critic.code_review":
          return {
            kind: "completed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: context.workEpoch,
            attempt: context.attempt,
            summary: "Completed critic.code_review in-process.",
            evidenceProduced: [
              {
                evidenceId: "code_review_report",
                summary: "Produced the code review report.",
                artifacts: []
              }
            ]
          };
        case "critic.adversarial_tests":
          return {
            kind: "completed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: context.workEpoch,
            attempt: context.attempt,
            summary: "Completed critic.adversarial_tests in-process.",
            evidenceProduced: [
              {
                evidenceId: "adversarial_test_report",
                summary: "Produced the adversarial test report.",
                artifacts: []
              }
            ]
          };
      }

      throw new TypeError(
        `In-process capability execution does not support ${JSON.stringify(command.payload.capabilityId)}.`
      );
    }
  };
}

function readExecutionAttemptContext(
  command: SymphonyWorkflowCapabilityExecutionCommand
): SymphonyCapabilityExecutionAttemptContext {
  const executionInput = command.payload.executionInput;
  if (!executionInput || typeof executionInput !== "object") {
    throw new TypeError(
      `Capability execution command ${command.id} requires executionInput context.`
    );
  }

  return {
    workEpoch: readIntegerExecutionField({
      executionInput,
      field: "workEpoch",
      commandId: command.id,
      predicate: (value) => value >= 0,
      requirement: "a non-negative integer"
    }),
    attempt: readIntegerExecutionField({
      executionInput,
      field: "attempt",
      commandId: command.id,
      predicate: (value) => value > 0,
      requirement: "a positive integer"
    })
  };
}

function readIntegerExecutionField(input: {
  executionInput: Record<string, unknown>;
  field: "workEpoch" | "attempt";
  commandId: string;
  predicate(value: number): boolean;
  requirement: string;
}) {
  const value = input.executionInput[input.field];
  if (typeof value !== "number" || !Number.isInteger(value) || !input.predicate(value)) {
    throw new TypeError(
      `Capability execution command ${input.commandId} requires executionInput.${input.field} to be ${input.requirement}.`
    );
  }

  return value;
}
