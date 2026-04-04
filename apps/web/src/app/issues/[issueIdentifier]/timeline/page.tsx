import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { IssueActivityLiveScreen } from "@/components/issue-activity-live-screen";

export default async function IssueActivityPage(input: {
  params: Promise<{
    issueIdentifier: string;
  }>;
}) {
  const { issueIdentifier } = await input.params;
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return (
    <IssueActivityLiveScreen issueIdentifier={issueIdentifier} model={model} />
  );
}
