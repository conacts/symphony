import { NextResponse } from "next/server";
import {
  buildMockRuntimeStateResult,
  createMockEnvelope,
  isMockRuntimeEnabled
} from "@/mock/symphony-runtime";

export function GET() {
  if (!isMockRuntimeEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(createMockEnvelope(buildMockRuntimeStateResult()));
}
