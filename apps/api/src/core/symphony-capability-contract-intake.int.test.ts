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
  createSymphonyCurrentFlowRouterAsync
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
  it("rejects missing objective sections", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        description: createDescription({
          objective: null
        })
      })
    });

    try {
      await expect(
        harness.intake.createAndPersistForWorkflow({
          workflowId: harness.workflowId,
          issue: harness.issue,
          repositoryKey: "openai/symphony",
          recordedAt: "2026-04-13T06:10:00.000Z"
        })
      ).rejects.toThrow(/objective is required/i);
      expect(
        await harness.routeWorkflows.loadExecutionContractByWorkflowId(
          harness.workflowId
        )
      ).toBeNull();
    } finally {
      harness.close();
    }
  });

  it("rejects missing done definition sections", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        description: createDescription({
          doneDefinition: null
        })
      })
    });

    try {
      await expect(
        harness.intake.createAndPersistForWorkflow({
          workflowId: harness.workflowId,
          issue: harness.issue,
          repositoryKey: "openai/symphony",
          recordedAt: "2026-04-13T06:11:00.000Z"
        })
      ).rejects.toThrow(/done definition is required/i);
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

  it("rejects missing merge policy sections", async () => {
    const harness = await createHarness({
      issue: buildIssue({
        description: createDescription({
          mergePolicy: null
        })
      })
    });

    try {
      await expect(
        harness.intake.createAndPersistForWorkflow({
          workflowId: harness.workflowId,
          issue: harness.issue,
          repositoryKey: "openai/symphony",
          recordedAt: "2026-04-13T06:13:00.000Z"
        })
      ).rejects.toThrow(/merge policy is required/i);
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
        mergePolicy: "manual",
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
          completionPolicy: {
            mode: "manual"
          },
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
    routerPresetId: "current-flow",
    router: await createSymphonyCurrentFlowRouterAsync(),
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
  mergePolicy?: string | null;
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

  if (input.mergePolicy !== null) {
    sections.push("## Merge Policy");
    sections.push(input.mergePolicy ?? "manual");
  }

  if (input.maxRetryCount !== null && input.maxRetryCount !== undefined) {
    sections.push("## Max Retry Count");
    sections.push(input.maxRetryCount);
  }

  return sections.join("\n\n");
}
