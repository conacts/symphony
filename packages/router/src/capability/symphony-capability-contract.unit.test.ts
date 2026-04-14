import { describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityCompletedSignal,
  createSymphonyCapabilityExecutionCommand,
  createSymphonyCapabilityFailedSignal,
  createSymphonyTicketExecutionContract,
  createSymphonyWorkflowClarificationRequestedSignal,
  parseSymphonyCapabilityEvidenceId,
  parseSymphonyCapabilityId,
  parseSymphonyCapabilityModelProfileId,
  parseSymphonyCapabilityPhase,
  readSymphonyCapabilityCompletedSignal,
  readSymphonyCapabilityExecutionCommand,
  readSymphonyCapabilityFailedSignal,
  readSymphonyCapabilityStartedSignal,
  readSymphonyTicketExecutionContract
} from "./symphony-capability-contract.js";

describe("Symphony capability contract", () => {
  it("builds and reads strict ticket execution contracts", () => {
    const contract = createSymphonyTicketExecutionContract({
      contractId: "contract_sym_500",
      workflowId: "workflow_sym_500",
      issueIdentifier: "SYM-500",
      repositoryKey: "symphony",
      summary: "Implement the first capability-router slice.",
      objective: "Add additive capability types without changing live routing.",
      doneDefinition:
        "The router package exports strict capability-layer types and validation helpers.",
      mergePolicy: "manual",
      routingDirectives: {
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        preferredCapabilityIds: ["critic.adversarial_tests"],
        forbiddenCapabilityIds: ["critic.browser_test"],
        requiredEvidenceIds: ["change_set", "code_review_report"],
        allowedModelProfileIds: ["builder_fast", "critic_strict"],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2
      },
      createdAt: "2026-04-12T18:00:00.000Z",
      updatedAt: "2026-04-12T18:00:00.000Z"
    });

    expect(readSymphonyTicketExecutionContract(contract)).toEqual(contract);
  });

  it("builds and reads strict capability execute commands", () => {
    const contract = createSymphonyTicketExecutionContract({
      contractId: "contract_sym_501",
      workflowId: "workflow_sym_501",
      issueIdentifier: "SYM-501",
      repositoryKey: "symphony",
      summary: "Run the implementation capability.",
      objective: "Dispatch the first planner-selected capability command.",
      doneDefinition: "One strict capability.execute command shape exists.",
      mergePolicy: "manual",
      routingDirectives: {
        requiredCapabilityIds: ["implement.spec"],
        preferredCapabilityIds: [],
        forbiddenCapabilityIds: [],
        requiredEvidenceIds: ["change_set"],
        allowedModelProfileIds: ["builder_fast"],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "standard",
        maxRetryCount: 1
      },
      createdAt: "2026-04-12T18:05:00.000Z",
      updatedAt: "2026-04-12T18:05:00.000Z"
    });

    const command = createSymphonyCapabilityExecutionCommand({
      id: "command_execute_sym_501",
      dedupeKey: "workflow_sym_501:implement.spec:1",
      workflowId: "workflow_sym_501",
      capabilityId: "implement.spec",
      modelProfileId: "builder_fast",
      contract,
      executionInput: {
        workEpoch: 1
      }
    });

    expect(readSymphonyCapabilityExecutionCommand(command)).toEqual(command);
  });

  it("fails fast when a ticket contract omits a required done definition", () => {
    expect(() =>
      readSymphonyTicketExecutionContract({
        contractId: "contract_invalid",
        workflowId: "workflow_invalid",
        issueIdentifier: "SYM-999",
        repositoryKey: "symphony",
        summary: "Broken contract",
        objective: "Missing done definition",
        mergePolicy: "manual",
        routingDirectives: {
          requiredCapabilityIds: ["implement.spec"],
          preferredCapabilityIds: [],
          forbiddenCapabilityIds: [],
          requiredEvidenceIds: ["change_set"],
          allowedModelProfileIds: ["builder_fast"],
          completionPolicy: {
            mode: "manual"
          },
          clarificationPolicy: {
            mode: "required"
          },
          reviewStrictness: "standard",
          maxRetryCount: 1
        },
        createdAt: "2026-04-12T18:10:00.000Z",
        updatedAt: "2026-04-12T18:10:00.000Z"
      })
    ).toThrow(/Invalid Symphony capability ticket execution contract/);
  });

  it("fails fast when routing directives repeat the same capability id", () => {
    expect(() =>
      createSymphonyTicketExecutionContract({
        contractId: "contract_duplicate_capability",
        workflowId: "workflow_duplicate_capability",
        issueIdentifier: "SYM-998",
        repositoryKey: "symphony",
        summary: "Broken directives",
        objective: "Duplicate capability ids should be rejected.",
        doneDefinition: "The contract parser fails immediately.",
        mergePolicy: "manual",
        routingDirectives: {
          requiredCapabilityIds: ["implement.spec", "implement.spec"],
          preferredCapabilityIds: [],
          forbiddenCapabilityIds: [],
          requiredEvidenceIds: ["change_set"],
          allowedModelProfileIds: ["builder_fast"],
          completionPolicy: {
            mode: "manual"
          },
          clarificationPolicy: {
            mode: "required"
          },
          reviewStrictness: "standard",
          maxRetryCount: 1
        },
        createdAt: "2026-04-12T18:12:00.000Z",
        updatedAt: "2026-04-12T18:12:00.000Z"
      })
    ).toThrow(/Duplicate required capability id: implement\.spec\./);
  });

  it("fails fast when capability.execute omits a required model profile", () => {
    expect(() =>
      readSymphonyCapabilityExecutionCommand({
        id: "command_invalid",
        kind: "capability.execute",
        dedupeKey: null,
        payload: {
          workflowId: "workflow_invalid",
          capabilityId: "implement.spec",
          contract: createSymphonyTicketExecutionContract({
            contractId: "contract_invalid_command",
            workflowId: "workflow_invalid",
            issueIdentifier: "SYM-997",
            repositoryKey: "symphony",
            summary: "Broken command",
            objective: "Missing model profile id",
            doneDefinition: "The command parser fails immediately.",
            mergePolicy: "manual",
            routingDirectives: {
              requiredCapabilityIds: ["implement.spec"],
              preferredCapabilityIds: [],
              forbiddenCapabilityIds: [],
              requiredEvidenceIds: ["change_set"],
              allowedModelProfileIds: ["builder_fast"],
              completionPolicy: {
                mode: "manual"
              },
              clarificationPolicy: {
                mode: "required"
              },
              reviewStrictness: "standard",
              maxRetryCount: 1
            },
            createdAt: "2026-04-12T18:15:00.000Z",
            updatedAt: "2026-04-12T18:15:00.000Z"
          }),
          executionInput: null
        }
      })
    ).toThrow(/Invalid Symphony capability capability\.execute command/);
  });

  it("fails fast when a capability signal omits required identity fields", () => {
    expect(() =>
      readSymphonyCapabilityStartedSignal({
        id: "signal_invalid_started",
        type: "capability.started",
        source: "runtime",
        occurredAt: "2026-04-12T18:16:00.000Z",
        causationId: null,
        correlationId: "exec_invalid",
        payload: {
          workflowId: "workflow_invalid_signal",
          executionId: "exec_invalid",
          capabilityId: "implement.spec",
          workEpoch: 1,
          summary: "Missing model profile and attempt."
        }
      } as never)
    ).toThrow(/Invalid Symphony capability capability\.started signal/);
  });

  it("builds and reads completion signals with evidence records intact", () => {
    const signal = createSymphonyCapabilityCompletedSignal({
      id: "signal_completed_sym_502",
      occurredAt: "2026-04-12T18:20:00.000Z",
      source: "runtime",
      workflowId: "workflow_sym_502",
      executionId: "exec_sym_502",
      capabilityId: "critic.code_review",
      modelProfileId: "critic_strict",
      workEpoch: 1,
      attempt: 1,
      summary: "Completed code review.",
      evidenceProduced: [
        {
          evidenceId: "code_review_report",
          summary: "Structured review report.",
          artifacts: [
            {
              label: "review notes",
              uri: "file:///tmp/review-notes.md"
            }
          ]
        }
      ],
      causationId: null,
      correlationId: "exec_sym_502"
    });

    expect(readSymphonyCapabilityCompletedSignal(signal)?.payload.evidenceProduced).toEqual(
      [
        {
          evidenceId: "code_review_report",
          summary: "Structured review report.",
          artifacts: [
            {
              label: "review notes",
              uri: "file:///tmp/review-notes.md"
            }
          ]
        }
      ]
    );
  });

  it("builds and reads clarification-requested signals with structured questions", () => {
    const signal = createSymphonyWorkflowClarificationRequestedSignal({
      id: "signal_clarification_sym_503",
      occurredAt: "2026-04-12T18:25:00.000Z",
      source: "runtime",
      workflowId: "workflow_sym_503",
      requestId: "clarification_sym_503",
      raisedByCapabilityId: "implement.spec",
      workEpoch: 1,
      summary: "Need the expected API contract.",
      questions: [
        {
          id: "question_1",
          prompt: "What response shape should this route return?",
          context: "Route contract"
        }
      ],
      causationId: null,
      correlationId: "clarification_sym_503"
    });

    expect(signal.payload.questions).toEqual([
      {
        id: "question_1",
        prompt: "What response shape should this route return?",
        context: "Route contract"
      }
    ]);
  });

  it("builds and reads retryable failure signals without losing the work epoch", () => {
    const signal = createSymphonyCapabilityFailedSignal({
      id: "signal_failed_sym_504",
      occurredAt: "2026-04-12T18:30:00.000Z",
      source: "runtime",
      workflowId: "workflow_sym_504",
      executionId: "exec_sym_504",
      capabilityId: "critic.adversarial_tests",
      modelProfileId: "critic_adversarial",
      workEpoch: 2,
      attempt: 1,
      summary: "Adversarial tests hit a transient environment issue.",
      retryable: true,
      reasonCode: "transient_environment",
      failureKind: "transient",
      causationId: null,
      correlationId: "exec_sym_504"
    });

    expect(readSymphonyCapabilityFailedSignal(signal)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          workEpoch: 2,
          retryable: true,
          reasonCode: "transient_environment"
        })
      })
    );
  });

  it("parses the frozen Symphony capability vocabulary", () => {
    expect(parseSymphonyCapabilityPhase("verifying")).toBe("verifying");
    expect(parseSymphonyCapabilityId("critic.adversarial_tests")).toBe(
      "critic.adversarial_tests"
    );
    expect(parseSymphonyCapabilityEvidenceId("code_review_report")).toBe(
      "code_review_report"
    );
    expect(parseSymphonyCapabilityModelProfileId("critic_strict")).toBe(
      "critic_strict"
    );
  });
});
