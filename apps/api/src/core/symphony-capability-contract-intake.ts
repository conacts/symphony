import type {
  RouteWorkflowExecutionContractRecord
} from "@symphony/db";
import {
  createSymphonyCapabilityPreset,
  createSymphonyTicketExecutionContract,
  parseSymphonyCapabilityEvidenceId,
  parseSymphonyCapabilityId,
  parseSymphonyCapabilityModelProfileId,
  symphonyCapabilityClarificationModeSchema,
  symphonyCapabilityCompletionModeSchema,
  symphonyCapabilityMergePolicySchema,
  symphonyCapabilityReviewStrictnessSchema,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId
} from "@symphony/router";
import type {
  SymphonyTrackerIssue
} from "@symphony/tracker";
import { normalizeWorkflowToken } from "./runtime-route-workflow-command-utils.js";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";

export type SymphonyCapabilityContractIntake = {
  createAndPersistForWorkflow(input: {
    workflowId: string;
    issue: Pick<SymphonyTrackerIssue, "identifier" | "title" | "description">;
    repositoryKey: string;
    recordedAt: string;
    policyId?: SymphonyCapabilityPresetPolicyId;
  }): Promise<
    RouteWorkflowExecutionContractRecord<
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    >
  >;
  loadByWorkflowId(workflowId: string): Promise<
    RouteWorkflowExecutionContractRecord<
      SymphonyCapabilityId,
      SymphonyCapabilityEvidenceId,
      SymphonyCapabilityModelProfileId
    > | null
  >;
};

export class SymphonyCapabilityContractIntakeValidationError extends TypeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SymphonyCapabilityContractIntakeValidationError";
  }
}

export function isSymphonyCapabilityContractIntakeValidationError(
  error: unknown
): error is SymphonyCapabilityContractIntakeValidationError {
  return error instanceof SymphonyCapabilityContractIntakeValidationError;
}

export function createSymphonyCapabilityContractIntake(input: {
  routeWorkflows: SymphonyRouteWorkflowPort;
}): SymphonyCapabilityContractIntake {
  return {
    async createAndPersistForWorkflow(intakeInput) {
      const workflowId = requireNonEmptyText(intakeInput.workflowId, "workflowId");
      const repositoryKey = requireNonEmptyText(
        intakeInput.repositoryKey,
        "repositoryKey"
      );
      const issueIdentifier = requireNonEmptyText(
        intakeInput.issue.identifier,
        "issue.identifier"
      );
      const summary = requireNonEmptyText(intakeInput.issue.title, "issue.title");
      const recordedAt = requireNonEmptyText(intakeInput.recordedAt, "recordedAt");
      const preset = createSymphonyCapabilityPreset({
        policyId: intakeInput.policyId ?? "default"
      });
      const sections = parseMarkdownSections(intakeInput.issue.description);
      const existingContract =
        await input.routeWorkflows.loadExecutionContractByWorkflowId<
          SymphonyCapabilityId,
          SymphonyCapabilityEvidenceId,
          SymphonyCapabilityModelProfileId
        >(workflowId);
      const contract = buildExecutionContract({
        workflowId,
        issueIdentifier,
        repositoryKey,
        summary,
        recordedAt,
        existingContractId: existingContract?.contractId ?? null,
        existingCreatedAt: existingContract?.createdAt ?? null,
        preset,
        sections
      });

      return await input.routeWorkflows.saveExecutionContract({
        workflowId,
        contract,
        recordedAt
      });
    },
    async loadByWorkflowId(workflowId) {
      return await input.routeWorkflows.loadExecutionContractByWorkflowId<
        SymphonyCapabilityId,
        SymphonyCapabilityEvidenceId,
        SymphonyCapabilityModelProfileId
      >(workflowId);
    }
  };
}

function buildContractId(workflowId: string): string {
  return `contract_${normalizeWorkflowToken(workflowId)}`;
}

function buildExecutionContract(input: {
  workflowId: string;
  issueIdentifier: string;
  repositoryKey: string;
  summary: string;
  recordedAt: string;
  existingContractId: string | null;
  existingCreatedAt: string | null;
  preset: ReturnType<typeof createSymphonyCapabilityPreset>;
  sections: Map<string, string>;
}) {
  try {
    const objective = requireSection(input.sections, "objective", "objective");
    const doneDefinition = requireSection(
      input.sections,
      "done definition",
      "done definition"
    );
    const mergePolicy = parseMergePolicy(
      requireSection(input.sections, "merge policy", "merge policy")
    );

    return createSymphonyTicketExecutionContract({
      contractId: input.existingContractId ?? buildContractId(input.workflowId),
      workflowId: input.workflowId,
      issueIdentifier: input.issueIdentifier,
      repositoryKey: input.repositoryKey,
      summary: input.summary,
      objective,
      doneDefinition,
      mergePolicy,
      routingDirectives: {
        requiredCapabilityIds: parseCapabilityIdListSection(
          input.sections,
          "required capabilities",
          input.preset.defaultPolicy.requiredCapabilityIds
        ),
        preferredCapabilityIds: parseCapabilityIdListSection(
          input.sections,
          "preferred capabilities",
          input.preset.defaultPolicy.preferredCapabilityIds
        ),
        forbiddenCapabilityIds: parseCapabilityIdListSection(
          input.sections,
          "forbidden capabilities",
          input.preset.defaultPolicy.forbiddenCapabilityIds
        ),
        requiredEvidenceIds: parseEvidenceIdListSection(
          input.sections,
          "required evidence",
          input.preset.defaultPolicy.requiredEvidenceIds
        ),
        allowedModelProfileIds: parseModelProfileIdListSection(
          input.sections,
          "allowed model profiles",
          input.preset.defaultPolicy.allowedModelProfileIds
        ),
        completionPolicy: {
          mode: parseCompletionModeSection(
            input.sections,
            "completion mode",
            input.preset.defaultPolicy.completionPolicy.mode
          )
        },
        clarificationPolicy: {
          mode: parseClarificationModeSection(
            input.sections,
            "clarification mode",
            input.preset.defaultPolicy.clarificationPolicy.mode
          )
        },
        reviewStrictness: parseReviewStrictnessSection(
          input.sections,
          "review strictness",
          input.preset.defaultPolicy.reviewStrictness
        ),
        maxRetryCount: parseMaxRetryCountSection(
          input.sections,
          "max retry count",
          input.preset.defaultPolicy.maxRetryCount
        )
      },
      createdAt: input.existingCreatedAt ?? input.recordedAt,
      updatedAt: input.recordedAt
    });
  } catch (error) {
    throw new SymphonyCapabilityContractIntakeValidationError(
      error instanceof Error ? error.message : String(error),
      {
        cause: error
      }
    );
  }
}

