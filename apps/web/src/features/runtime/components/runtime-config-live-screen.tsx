"use client";

import { buildRuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import { RuntimeConfigView } from "@/features/runtime/components/runtime-config-view";
import { useRuntimeConfig } from "@/features/runtime/hooks/use-runtime-config";
import { ControlPlanePage } from "@/features/shared/components/control-plane-page";
import { useControlPlaneModel } from "@/features/shared/components/control-plane-model-context";
import { useControlPlaneRuntime } from "@/features/shared/components/control-plane-runtime-context";

export function RuntimeConfigLiveScreen() {
  const model = useControlPlaneModel();
  const runtimeSummaryState = useControlPlaneRuntime();
  const configState = useRuntimeConfig({
    runtimeBaseUrl: model.runtimeBaseUrl
  });

  const connection = buildRuntimeSummaryConnectionState({
    status: runtimeSummaryState.status,
    error: runtimeSummaryState.error ?? configState.error,
    hasSnapshot: runtimeSummaryState.runtimeSummary !== null
  });

  return (
    <ControlPlanePage connection={connection}>
      <RuntimeConfigView
        connection={connection}
        error={configState.error}
        loading={configState.loading}
        config={configState.resource}
      />
    </ControlPlanePage>
  );
}
