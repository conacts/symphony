import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { IssueDetailLiveScreen } from "@/features/issues/components/issue-detail-live-screen";

export default async function IssueDetailPage(input: {
  params: Promise<{
    issueIdentifier: string;
  }>;
}) {
  const { issueIdentifier } = await input.params;
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <IssueDetailLiveScreen issueIdentifier={issueIdentifier} model={model} />;
}
