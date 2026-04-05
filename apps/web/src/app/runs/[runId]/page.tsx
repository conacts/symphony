import type { ReactElement } from "react";

import { LegacyRunRedirectLiveScreen } from "@/features/runs/components/legacy-run-redirect-live-screen";

export default async function RunDetailPage(input: {
  params: Promise<{
    runId: string;
  }>;
}): Promise<ReactElement> {
  const { runId } = await input.params;

  return <LegacyRunRedirectLiveScreen runId={runId} />;
}
