export type SymphonyRunMode =
  | "implementation"
  | "rework"
  | "approved_merge";

export function deriveSymphonyRunMode(
  issueState: string | null | undefined
): SymphonyRunMode {
  const normalizedState = issueState?.trim().toLowerCase() ?? "";

  if (normalizedState === "rework") {
    return "rework";
  }

  if (normalizedState === "approved") {
    return "approved_merge";
  }

  return "implementation";
}
