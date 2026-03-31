"use client";

import { useEffectEvent, useState } from "react";
import type { SymphonyRuntimeRefreshResult } from "@symphony/contracts";
import { requestRuntimeRefresh } from "@/core/runtime-operator-client";

export function useRuntimeRefreshAction(input: {
  refreshUrl: string;
  onRequested?: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] =
    useState<SymphonyRuntimeRefreshResult | null>(null);
  const runOnRequested = useEffectEvent(async () => {
    await input.onRequested?.();
  });

  async function triggerRefresh(): Promise<void> {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await requestRuntimeRefresh(input.refreshUrl);
      setLastResult(result);
      await runOnRequested();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Runtime refresh failed."
      );
    } finally {
      setPending(false);
    }
  }

  return {
    pending,
    error,
    lastResult,
    triggerRefresh
  };
}
