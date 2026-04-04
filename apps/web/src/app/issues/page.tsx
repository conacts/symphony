import { Suspense } from "react";

import { IssueIndexLiveScreen } from "@/features/issues/components/issue-index-live-screen";

export default function IssuesPage() {
  return (
    <Suspense fallback={null}>
      <IssueIndexLiveScreen />
    </Suspense>
  );
}
