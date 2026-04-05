import type { ReactElement } from "react";
import { RunTranscriptLiveScreen } from "@/features/runs/components/run-transcript-live-screen";

export default async function IssueRunDetailPage(input: {
  params: Promise<{
    issueIdentifier: string;
    runId: string;
  }>;
}): Promise<ReactElement> {
  const { runId } = await input.params;

  return <RunTranscriptLiveScreen runId={runId} />;
}
