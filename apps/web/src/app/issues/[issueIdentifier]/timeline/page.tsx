import type { ReactElement } from "react";

import { IssueActivityLiveScreen } from "@/features/issues/components/issue-activity-live-screen";

export default async function IssueActivityPage(input: {
  params: Promise<{
    issueIdentifier: string;
  }>;
}): Promise<ReactElement> {
  const { issueIdentifier } = await input.params;

  return <IssueActivityLiveScreen issueIdentifier={issueIdentifier} />;
}
