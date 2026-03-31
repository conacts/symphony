import { z } from "zod";

export const ERROR_MESSAGES = {
  UNKNOWN: "An unknown error occurred.",
  VALIDATION_FAILED: "Validation failed.",
  NOT_FOUND: "Resource not found.",
  CONFLICT: "Resource conflict.",
  SAFETY_CONFLICT: "Safety lifecycle conflict.",
  BUNDLE_NOT_AVAILABLE: "Policy bundle is not available.",
  BUNDLE_HASH_MISMATCH: "Policy bundle hash does not match expected value.",
  PAYLOAD_HASH_MISMATCH: "Payload hash does not match permit identity.",
  EXECUTION_WINDOW_EXPIRED: "Execution window has expired.",
  IDENTITY_INVARIANT_VIOLATION: "Identity invariants were violated.",
  WEBHOOK_INVALID_SIGNATURE: "Webhook signature is invalid.",
  WEBHOOK_TIMESTAMP_SKEW: "Webhook timestamp is outside allowed skew.",
  WEBHOOK_REPLAY_REJECTED: "Webhook replay was rejected.",
  UNAUTHORIZED: "Unauthorized.",
  FORBIDDEN: "Forbidden."
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

export const errorCodeSchema = z.enum(ERROR_CODES as [ErrorCode, ...ErrorCode[]]);

export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}

export type AppError = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export const appErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional()
});

export function createAppError(code: ErrorCode, messageOverride?: string, details?: unknown): AppError {
  return {
    code,
    message: messageOverride ?? getErrorMessage(code),
    details
  };
}

export function isAppError(value: unknown): value is AppError {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "code" in value && "message" in value;
}

export function fromZodError(error: z.ZodError): AppError {
  const details = error.flatten();
  return createAppError("VALIDATION_FAILED", getErrorMessage("VALIDATION_FAILED"), details);
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return fromZodError(error);
  }

  if (error instanceof Error) {
    return createAppError("UNKNOWN", error.message);
  }

  return createAppError("UNKNOWN", getErrorMessage("UNKNOWN"), { value: error });
}

function parseJsonAppError(value: string): AppError | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const validated = appErrorSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

export function tryParseAppError(value: unknown): AppError | null {
  if (value === null || value === undefined) {
    return null;
  }

  const validated = appErrorSchema.safeParse(value);
  if (validated.success) {
    return validated.data;
  }

  if (typeof value === "string") {
    return parseJsonAppError(value);
  }

  if (value instanceof Error) {
    const fromMessage = tryParseAppError(value.message);
    if (fromMessage) {
      return fromMessage;
    }
    if ("cause" in value) {
      return tryParseAppError((value as { cause?: unknown }).cause ?? null);
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("error" in record) {
      const parsedError = tryParseAppError(record.error);
      if (parsedError) {
        return parsedError;
      }
    }
    if ("appError" in record) {
      const parsedAppError = tryParseAppError(record.appError);
      if (parsedAppError) {
        return parsedAppError;
      }
    }
    if ("cause" in record) {
      return tryParseAppError(record.cause);
    }
  }

  return null;
}