function requireSection(
  sections: Map<string, string>,
  sectionName: string,
  fieldLabel: string
): string {
  const value = sections.get(sectionName) ?? null;
  return requireNonEmptyText(value, fieldLabel);
}

function parseCapabilityIdListSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValues: SymphonyCapabilityId[]
): SymphonyCapabilityId[] {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return [...defaultValues];
  }

  return parseListBody(body).map((token) =>
    parseSymphonyCapabilityId(normalizeDirectiveToken(token))
  );
}

function parseEvidenceIdListSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValues: SymphonyCapabilityEvidenceId[]
): SymphonyCapabilityEvidenceId[] {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return [...defaultValues];
  }

  return parseListBody(body).map((token) =>
    parseSymphonyCapabilityEvidenceId(normalizeDirectiveToken(token))
  );
}

function parseModelProfileIdListSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValues: SymphonyCapabilityModelProfileId[]
): SymphonyCapabilityModelProfileId[] {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return [...defaultValues];
  }

  return parseListBody(body).map((token) =>
    parseSymphonyCapabilityModelProfileId(normalizeDirectiveToken(token))
  );
}

function parseMergePolicy(value: string) {
  return parseSchemaValue(
    symphonyCapabilityMergePolicySchema,
    value,
    "merge policy"
  );
}

function parseCompletionModeSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValue:
    | "manual"
    | "auto"
) {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return defaultValue;
  }

  return parseSchemaValue(
    symphonyCapabilityCompletionModeSchema,
    body,
    "completion mode"
  );
}

function parseClarificationModeSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValue:
    | "required"
    | "best_effort"
) {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return defaultValue;
  }

  return parseSchemaValue(
    symphonyCapabilityClarificationModeSchema,
    body,
    "clarification mode"
  );
}

function parseReviewStrictnessSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValue:
    | "standard"
    | "strict"
    | "adversarial"
) {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return defaultValue;
  }

  return parseSchemaValue(
    symphonyCapabilityReviewStrictnessSchema,
    body,
    "review strictness"
  );
}

function parseMaxRetryCountSection(
  sections: Map<string, string>,
  sectionName: string,
  defaultValue: number
): number {
  const body = sections.get(sectionName);
  if (body === undefined) {
    return defaultValue;
  }

  const normalized = requireNonEmptyText(body, "max retry count");
  if (!/^(0|[1-9]\d*)$/.test(normalized)) {
    throw new TypeError(
      `Invalid max retry count ${JSON.stringify(normalized)}. Expected a non-negative integer.`
    );
  }

  return Number(normalized);
}

function parseSchemaValue<Output>(
  schema: { parse(value: unknown): Output },
  rawValue: string,
  fieldLabel: string
): Output {
  const normalized = normalizeDirectiveToken(
    requireNonEmptyText(rawValue, fieldLabel)
  );

  try {
    return schema.parse(normalized);
  } catch (error) {
    throw new TypeError(
      `Invalid ${fieldLabel} ${JSON.stringify(rawValue.trim())}.`,
      {
        cause: error
      }
    );
  }
}

function parseListBody(body: string): string[] {
  if (body.trim().length === 0) {
    return [];
  }

  return body
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((token) => token.replace(/^[*-]\s*/, "").trim())
    .filter((token) => token.length > 0);
}

function parseMarkdownSections(markdown: string | null): Map<string, string> {
  const sections = new Map<string, string>();
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return sections;
  }

  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let activeSectionName: string | null = null;
  let activeSectionLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      flushSection(sections, activeSectionName, activeSectionLines);
      activeSectionName = normalizeSectionName(headingMatch[1] ?? "");
      activeSectionLines = [];
      continue;
    }

    if (activeSectionName !== null) {
      activeSectionLines.push(line);
    }
  }

  flushSection(sections, activeSectionName, activeSectionLines);
  return sections;
}

function flushSection(
  sections: Map<string, string>,
  sectionName: string | null,
  lines: string[]
): void {
  if (sectionName === null) {
    return;
  }

  sections.set(sectionName, trimSectionBody(lines.join("\n")));
}

function trimSectionBody(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function normalizeSectionName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeDirectiveToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function requireNonEmptyText(value: string | null | undefined, fieldLabel: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldLabel} is required.`);
  }

  return value.trim();
}
