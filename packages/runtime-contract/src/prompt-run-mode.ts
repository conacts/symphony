export type SymphonyRunMode = "implementation" | "rework";

export function deriveSymphonyRunMode(
  issueState: string | null | undefined
): SymphonyRunMode {
  const normalizedState = issueState?.trim().toLowerCase() ?? "";

  if (normalizedState === "rework") {
    return "rework";
  }

  return "implementation";
}
