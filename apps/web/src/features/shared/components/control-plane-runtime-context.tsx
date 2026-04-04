"use client";

import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { useRuntimeSummary } from "@/hooks/use-runtime-summary";

type RuntimeSummaryState = ReturnType<typeof useRuntimeSummary>;

const ControlPlaneRuntimeContext = createContext<RuntimeSummaryState | null>(null);

export function ControlPlaneRuntimeProvider(input: {
  children: ReactNode;
  runtimeSummaryState: RuntimeSummaryState;
}) {
  return (
    <ControlPlaneRuntimeContext.Provider value={input.runtimeSummaryState}>
      {input.children}
    </ControlPlaneRuntimeContext.Provider>
  );
}

export function useControlPlaneRuntime(): RuntimeSummaryState {
  const runtime = useContext(ControlPlaneRuntimeContext);

  if (!runtime) {
    throw new Error(
      "ControlPlaneRuntimeProvider is required for dashboard runtime consumers."
    );
  }

  return runtime;
}
