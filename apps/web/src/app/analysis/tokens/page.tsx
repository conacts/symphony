import { Suspense } from "react";

import { TokenAnalysisLiveScreen } from "@/features/analysis/components/token-analysis-live-screen";

export default function TokenAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <TokenAnalysisLiveScreen />
    </Suspense>
  );
}
