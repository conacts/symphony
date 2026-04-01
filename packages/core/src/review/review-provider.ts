export type ReviewRequest<Request = unknown> = Request;

export interface ReviewFinding {
  title: string;
  body: string;
  path?: string | null;
  startLine?: number | null;
  endLine?: number | null;
}

export interface ReviewResult<Finding extends ReviewFinding = ReviewFinding> {
  summary?: string | null;
  findings: Finding[];
}

export interface ReviewProvider<
  Request = ReviewRequest,
  Result extends ReviewResult = ReviewResult
> {
  review(input: Request): Promise<Result | null> | Result | null;
}
