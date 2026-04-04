"use client";

import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { SymphonyDashboardFoundationModel } from "@/core/dashboard-foundation";

const ControlPlaneModelContext =
  createContext<SymphonyDashboardFoundationModel | null>(null);

export function ControlPlaneModelProvider(input: {
  children: ReactNode;
  model: SymphonyDashboardFoundationModel;
}) {
  return (
    <ControlPlaneModelContext.Provider value={input.model}>
      {input.children}
    </ControlPlaneModelContext.Provider>
  );
}

export function useControlPlaneModel(): SymphonyDashboardFoundationModel {
  const model = useContext(ControlPlaneModelContext);

  if (!model) {
    throw new Error("ControlPlaneModelProvider is required for dashboard routes.");
  }

  return model;
}
