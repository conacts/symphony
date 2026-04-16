import type {
  SymphonyImplementationModuleEvidence,
  SymphonyImplementationModuleRequestedState,
  SymphonyImplementationModuleResult,
  SymphonyImplementationModuleOutcome,
  SymphonyImplementationVerificationRecord,
  SymphonyImplementationVerificationStatus
} from "./module-result.js";

export type SymphonyImplementationModuleResultParseResult =
  | {
      kind: "parsed";
      result: SymphonyImplementationModuleResult;
    }
  | {
      kind: "terminal_result_failure";
      reason: string;
    };

const verificationStatuses = new Set<SymphonyImplementationVerificationStatus>([
  "passed",
  "failed",
  "skipped"
]);

const outcomes = new Set<SymphonyImplementationModuleOutcome>([
  "completed",
  "awaiting_input",
  "blocked"
]);

const requestedStates = new Set<SymphonyImplementationModuleRequestedState>([
  "done",
  "awaiting_input",
  "blocked"
]);

export function parseSymphonyImplementationModuleResultMessage(input: {
  messageText: string | null;
}): SymphonyImplementationModuleResultParseResult {
  const trimmed = input.messageText?.trim() ?? "";
  if (trimmed === "") {
    return terminalResultFailure(
      "Capability-managed run ended without a final assistant message containing a terminal module result."
    );
  }

  const extracted = extractTerminalJsonCandidate(trimmed);
  if (extracted.kind !== "candidate") {
    return extracted.kind === "terminal_result_failure"
      ? extracted
      : terminalResultFailure(
          "Capability-managed run ended without a final terminal module result JSON block."
        );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch (error) {
    return terminalResultFailure(
      `Capability-managed run emitted malformed terminal module result JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const validated = validateImplementationModuleResult(parsed);
  return validated.kind === "parsed"
    ? validated
    : terminalResultFailure(validated.reason);
}

function extractTerminalJsonCandidate(
  value: string
):
  | {
      kind: "candidate";
      json: string;
    }
  | {
      kind: "missing_terminal_result";
    }
  | {
      kind: "terminal_result_failure";
      reason: string;
    } {
  const fenced = value.match(/^```json\s*([\s\S]+?)\s*```$/u);
  if (fenced) {
    return {
      kind: "candidate",
      json: fenced[1].trim()
    };
  }

  if (value.startsWith("{") && value.endsWith("}")) {
    return {
      kind: "candidate",
      json: value
    };
  }

  if (value.includes("```json")) {
    return terminalJsonCandidateFailure(
      "Capability-managed run attempted a terminal module result, but the final assistant message was not exactly one fenced `json` block."
    );
  }

  if (value.startsWith("{") || value.endsWith("}")) {
    return terminalJsonCandidateFailure(
      "Capability-managed run attempted a terminal module result, but the final assistant message was not a single valid JSON object."
    );
  }

  return {
    kind: "missing_terminal_result"
  };
}

function validateImplementationModuleResult(
  value: unknown
): SymphonyImplementationModuleResultParseResult {
  const record = asRecord(value);
  if (!record) {
    return terminalResultFailure("Terminal module result must be a JSON object.");
  }

  const schemaVersion = requireString(record, "schemaVersion");
  if (schemaVersion !== "1") {
    return terminalResultFailure(
      `Terminal module result schemaVersion must be "1". Received ${JSON.stringify(schemaVersion)}.`
    );
  }

  const moduleId = requireString(record, "moduleId");
  if (moduleId !== "implement.spec") {
    return terminalResultFailure(
      `Terminal module result moduleId must be "implement.spec". Received ${JSON.stringify(moduleId)}.`
    );
  }

  const outcome = requireString(record, "outcome");
  if (!outcomes.has(outcome as SymphonyImplementationModuleOutcome)) {
    return terminalResultFailure(
      `Terminal module result outcome must be one of ${JSON.stringify(Array.from(outcomes))}.`
    );
  }

  const summary = requireString(record, "summary");
  if (!summary) {
    return terminalResultFailure(
      "Terminal module result summary must be a non-empty string."
    );
  }

  const evidence = validateEvidence(record.evidence);
  if ("reason" in evidence) {
    return terminalResultFailure(evidence.reason);
  }

  const requestedState = requireString(record, "requestedState");
  if (
    !requestedStates.has(
      requestedState as SymphonyImplementationModuleRequestedState
    )
  ) {
    return terminalResultFailure(
      `Terminal module result requestedState must be one of ${JSON.stringify(Array.from(requestedStates))}.`
    );
  }

  const nextInputPrompt = validateNullableString(
    record.nextInputPrompt,
    "nextInputPrompt"
  );
  if ("reason" in nextInputPrompt) {
    return terminalResultFailure(nextInputPrompt.reason);
  }

  const blockers = validateStringArray(record.blockers, "blockers");
  if ("reason" in blockers) {
    return terminalResultFailure(blockers.reason);
  }

  const result: SymphonyImplementationModuleResult = {
    schemaVersion: "1",
    moduleId: "implement.spec",
    outcome: outcome as SymphonyImplementationModuleOutcome,
    summary,
    evidence: evidence.value,
    requestedState:
      requestedState as SymphonyImplementationModuleRequestedState,
    nextInputPrompt: nextInputPrompt.value,
    blockers: blockers.value
  };

  const consistencyError = validateOutcomeConsistency(result);
  if (consistencyError) {
    return terminalResultFailure(consistencyError);
  }

  return {
    kind: "parsed",
    result
  };
}

function validateEvidence(
  value: unknown
):
  | {
      value: SymphonyImplementationModuleEvidence;
    }
  | {
      reason: string;
    } {
  const record = asRecord(value);
  if (!record) {
    return {
      reason: "Terminal module result evidence must be an object."
    };
  }

  const filesChanged = validateStringArray(record.filesChanged, "evidence.filesChanged");
  if ("reason" in filesChanged) {
    return filesChanged;
  }

  const verification = validateVerificationArray(record.verification);
  if ("reason" in verification) {
    return verification;
  }

  const notes = validateNullableString(record.notes, "evidence.notes");
  if ("reason" in notes) {
    return notes;
  }

  return {
    value: {
      filesChanged: filesChanged.value,
      verification: verification.value,
      notes: notes.value
    }
  };
}

function validateVerificationArray(
  value: unknown
):
  | {
      value: SymphonyImplementationVerificationRecord[];
    }
  | {
      reason: string;
    } {
  if (!Array.isArray(value)) {
    return {
      reason: "Terminal module result evidence.verification must be an array."
    };
  }

  const verification: SymphonyImplementationVerificationRecord[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      return {
        reason:
          "Terminal module result evidence.verification entries must be objects."
      };
    }

    const command = requireString(record, "command");
    if (!command) {
      return {
        reason:
          "Terminal module result evidence.verification.command must be a non-empty string."
      };
    }

    const status = requireString(record, "status");
    if (!verificationStatuses.has(status as SymphonyImplementationVerificationStatus)) {
      return {
        reason: `Terminal module result evidence.verification.status must be one of ${JSON.stringify(Array.from(verificationStatuses))}.`
      };
    }

    const details = validateNullableString(record.details, "details");
    if ("reason" in details) {
      return details;
    }

    verification.push({
      command,
      status: status as SymphonyImplementationVerificationStatus,
      details: details.value
    });
  }

  return {
    value: verification
  };
}

function validateStringArray(
  value: unknown,
  fieldName: string
):
  | {
      value: string[];
    }
  | {
      reason: string;
    } {
  if (!Array.isArray(value)) {
    return {
      reason: `Terminal module result ${fieldName} must be an array.`
    };
  }

  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return {
        reason: `Terminal module result ${fieldName} entries must be strings.`
      };
    }

    strings.push(entry);
  }

  return {
    value: strings
  };
}

