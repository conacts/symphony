import type { ReactElement } from "react";
import { RunTurnsLiveScreen } from "@/features/runs/components/run-turns-live-screen";

export default async function IssueRunDetailPage(input: {
  params: Promise<{
    trackerIssueKey: string;
    runId: string;
  }>;
}): Promise<ReactElement> {
  const { trackerIssueKey: _trackerIssueKey, runId } = await input.params;

  return <RunTurnsLiveScreen runId={runId} />;
}
