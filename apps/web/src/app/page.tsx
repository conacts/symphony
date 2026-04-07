import { Suspense } from "react";

import { OverviewLiveScreen } from "@/features/overview/components/overview-live-screen";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OverviewLiveScreen />
    </Suspense>
  );
}
