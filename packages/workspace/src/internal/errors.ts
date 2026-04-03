export function hasErrorCode(
  error: unknown,
  code: string
): error is Error & { code: string } {
  return error instanceof Error && "code" in error && error.code === code;
}

export function isEnoent(error: unknown): error is Error & { code: string } {
  return hasErrorCode(error, "ENOENT");
}
