import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { IssueIndexLiveScreen } from "@/components/issue-index-live-screen";

export default function IssuesPage() {
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return <IssueIndexLiveScreen model={model} />;
}
