export type SymphonyRunMode = "implementation";

export function deriveSymphonyRunMode(
  issueState: string | null | undefined
): SymphonyRunMode {
  void issueState;
  return "implementation";
}
