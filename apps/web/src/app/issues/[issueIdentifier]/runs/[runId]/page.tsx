import type { ReactElement } from "react";
import { RunTurnsLiveScreen } from "@/features/runs/components/run-turns-live-screen";

export default async function IssueRunDetailPage(input: {
  params: Promise<{
    issueIdentifier: string;
    runId: string;
  }>;
}): Promise<ReactElement> {
  const { runId } = await input.params;

  return <RunTurnsLiveScreen runId={runId} />;
}
