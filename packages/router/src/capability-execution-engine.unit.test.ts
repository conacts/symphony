import { describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityExecutionCommand,
  createSymphonyTicketExecutionContract
} from "./symphony-capability-contract.js";
import { executeWorkflowCapabilityCommand } from "./capability-execution-engine.js";
import type {
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityId,
  SymphonyCapabilityModelProfileId,
  SymphonyWorkflowCapabilityExecutionCommand,
  SymphonyWorkflowTicketExecutionContract,
  WorkflowCapabilityExecutionEngine,
  WorkflowCapabilityExecutionResult
} from "./index.js";

describe("capability execution engine", () => {
  it("typechecks the capability execution engine contract against capability.execute commands", async () => {
    const command = createCommand({
      workflowId: "workflow_engine_typecheck",
      capabilityId: "implement.spec",
      modelProfileId: "builder_fast",
      executionInput: {
        outcome: "completed"
      }
    });
    const engine: WorkflowCapabilityExecutionEngine<
      SymphonyWorkflowTicketExecutionContract,
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    > = {
      async execute(currentCommand) {
        return {
          kind: "completed",
          executionId: currentCommand.id,
          capabilityId: currentCommand.payload.capabilityId,
          modelProfileId: currentCommand.payload.modelProfileId,
          workEpoch: 1,
          attempt: 1,
          summary: "Completed the capability.",
          evidenceProduced: [
            {
              evidenceId: "change_set",
              summary: "Implementation diff.",
              artifacts: []
            }
          ]
        };
      }
    };
    const expectedResult = {
      kind: "completed",
      executionId: command.id,
      capabilityId: "implement.spec",
      modelProfileId: "builder_fast",
      workEpoch: 1,
      attempt: 1,
      summary: "Completed the capability.",
      evidenceProduced: [
        {
          evidenceId: "change_set",
          summary: "Implementation diff.",
          artifacts: []
        }
      ]
    } satisfies WorkflowCapabilityExecutionResult<
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    >;

    await expect(
      executeWorkflowCapabilityCommand({
        engine,
        command
      })
    ).resolves.toEqual(expectedResult);
  });

  it("supports a fake engine that returns every execution result variant, keeping browser execution stubbed", async () => {
    const engine = createFakeEngine();

    const completed = await executeWorkflowCapabilityCommand({
      engine,
      command: createCommand({
        workflowId: "workflow_engine_completed",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        executionInput: {
          outcome: "completed"
        }
      })
    });
    expect(completed).toEqual({
      kind: "completed",
      executionId: "command_workflow_engine_completed_implement_spec",
      capabilityId: "implement.spec",
      modelProfileId: "builder_fast",
      workEpoch: 1,
      attempt: 1,
      summary: "Completed implement.spec.",
      evidenceProduced: [
        {
          evidenceId: "change_set",
          summary: "Produced the implementation change set.",
          artifacts: []
        }
      ]
    });

    const changesRequested = await executeWorkflowCapabilityCommand({
      engine,
      command: createCommand({
        workflowId: "workflow_engine_changes",
        capabilityId: "critic.code_review",
        modelProfileId: "critic_strict",
        executionInput: {
          outcome: "changes_requested"
        }
      })
    });
    expect(changesRequested).toEqual({
      kind: "changes_requested",
      executionId: "command_workflow_engine_changes_critic_code_review",
      capabilityId: "critic.code_review",
      modelProfileId: "critic_strict",
      workEpoch: 1,
      attempt: 1,
      summary: "Requested follow-up changes.",
      findings: ["Address the review finding."]
    });

    const clarificationRequested = await executeWorkflowCapabilityCommand({
      engine,
      command: createCommand({
        workflowId: "workflow_engine_clarify",
        capabilityId: "implement.spec",
        modelProfileId: "builder_deep",
        executionInput: {
          outcome: "clarification_requested"
        }
      })
    });
    expect(clarificationRequested).toEqual({
      kind: "clarification_requested",
      executionId: "command_workflow_engine_clarify_implement_spec",
      capabilityId: "implement.spec",
      clarification: {
        requestId: "clarify_command_workflow_engine_clarify_implement_spec",
        raisedByCapabilityId: "implement.spec",
        workEpoch: 1,
        summary: "Need clarification before continuing.",
        questions: [
          {
            id: "question_1",
            prompt: "What output shape should the route return?",
            context: null
          }
        ]
      }
    });

    const failed = await executeWorkflowCapabilityCommand({
      engine,
      command: createCommand({
        workflowId: "workflow_engine_failed",
        capabilityId: "critic.adversarial_tests",
        modelProfileId: "critic_adversarial",
        executionInput: {
          outcome: "failed"
        }
      })
    });
    expect(failed).toEqual({
      kind: "failed",
      executionId: "command_workflow_engine_failed_critic_adversarial_tests",
      capabilityId: "critic.adversarial_tests",
      modelProfileId: "critic_adversarial",
      workEpoch: 1,
      attempt: 1,
      summary: "Execution failed transiently.",
      retryable: true,
      reasonCode: "transient_failure",
      failureKind: "transient"
    });

    const blocked = await executeWorkflowCapabilityCommand({
      engine,
      command: createCommand({
        workflowId: "workflow_engine_blocked",
        capabilityId: "critic.browser_test",
        modelProfileId: "critic_browser",
        executionInput: {
          outcome: "blocked"
        }
      })
    });
    expect(blocked).toEqual({
      kind: "blocked",
      executionId: "command_workflow_engine_blocked_critic_browser_test",
      capabilityId: "critic.browser_test",
      modelProfileId: "critic_browser",
      workEpoch: 1,
      attempt: 1,
      summary: "Browser capability remains stubbed.",
      reasonCode: "stubbed_capability"
    });
  });
});

