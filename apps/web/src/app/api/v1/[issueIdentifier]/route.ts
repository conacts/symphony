import { NextResponse } from "next/server";
import {
  buildMockRuntimeIssueResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function GET(
  _request: Request,
  context: {
    params: Promise<{
      issueIdentifier: string;
    }>;
  }
) {
  if (!isMockRuntimeEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return context.params.then(({ issueIdentifier }) => {
    const result = buildMockRuntimeIssueResult(issueIdentifier);

    if (!result) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    return NextResponse.json(createMockEnvelope(result));
  });
}
