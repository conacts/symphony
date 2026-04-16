export type SymphonyTicketIntakeDecision =
  | "ready"
  | "needs_clarification"
  | "invalid_directive";

export type SymphonyTicketIntakeReasonSeverity = "warning" | "error";

export type SymphonyTicketIntakeReasonCode =
  | "insufficient_ticket_detail"
  | "missing_objective"
  | "missing_done_definition"
  | "invalid_max_retry_count"
  | "invalid_clarification_mode"
  | "invalid_review_strictness"
  | "invalid_required_capability"
  | "invalid_preferred_capability"
  | "invalid_forbidden_capability"
  | "invalid_required_evidence"
  | "invalid_allowed_model_profile"
  | "invalid_execution_contract";

export type SymphonyTicketIntakeReasonField =
  | "ticket"
  | "objective"
  | "doneDefinition"
  | "routingDirectives.requiredCapabilityIds"
  | "routingDirectives.preferredCapabilityIds"
  | "routingDirectives.forbiddenCapabilityIds"
  | "routingDirectives.requiredEvidenceIds"
  | "routingDirectives.allowedModelProfileIds"
  | "routingDirectives.clarificationPolicy.mode"
  | "routingDirectives.reviewStrictness"
  | "routingDirectives.maxRetryCount";

export type SymphonyTicketIntakeReason = {
  code: SymphonyTicketIntakeReasonCode;
  message: string;
  severity: SymphonyTicketIntakeReasonSeverity;
  field: SymphonyTicketIntakeReasonField;
};

export type SymphonyTicketIntakeClarificationQuestion = {
  id: string;
  prompt: string;
  context: string | null;
};

export type SymphonyTicketIntakeClarificationRequest = {
  summary: string;
  questions: SymphonyTicketIntakeClarificationQuestion[];
};

export type SymphonyTicketIntakeDisposition =
  | {
      decision: "ready";
      workflowLifecycleAction: "continue";
      trackerState: null;
      requeueToState: null;
    }
  | {
      decision: "needs_clarification";
      workflowLifecycleAction: "awaiting_input";
      trackerState: "Paused";
      requeueToState: "Todo";
    }
  | {
      decision: "invalid_directive";
      workflowLifecycleAction: "failed";
      trackerState: "Failed";
      requeueToState: "Todo";
    };

export type SymphonyOperatorStateDirectiveComment = {
  title: string;
  state: "Paused" | "Failed";
  whatChanged: string;
  reasons?: SymphonyTicketIntakeReason[];
  nextAction: string;
  requeueToState: "Todo" | null;
};

export function readSymphonyTicketIntakeDisposition(
  decision: SymphonyTicketIntakeDecision
): SymphonyTicketIntakeDisposition {
  switch (decision) {
    case "ready":
      return {
        decision,
        workflowLifecycleAction: "continue",
        trackerState: null,
        requeueToState: null
      };
    case "needs_clarification":
      return {
        decision,
        workflowLifecycleAction: "awaiting_input",
        trackerState: "Paused",
        requeueToState: "Todo"
      };
    case "invalid_directive":
      return {
        decision,
        workflowLifecycleAction: "failed",
        trackerState: "Failed",
        requeueToState: "Todo"
      };
  }
}

export function inferSymphonyTicketIntakeReasonFromMessage(
  message: string
): SymphonyTicketIntakeReason {
  const normalized = message.trim();

  if (/^Invalid max retry count\b/i.test(normalized)) {
    return {
      code: "invalid_max_retry_count",
      message: normalized,
      severity: "error",
      field: "routingDirectives.maxRetryCount"
    };
  }

  if (/^Invalid clarification mode\b/i.test(normalized)) {
    return {
      code: "invalid_clarification_mode",
      message: normalized,
      severity: "error",
      field: "routingDirectives.clarificationPolicy.mode"
    };
  }

  if (/^Invalid review strictness\b/i.test(normalized)) {
    return {
      code: "invalid_review_strictness",
      message: normalized,
      severity: "error",
      field: "routingDirectives.reviewStrictness"
    };
  }

  if (/required capabilities?/i.test(normalized)) {
    return {
      code: "invalid_required_capability",
      message: normalized,
      severity: "error",
      field: "routingDirectives.requiredCapabilityIds"
    };
  }

  if (/preferred capabilities?/i.test(normalized)) {
    return {
      code: "invalid_preferred_capability",
      message: normalized,
      severity: "error",
      field: "routingDirectives.preferredCapabilityIds"
    };
  }

  if (/forbidden capabilities?/i.test(normalized)) {
    return {
      code: "invalid_forbidden_capability",
      message: normalized,
      severity: "error",
      field: "routingDirectives.forbiddenCapabilityIds"
    };
  }

  if (/required evidence/i.test(normalized)) {
    return {
      code: "invalid_required_evidence",
      message: normalized,
      severity: "error",
      field: "routingDirectives.requiredEvidenceIds"
    };
  }

  if (/allowed model profiles?/i.test(normalized)) {
    return {
      code: "invalid_allowed_model_profile",
      message: normalized,
      severity: "error",
      field: "routingDirectives.allowedModelProfileIds"
    };
  }

  return {
    code: "invalid_execution_contract",
    message: normalized,
    severity: "error",
    field: "ticket"
  };
}

export function renderSymphonyOperatorStateDirectiveComment(
  input: SymphonyOperatorStateDirectiveComment
): string {
  const lines = [
    input.title,
    "",
    `State: \`${input.state}\``,
    `What changed: ${input.whatChanged}`
  ];

  if (input.reasons && input.reasons.length > 0) {
    lines.push("Why:");
    for (const reason of input.reasons) {
      lines.push(`- ${reason.message}`);
    }
  }

  lines.push(`Next step: ${input.nextAction}`);

  if (input.requeueToState) {
    lines.push(
      `The issue is currently in \`${input.state}\`. After completing the next step, move it to \`${input.requeueToState}\` to requeue.`
    );
  }

  return lines.join("\n");
}
