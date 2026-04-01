import { NextRequest, NextResponse } from "next/server";
import {
  buildMockIssueForensicsBundleResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function GET(
  request: NextRequest,
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
    const result = buildMockIssueForensicsBundleResult(
      issueIdentifier,
      request.nextUrl.searchParams
    );

    if (!result) {
      return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    }

    return NextResponse.json(createMockEnvelope(result));
  });
}
