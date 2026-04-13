import type { ReactElement } from "react";

import { IssueActivityLiveScreen } from "@/features/issues/components/issue-activity-live-screen";

export default async function IssueActivityPage(input: {
  params: Promise<{
    trackerIssueKey: string;
  }>;
}): Promise<ReactElement> {
  const { trackerIssueKey } = await input.params;

  return <IssueActivityLiveScreen trackerIssueKey={trackerIssueKey} />;
}
