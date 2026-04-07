"use client";

import { createContext, useContext } from "react";
import type { ControlPlaneRepositorySummary } from "@/core/control-plane-repo-scope";

type ControlPlaneRepoContextValue = {
  selectedRepo?: string;
  repositories: ControlPlaneRepositorySummary[];
};

const ControlPlaneRepoContext = createContext<ControlPlaneRepoContextValue>({
  repositories: []
});

export function ControlPlaneRepoProvider(input: {
  value: ControlPlaneRepoContextValue;
  children: React.ReactNode;
}) {
  return (
    <ControlPlaneRepoContext.Provider value={input.value}>
      {input.children}
    </ControlPlaneRepoContext.Provider>
  );
}

export function useControlPlaneRepoContext() {
  return useContext(ControlPlaneRepoContext);
}
