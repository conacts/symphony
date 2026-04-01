import { NextRequest, NextResponse } from "next/server";
import {
  buildMockIssueListResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function GET(request: NextRequest) {
  if (!isMockRuntimeEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(
    createMockEnvelope(buildMockIssueListResult(request.nextUrl.searchParams))
  );
}
