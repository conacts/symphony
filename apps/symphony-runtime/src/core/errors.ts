import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  createAppError,
  getErrorMessage,
  tryParseAppError,
  toAppError,
  type AppError,
  type ErrorCode
} from "@symphony/errors";

const statusByCode: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNKNOWN: 500
};

export function createRuntimeHttpError(
  status: number,
  code: ErrorCode,
  message?: string,
  details?: unknown
): HTTPException {
  return new HTTPException(status as ContentfulStatusCode, {
    cause: createAppError(code, message, details)
  });
}

export function createHttpError(
  code: ErrorCode,
  message?: string,
  details?: unknown
): HTTPException {
  const status = statusByCode[code] ?? 500;
  return createRuntimeHttpError(status, code, message, details);
}

export function normalizeRuntimeError(
  error: unknown
): { appError: AppError; status: number } {
  if (error instanceof HTTPException) {
    const parsed = tryParseAppError(error.cause);
    return {
      appError: parsed ?? createAppError("UNKNOWN", getErrorMessage("UNKNOWN")),
      status: error.status
    };
  }

  const parsed = tryParseAppError(error);
  if (parsed) {
    return {
      appError: parsed,
      status: statusByCode[parsed.code] ?? 500
    };
  }

  return {
    appError: toAppError(error),
    status: 500
  };
}
