import { Suspense } from "react";

import { PerformanceAnalysisLiveScreen } from "@/features/analysis/components/performance-analysis-live-screen";

export default function PerformanceAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <PerformanceAnalysisLiveScreen />
    </Suspense>
  );
}
