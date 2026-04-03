export type SymphonyWorkspaceContext = {
  issueId: string | null;
  issueIdentifier: string;
  branchName?: string | null;
};

export class SymphonyWorkspaceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SymphonyWorkspaceError";
    this.code = code;
  }
}

export function sanitizeSymphonyIssueIdentifier(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function symphonyWorkspaceDirectoryName(issueIdentifier: string): string {
  return `symphony-${sanitizeSymphonyIssueIdentifier(issueIdentifier)}`;
}