function validateNullableString(
  value: unknown,
  fieldName: string
):
  | {
      value: string | null;
    }
  | {
      reason: string;
    } {
  if (value === null || value === undefined) {
    return {
      value: null
    };
  }

  if (typeof value !== "string") {
    return {
      reason: `Terminal module result ${fieldName} must be a string or null.`
    };
  }

  return {
    value
  };
}

function validateOutcomeConsistency(
  result: SymphonyImplementationModuleResult
): string | null {
  switch (result.outcome) {
    case "completed":
      if (result.requestedState !== "done") {
        return 'Completed terminal module result must request the "done" state.';
      }
      if (result.nextInputPrompt !== null) {
        return "Completed terminal module result cannot include nextInputPrompt.";
      }
      if (result.blockers.length > 0) {
        return "Completed terminal module result cannot include blockers.";
      }
      return null;
    case "awaiting_input":
      if (result.requestedState !== "awaiting_input") {
        return 'Awaiting-input terminal module result must request the "awaiting_input" state.';
      }
      if (!result.nextInputPrompt) {
        return "Awaiting-input terminal module result must include nextInputPrompt.";
      }
      if (result.blockers.length > 0) {
        return "Awaiting-input terminal module result cannot include blockers.";
      }
      return null;
    case "blocked":
      if (result.requestedState !== "blocked") {
        return 'Blocked terminal module result must request the "blocked" state.';
      }
      if (result.nextInputPrompt !== null) {
        return "Blocked terminal module result cannot include nextInputPrompt.";
      }
      if (result.blockers.length === 0) {
        return "Blocked terminal module result must include at least one blocker.";
      }
      return null;
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function terminalResultFailure(
  reason: string
): SymphonyImplementationModuleResultParseResult {
  return {
    kind: "terminal_result_failure",
    reason
  };
}

function terminalJsonCandidateFailure(reason: string): {
  kind: "terminal_result_failure";
  reason: string;
} {
  return {
    kind: "terminal_result_failure",
    reason
  };
}
