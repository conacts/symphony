import { NextResponse } from "next/server";
import {
  buildMockRuntimeRefreshResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function POST() {
  if (!isMockRuntimeEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(createMockEnvelope(buildMockRuntimeRefreshResult()), {
    status: 202
  });
}
