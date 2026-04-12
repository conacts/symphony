"use client";

import { startTransition, useEffect, useState } from "react";
import type { SymphonyRuntimeConfigResult } from "@symphony/contracts";
import { fetchRuntimeConfig } from "@/core/runtime-config-client";

export function useRuntimeConfig(input: {
  runtimeBaseUrl: string;
}) {
  const [resource, setResource] = useState<SymphonyRuntimeConfigResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    startTransition(() => {
      setLoading(true);
      setError(null);
    });

    void fetchRuntimeConfig(input.runtimeBaseUrl)
      .then((result) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setResource(result);
          setLoading(false);
          setError(null);
        });
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setLoading(false);
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Failed to load runtime config."
          );
        });
      });

    return () => {
      cancelled = true;
    };
  }, [input.runtimeBaseUrl]);

  return {
    resource,
    loading,
    error
  };
}
