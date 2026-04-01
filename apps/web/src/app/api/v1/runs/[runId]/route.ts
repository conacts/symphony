import { NextResponse } from "next/server";
import {
  buildMockRunDetailResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function GET(
  _request: Request,
  context: {
    params: Promise<{
      runId: string;
    }>;
  }
) {
  if (!isMockRuntimeEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return context.params.then(({ runId }) => {
    const result = buildMockRunDetailResult(runId);

    if (!result) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    return NextResponse.json(createMockEnvelope(result));
  });
}
