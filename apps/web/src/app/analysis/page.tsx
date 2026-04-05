import { Suspense } from "react";

import { AnalysisOverviewLiveScreen } from "@/features/analysis/components/analysis-overview-live-screen";

export default function AnalysisOverviewPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisOverviewLiveScreen />
    </Suspense>
  );
}