function createFakeEngine(): WorkflowCapabilityExecutionEngine<
  SymphonyWorkflowTicketExecutionContract,
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
> {
  return {
    async execute(command) {
      const outcome = readOutcome(command);
      switch (outcome) {
        case "completed":
          return {
            kind: "completed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: 1,
            attempt: 1,
            summary: `Completed ${command.payload.capabilityId}.`,
            evidenceProduced: [
              {
                evidenceId: mapEvidenceId(command.payload.capabilityId),
                summary:
                  command.payload.capabilityId === "implement.spec"
                    ? "Produced the implementation change set."
                    : "Produced verifier evidence.",
                artifacts: []
              }
            ]
          };
        case "changes_requested":
          return {
            kind: "changes_requested",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: 1,
            attempt: 1,
            summary: "Requested follow-up changes.",
            findings: ["Address the review finding."]
          };
        case "clarification_requested":
          return {
            kind: "clarification_requested",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            clarification: {
              requestId: `clarify_${command.id}`,
              raisedByCapabilityId: command.payload.capabilityId,
              workEpoch: 1,
              summary: "Need clarification before continuing.",
              questions: [
                {
                  id: "question_1",
                  prompt: "What output shape should the route return?",
                  context: null
                }
              ]
            }
          };
        case "failed":
          return {
            kind: "failed",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: 1,
            attempt: 1,
            summary: "Execution failed transiently.",
            retryable: true,
            reasonCode: "transient_failure",
            failureKind: "transient"
          };
        case "blocked":
          return {
            kind: "blocked",
            executionId: command.id,
            capabilityId: command.payload.capabilityId,
            modelProfileId: command.payload.modelProfileId,
            workEpoch: 1,
            attempt: 1,
            summary: "Browser capability remains stubbed.",
            reasonCode: "stubbed_capability"
          };
      }
    }
  };
}

function createCommand(input: {
  workflowId: string;
  capabilityId: SymphonyCapabilityId;
  modelProfileId: SymphonyCapabilityModelProfileId;
  executionInput: {
    outcome:
      | "completed"
      | "changes_requested"
      | "clarification_requested"
      | "failed"
      | "blocked";
  };
}): SymphonyWorkflowCapabilityExecutionCommand {
  const contract = createSymphonyTicketExecutionContract({
    contractId: `contract_${input.workflowId}`,
    workflowId: input.workflowId,
    issueIdentifier: "SYM-1000",
    repositoryKey: "symphony",
    summary: "Execute a capability command through the engine seam.",
    objective: "Prove the execution engine contract.",
    doneDefinition: "Engine accepts capability.execute and returns a typed result.",
    mergePolicy: "manual",
    routingDirectives: {
      requiredCapabilityIds: [],
      preferredCapabilityIds: [],
      forbiddenCapabilityIds: [],
      requiredEvidenceIds: [],
      allowedModelProfileIds: [
        "builder_fast",
        "builder_deep",
        "critic_strict",
        "critic_adversarial",
        "critic_browser"
      ],
      completionPolicy: {
        mode: "manual"
      },
      clarificationPolicy: {
        mode: "required"
      },
      reviewStrictness: "standard",
      maxRetryCount: 1
    },
    createdAt: "2026-04-12T23:45:00.000Z",
    updatedAt: "2026-04-12T23:45:00.000Z"
  });

  return createSymphonyCapabilityExecutionCommand({
    id: `command_${normalizeCommandToken(input.workflowId)}_${normalizeCommandToken(input.capabilityId)}`,
    dedupeKey: `${input.workflowId}:${input.capabilityId}:1`,
    workflowId: input.workflowId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId,
    contract,
    executionInput: input.executionInput
  });
}

function readOutcome(command: SymphonyWorkflowCapabilityExecutionCommand) {
  const outcome = command.payload.executionInput?.outcome;
  if (
    outcome !== "completed" &&
    outcome !== "changes_requested" &&
    outcome !== "clarification_requested" &&
    outcome !== "failed" &&
    outcome !== "blocked"
  ) {
    throw new TypeError(
      `Fake capability execution engine requires a known outcome for ${command.id}.`
    );
  }

  return outcome;
}

function mapEvidenceId(
  capabilityId: SymphonyCapabilityId
): SymphonyCapabilityEvidenceId {
  switch (capabilityId) {
    case "implement.spec":
      return "change_set";
    case "critic.code_review":
      return "code_review_report";
    case "critic.adversarial_tests":
      return "adversarial_test_report";
    case "critic.browser_test":
      return "browser_test_report";
  }
}

function normalizeCommandToken(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9]+/g, "_").replaceAll(/^_+|_+$/g, "");
}
