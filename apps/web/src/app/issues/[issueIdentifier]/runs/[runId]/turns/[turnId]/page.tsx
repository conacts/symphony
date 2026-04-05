import type { ReactElement } from "react";
import { RunTurnDetailLiveScreen } from "@/features/runs/components/run-turn-detail-live-screen";

export default async function IssueRunTurnDetailPage(input: {
  params: Promise<{
    issueIdentifier: string;
    runId: string;
    turnId: string;
  }>;
}): Promise<ReactElement> {
  const { runId, turnId } = await input.params;

  return <RunTurnDetailLiveScreen runId={runId} turnId={turnId} />;
}
