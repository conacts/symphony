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
import {
  inferSymphonyTicketIntakeReasonFromMessage,
  type SymphonyTicketIntakeClarificationRequest,
  type SymphonyTicketIntakeReason
} from "./symphony-ticket-intake-contract.js";

type SymphonyCapabilityContractIntakeInput = {
  workflowId: string;
  issue: Pick<SymphonyTrackerIssue, "identifier" | "title" | "description">;
  repositoryKey: string;
  recordedAt: string;
  policyId?: SymphonyCapabilityPresetPolicyId;
};

export type SymphonyCapabilityContractIntake = {
  assessForWorkflow(
    input: SymphonyCapabilityContractIntakeInput
  ): Promise<SymphonyCapabilityContractIntakeAssessment>;
  createAndPersistForWorkflow(
    input: SymphonyCapabilityContractIntakeInput
  ): Promise<
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

export type SymphonyCapabilityContractReadyAssessment = {
  decision: "ready";
  reasons: SymphonyTicketIntakeReason[];
  contract: ReturnType<typeof createSymphonyTicketExecutionContract>;
};

export type SymphonyCapabilityContractNeedsClarificationAssessment = {
  decision: "needs_clarification";
  reasons: SymphonyTicketIntakeReason[];
  clarificationRequest: SymphonyTicketIntakeClarificationRequest;
};

export type SymphonyCapabilityContractInvalidDirectiveAssessment = {
  decision: "invalid_directive";
  reasons: SymphonyTicketIntakeReason[];
};

export type SymphonyCapabilityContractIntakeAssessment =
  | SymphonyCapabilityContractReadyAssessment
  | SymphonyCapabilityContractNeedsClarificationAssessment
  | SymphonyCapabilityContractInvalidDirectiveAssessment;

export class SymphonyCapabilityContractIntakeValidationError extends TypeError {
  readonly decision: "needs_clarification" | "invalid_directive";
  readonly reasons: SymphonyTicketIntakeReason[];
  readonly clarificationRequest: SymphonyTicketIntakeClarificationRequest | null;

  constructor(input: {
    message: string;
    decision: "needs_clarification" | "invalid_directive";
    reasons: SymphonyTicketIntakeReason[];
    clarificationRequest?: SymphonyTicketIntakeClarificationRequest | null;
    options?: ErrorOptions;
  }) {
    super(input.message, input.options);
    this.name = "SymphonyCapabilityContractIntakeValidationError";
    this.decision = input.decision;
    this.reasons = input.reasons;
    this.clarificationRequest = input.clarificationRequest ?? null;
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
  async function assessForWorkflow(
    intakeInput: SymphonyCapabilityContractIntakeInput
  ): Promise<SymphonyCapabilityContractIntakeAssessment> {
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
    const contractAssessment = buildExecutionContract({
      workflowId,
      issueIdentifier,
      repositoryKey,
      summary,
      description: intakeInput.issue.description,
      recordedAt,
      existingContractId: existingContract?.contractId ?? null,
      existingCreatedAt: existingContract?.createdAt ?? null,
      preset,
      sections
    });

    return contractAssessment;
  }

  return {
    assessForWorkflow,
    async createAndPersistForWorkflow(intakeInput) {
      const workflowId = requireNonEmptyText(intakeInput.workflowId, "workflowId");
      const recordedAt = requireNonEmptyText(intakeInput.recordedAt, "recordedAt");
      const contractAssessment = await assessForWorkflow(intakeInput);
      if (contractAssessment.decision !== "ready") {
        const message =
          contractAssessment.decision === "needs_clarification"
            ? contractAssessment.clarificationRequest.questions[0]?.prompt ??
              contractAssessment.clarificationRequest.summary
            : contractAssessment.reasons[0]?.message ??
              "Ticket intake could not derive a valid execution contract.";
        throw new SymphonyCapabilityContractIntakeValidationError({
          message,
          decision: contractAssessment.decision,
          reasons: contractAssessment.reasons,
          clarificationRequest:
            contractAssessment.decision === "needs_clarification"
              ? contractAssessment.clarificationRequest
              : null
        });
      }

      return await input.routeWorkflows.saveExecutionContract({
        workflowId,
        contract: contractAssessment.contract,
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
  description: string | null;
  recordedAt: string;
  existingContractId: string | null;
  existingCreatedAt: string | null;
  preset: ReturnType<typeof createSymphonyCapabilityPreset>;
  sections: Map<string, string>;
}): SymphonyCapabilityContractIntakeAssessment {
  const objective = resolveObjective({
    sections: input.sections,
    summary: input.summary
  });
  const doneDefinition = resolveDoneDefinition({
    sections: input.sections,
    summary: input.summary,
    description: input.description
  });
  const reasons = [...objective.reasons, ...doneDefinition.reasons];
  if (doneDefinition.decision === "needs_clarification") {
    return {
      decision: "needs_clarification",
      reasons,
      clarificationRequest: doneDefinition.clarificationRequest
    };
  }

  try {
    return {
      decision: "ready",
      reasons,
      contract: createSymphonyTicketExecutionContract({
        contractId: input.existingContractId ?? buildContractId(input.workflowId),
        workflowId: input.workflowId,
        issueIdentifier: input.issueIdentifier,
        repositoryKey: input.repositoryKey,
        summary: input.summary,
        objective: objective.value,
        doneDefinition: doneDefinition.value,
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
      })
    };
  } catch (error) {
    return {
      decision: "invalid_directive",
      reasons: [inferSymphonyTicketIntakeReason(error)]
    };
  }
}

function readSection(
  sections: Map<string, string>,
  sectionName: string
): string | null {
  return sections.get(sectionName) ?? null;
}

function resolveObjective(input: {
  sections: Map<string, string>;
  summary: string;
}): {
  value: string;
  reasons: SymphonyTicketIntakeReason[];
} {
  const explicitObjective = readFirstNonEmptySection(input.sections, [
    "objective",
    "desired outcome",
    "goal"
  ]);
  if (explicitObjective !== null) {
    return {
      value: explicitObjective,
      reasons: []
    };
  }

  return {
    value: requireNonEmptyText(input.summary, "issue.title"),
    reasons: [
      {
        code: "missing_objective",
        message:
          "The ticket does not include an explicit objective section. Symphony derived the objective from the issue title.",
        severity: "warning",
        field: "objective"
      }
    ]
  };
}

function resolveDoneDefinition(input: {
  sections: Map<string, string>;
  summary: string;
  description: string | null;
}):
  | {
      decision: "ready";
      value: string;
      reasons: SymphonyTicketIntakeReason[];
    }
  | {
      decision: "needs_clarification";
      value: null;
      reasons: SymphonyTicketIntakeReason[];
      clarificationRequest: SymphonyTicketIntakeClarificationRequest;
    } {
  const explicitDoneDefinition = readFirstNonEmptySection(input.sections, [
    "done definition",
    "acceptance criteria",
    "expected output"
  ]);
  if (explicitDoneDefinition !== null) {
    return {
      decision: "ready",
      value: explicitDoneDefinition,
      reasons: []
    };
  }

  const desiredOutcome = readFirstNonEmptySection(input.sections, [
    "desired outcome"
  ]);
  if (desiredOutcome !== null) {
    return {
      decision: "ready",
      value: desiredOutcome,
      reasons: [
        {
          code: "missing_done_definition",
          message:
            "The ticket does not include an explicit done definition section. Symphony derived the completion criteria from the desired outcome.",
          severity: "warning",
          field: "doneDefinition"
        }
      ]
    };
  }

  const derivedFromPreamble = extractMarkdownPreamble(input.description);
  if (derivedFromPreamble !== null) {
    return {
      decision: "ready",
      value: derivedFromPreamble,
      reasons: [
        {
          code: "missing_done_definition",
          message:
            "The ticket does not include an explicit done definition section. Symphony derived the completion criteria from the freeform ticket body.",
          severity: "warning",
          field: "doneDefinition"
        }
      ]
    };
  }

  const reason: SymphonyTicketIntakeReason = {
    code: "missing_done_definition",
    message:
      "The ticket does not describe what concrete outcome should count as done.",
    severity: "warning",
    field: "doneDefinition"
  };
  return {
    decision: "needs_clarification",
    value: null,
    reasons: [reason],
    clarificationRequest: {
      summary:
        "Symphony needs the completion criteria for this ticket before execution can begin.",
      questions: [
        {
          id: "done_definition",
          prompt:
            "What concrete outcome should count as done for this ticket?",
          context: input.summary
        }
      ]
    }
  };
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

function extractMarkdownPreamble(markdown: string | null): string | null {
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return null;
  }

  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const preambleLines: string[] = [];

  for (const line of lines) {
    if (/^#{2,6}\s+.+?$/.test(line)) {
      break;
    }
    preambleLines.push(line);
  }

  const preamble = trimSectionBody(preambleLines.join("\n"));
  return preamble.length > 0 ? preamble : null;
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

function readFirstNonEmptySection(
  sections: Map<string, string>,
  sectionNames: readonly string[]
): string | null {
  for (const sectionName of sectionNames) {
    const value = readSection(sections, sectionName);
    if (value !== null) {
      return requireNonEmptyText(value, sectionName);
    }
  }

  return null;
}

function inferSymphonyTicketIntakeReason(
  error: unknown
): SymphonyTicketIntakeReason {
  if (error instanceof SymphonyCapabilityContractIntakeValidationError) {
    return error.reasons[0] ?? {
      code: "invalid_execution_contract",
      message: error.message,
      severity: "error",
      field: "ticket"
    };
  }

  if (error instanceof Error) {
    return inferSymphonyTicketIntakeReasonFromMessage(error.message);
  }

  return inferSymphonyTicketIntakeReasonFromMessage(String(error));
}

function requireNonEmptyText(value: string | null | undefined, fieldLabel: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldLabel} is required.`);
  }

  return value.trim();
}
