import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  createSymphonyIntelligentFlowRouterAsync
} from "@symphony/router";
import {
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { normalizeWorkflowToken } from "./runtime-route-workflow-command-utils.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import {
  createSymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("Symphony capability contract intake", () => {
  it("derives the objective from the issue title when the objective section is missing", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        description: createDescription({
          objective: null
        })
      })
    });

    try {
      const assessment = await harness.intake.assessForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:09:59.000Z"
      });
      const saved = await harness.intake.createAndPersistForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:10:00.000Z"
      });

      expect(assessment).toEqual(
        expect.objectContaining({
          decision: "ready",
          reasons: expect.arrayContaining([
            expect.objectContaining({
              code: "missing_objective"
            })
          ])
        })
      );
      expect(saved.objective).toBe(harness.issue.title);
      expect(saved.doneDefinition).toBe(
        "The API persists a strict execution contract with explicit routing directives."
      );
    } finally {
      harness.close();
    }
  });

  it("derives the done definition from a freeform ticket body when structured sections are missing", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        title: "Render workflow progress for recently bootstrapped issues",
        description:
          "Make the issue detail page show the latest router step and the most recent execution narrative so operators can understand active work without digging through raw logs."
      })
    });

    try {
      const assessment = await harness.intake.assessForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:10:59.000Z"
      });
      const saved = await harness.intake.createAndPersistForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:11:00.000Z"
      });

      expect(assessment).toEqual(
        expect.objectContaining({
          decision: "ready",
          reasons: expect.arrayContaining([
            expect.objectContaining({
              code: "missing_done_definition"
            })
          ])
        })
      );
      expect(saved.objective).toBe(harness.issue.title);
      expect(saved.doneDefinition).toBe(harness.issue.description);
    } finally {
      harness.close();
    }
  });

  it("derives a ready contract from alternate freeform headings instead of requiring objective and done-definition headers", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        description: [
          "## Desired Outcome",
          "Render workflow progress so operators can understand the live router step.",
          "",
          "## Acceptance Criteria",
          "- The issue detail page shows the latest router step.",
          "- The page shows the latest execution narrative."
        ].join("\n")
      })
    });

    try {
      const assessment = await harness.intake.assessForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:11:30.000Z"
      });

      expect(assessment).toEqual(
        expect.objectContaining({
          decision: "ready",
          contract: expect.objectContaining({
            objective:
              "Render workflow progress so operators can understand the live router step.",
            doneDefinition: [
              "- The issue detail page shows the latest router step.",
              "- The page shows the latest execution narrative."
            ].join("\n")
          })
        })
      );
    } finally {
      harness.close();
    }
  });

  it("classifies tickets without completion criteria as needs_clarification instead of persisting a weak contract", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        title: "Render workflow progress",
        description: ""
      })
    });

    try {
      const assessment = await harness.intake.assessForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:11:45.000Z"
      });

      expect(assessment).toEqual({
        decision: "needs_clarification",
        reasons: [
          {
            code: "missing_objective",
            message:
              "The ticket does not include an explicit objective section. Symphony derived the objective from the issue title.",
            severity: "warning",
            field: "objective"
          },
          {
            code: "missing_done_definition",
            message:
              "The ticket does not describe what concrete outcome should count as done.",
            severity: "warning",
            field: "doneDefinition"
          }
        ],
        clarificationRequest: {
          summary:
            "Symphony needs the completion criteria for this ticket before execution can begin.",
          questions: [
            {
              id: "done_definition",
              prompt:
                "What concrete outcome should count as done for this ticket?",
              context: "Render workflow progress"
            }
          ]
        }
      });

      await expect(
        harness.intake.createAndPersistForWorkflow({
          workflowId: harness.workflowId,
          issue: harness.issue,
          repositoryKey: "openai/symphony",
          recordedAt: "2026-04-13T06:11:46.000Z"
        })
      ).rejects.toThrow(/what concrete outcome should count as done/i);
    } finally {
      harness.close();
    }
  });

  it("rejects missing repository context", async () => {
    const harness = await createHarness();

    try {
      await expect(
        harness.intake.createAndPersistForWorkflow({
          workflowId: harness.workflowId,
          issue: harness.issue,
          repositoryKey: "   ",
          recordedAt: "2026-04-13T06:12:00.000Z"
        })
      ).rejects.toThrow(/repositoryKey is required/i);
    } finally {
      harness.close();
    }
  });

  it("rejects malformed max retry count sections", async () => {
    for (const maxRetryCount of ["1.5", "2abc"]) {
      const harness = await createHarness({
        issue: buildIssue({
          description: createDescription({
            maxRetryCount
          })
        })
      });

      try {
        const assessment = await harness.intake.assessForWorkflow({
          workflowId: harness.workflowId,
          issue: harness.issue,
          repositoryKey: "openai/symphony",
          recordedAt: "2026-04-13T06:13:29.000Z"
        });

        expect(assessment).toEqual({
          decision: "invalid_directive",
          reasons: [
            expect.objectContaining({
              code: "invalid_max_retry_count",
              field: "routingDirectives.maxRetryCount"
            })
          ]
        });
        await expect(
          harness.intake.createAndPersistForWorkflow({
            workflowId: harness.workflowId,
            issue: harness.issue,
            repositoryKey: "openai/symphony",
            recordedAt: "2026-04-13T06:13:30.000Z"
          })
        ).rejects.toThrow(/invalid max retry count/i);
      } finally {
        harness.close();
      }
    }
  });

  it("persists a valid canonical execution contract", async () => {
    const harness = await createHarness();

    try {
      const saved = await harness.intake.createAndPersistForWorkflow({
        workflowId: harness.workflowId,
        issue: harness.issue,
        repositoryKey: "openai/symphony",
        recordedAt: "2026-04-13T06:14:00.000Z"
      });

      const loaded = await harness.intake.loadByWorkflowId(harness.workflowId);

      expect(saved).toEqual({
        contractId: `contract_${normalizeWorkflowToken(harness.workflowId)}`,
        workflowId: harness.workflowId,
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        summary: harness.issue.title,
        objective: "Ship the first durable capability contract boundary in the API.",
        doneDefinition:
          "The API persists a strict execution contract with explicit routing directives.",
        routingDirectives: {
          requiredCapabilityIds: ["implement.spec", "critic.code_review"],
          preferredCapabilityIds: [],
          forbiddenCapabilityIds: ["critic.browser_test"],
          requiredEvidenceIds: ["change_set", "code_review_report"],
          allowedModelProfileIds: [
            "builder_fast",
            "builder_deep",
            "critic_strict",
            "critic_adversarial"
          ],
          clarificationPolicy: {
            mode: "required"
          },
          reviewStrictness: "strict",
          maxRetryCount: 2
        },
        createdAt: "2026-04-13T06:14:00.000Z",
        updatedAt: "2026-04-13T06:14:00.000Z",
        insertedAt: "2026-04-13T06:14:00.000Z"
      });
      expect(loaded).toEqual(saved);
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  issue?: ReturnType<typeof buildIssue>;
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-capability-contract-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const issue = input.issue ?? buildIssue();

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T06:05:00.000Z"
  });

  const ensured = await routeWorkflows.ensureWorkflowForIssue({
    trackerIssueId: issue.id,
    issueIdentifier: issue.identifier,
    repositoryKey: "openai/symphony",
    routerPresetId: "intelligent-flow",
    router: await createSymphonyIntelligentFlowRouterAsync(),
    createdAt: "2026-04-13T06:06:00.000Z"
  });

  return {
    database,
    issue,
    workflowId: ensured.workflow.workflowId,
    routeWorkflows,
    intake: createSymphonyCapabilityContractIntake({
      routeWorkflows
    }),
    close() {
      database.close();
    }
  };
}

function buildIssue(
  overrides: Partial<ReturnType<typeof buildSymphonyTrackerIssue>> = {}
) {
  return buildSymphonyTrackerIssue({
    id: "issue-capability-123",
    identifier: "SYM-CAP-123",
    title: "Persist the capability execution contract",
    description: createDescription(),
    ...overrides
  });
}

function createDescription(input: {
  objective?: string | null;
  doneDefinition?: string | null;
  maxRetryCount?: string | null;
} = {}) {
  const sections: string[] = [];

  if (input.objective !== null) {
    sections.push("## Objective");
    sections.push(
      input.objective ??
        "Ship the first durable capability contract boundary in the API."
    );
  }

  if (input.doneDefinition !== null) {
    sections.push("## Done Definition");
    sections.push(
      input.doneDefinition ??
        "The API persists a strict execution contract with explicit routing directives."
    );
  }

  if (input.maxRetryCount !== null && input.maxRetryCount !== undefined) {
    sections.push("## Max Retry Count");
    sections.push(input.maxRetryCount);
  }

  return sections.join("\n\n");
}
