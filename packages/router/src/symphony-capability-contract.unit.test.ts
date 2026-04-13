import { describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityExecutionCommand,
  createSymphonyTicketExecutionContract,
  parseSymphonyCapabilityEvidenceId,
  parseSymphonyCapabilityId,
  parseSymphonyCapabilityModelProfileId,
  parseSymphonyCapabilityPhase,
  readSymphonyCapabilityExecutionCommand,
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
