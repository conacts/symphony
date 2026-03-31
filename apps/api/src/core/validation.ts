import { createHttpError } from "./errors.js";

type ParseableSchema<Output> = {
  safeParse(
    input: unknown
  ):
    | {
        success: true;
        data: Output;
      }
    | {
        success: false;
        error: {
          issues: unknown;
        };
      };
};

export function parseWithSchema<Output>(
  schema: ParseableSchema<Output>,
  input: unknown
): Output {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw createHttpError("VALIDATION_FAILED", "Validation failed.", result.error.issues);
  }

  return result.data;
}
