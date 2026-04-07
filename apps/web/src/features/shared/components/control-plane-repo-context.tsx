"use client";

import { createContext, useContext } from "react";

type ControlPlaneRepoContextValue = {
  selectedRepo?: string;
  repositories: string[];
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
