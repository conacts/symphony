import { Suspense } from "react";

import { FailureAnalysisLiveScreen } from "@/features/analysis/components/failure-analysis-live-screen";

export default function FailureAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <FailureAnalysisLiveScreen />
    </Suspense>
  );
}
