import {
  symphonyRuntimeConfigResponseSchema,
  type SymphonyRuntimeConfigResult
} from "@symphony/contracts";
import { createRuntimeUrl } from "@/core/runtime-url";

export async function fetchRuntimeConfig(
  runtimeBaseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeConfigResult> {
  const endpoint = createRuntimeUrl("/api/v1/runtime/config", runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Runtime config request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeConfigResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}
