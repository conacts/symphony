import { IssueDetailLiveScreen } from "@/features/issues/components/issue-detail-live-screen";

export default async function IssueDetailPage(input: {
  params: Promise<{
    issueIdentifier: string;
  }>;
}) {
  const { issueIdentifier } = await input.params;

  return <IssueDetailLiveScreen issueIdentifier={issueIdentifier} />;
}
