import type { ReactElement } from "react";

import { IssueDetailLiveScreen } from "@/features/issues/components/issue-detail-live-screen";

export default async function IssueDetailPage(input: {
  params: Promise<{
    trackerIssueKey: string;
  }>;
}): Promise<ReactElement> {
  const { trackerIssueKey } = await input.params;

  return <IssueDetailLiveScreen trackerIssueKey={trackerIssueKey} />;
}
