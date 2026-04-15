import type {
  SymphonyImplementationModuleEvidence,
  SymphonyImplementationModuleRequestedState,
  SymphonyImplementationModuleResult,
  SymphonyImplementationModuleOutcome,
  SymphonyImplementationVerificationRecord,
  SymphonyImplementationVerificationStatus
} from "@symphony/runtime-contract";

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
    return terminalResultFailure(
      "Capability-managed run attempted a terminal module result, but the final assistant message was not exactly one fenced `json` block."
    );
  }

  if (value.startsWith("{") || value.endsWith("}")) {
    return terminalResultFailure(
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

  const records: SymphonyImplementationVerificationRecord[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      return {
        reason:
          "Terminal module result verification entries must be JSON objects."
      };
    }

    const command = requireString(record, "command");
    if (!command) {
      return {
        reason:
          "Terminal module result verification.command must be a non-empty string."
      };
    }

    const status = requireString(record, "status");
    if (!verificationStatuses.has(status as SymphonyImplementationVerificationStatus)) {
      return {
        reason: `Terminal module result verification.status must be one of ${JSON.stringify(
          Array.from(verificationStatuses)
        )}.`
      };
    }

    const details = validateNullableString(record.details, "verification.details");
    if ("reason" in details) {
      return details;
    }

    records.push({
      command,
      status: status as SymphonyImplementationVerificationStatus,
      details: details.value
    });
  }

  return {
    value: records
  };
}

function validateStringArray(
  value: unknown,
  label: string
): { value: string[] } | { reason: string } {
  if (!Array.isArray(value)) {
    return {
      reason: `Terminal module result ${label} must be an array.`
    };
  }

  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return {
        reason: `Terminal module result ${label} entries must be non-empty strings.`
      };
    }
    items.push(entry.trim());
  }

  return {
    value: items
  };
}

function validateNullableString(
  value: unknown,
  label: string
): { value: string | null } | { reason: string } {
  if (value === null) {
    return {
      value: null
    };
  }

  if (typeof value !== "string" || value.trim() === "") {
    return {
      reason: `Terminal module result ${label} must be a non-empty string or null.`
    };
  }

  return {
    value: value.trim()
  };
}

function validateOutcomeConsistency(
  result: SymphonyImplementationModuleResult
): string | null {
  switch (result.outcome) {
    case "completed":
      if (result.requestedState !== "done") {
        return "Completed terminal module results must use requestedState \"done\".";
      }
      if (result.nextInputPrompt !== null) {
        return "Completed terminal module results must set nextInputPrompt to null.";
      }
      if (result.blockers.length > 0) {
        return "Completed terminal module results must not include blockers.";
      }
      return null;
    case "awaiting_input":
      if (result.requestedState !== "awaiting_input") {
        return "Awaiting-input terminal module results must use requestedState \"awaiting_input\".";
      }
      if (result.nextInputPrompt === null) {
        return "Awaiting-input terminal module results must include nextInputPrompt.";
      }
      return null;
    case "blocked":
      if (result.requestedState !== "blocked") {
        return "Blocked terminal module results must use requestedState \"blocked\".";
      }
      if (result.blockers.length === 0) {
        return "Blocked terminal module results must include at least one blocker.";
      }
      return null;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" ? value.trim() : null;
}

function terminalResultFailure(
  reason: string
): Extract<
  SymphonyImplementationModuleResultParseResult,
  { kind: "terminal_result_failure" }
> {
  return {
    kind: "terminal_result_failure",
    reason
  };
}
