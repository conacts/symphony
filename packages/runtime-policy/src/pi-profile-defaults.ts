import type { SymphonyHarnessProviderRuntimePolicy } from "./runtime-policy.js";

export type SymphonyPiProfileDefaults = {
  profile: string;
  defaultModel: string;
  defaultReasoningEffort: string;
  provider: NonNullable<SymphonyHarnessProviderRuntimePolicy>;
};

const symphonyPiOpenRouterProviderDefaults = {
  id: "openrouter",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  envKey: "OPENROUTER_API_KEY",
  supportsWebsockets: false,
  wireApi: "responses"
} as const satisfies NonNullable<SymphonyHarnessProviderRuntimePolicy>;

const symphonyPiProfileDefaultsCatalog = [
  {
    profile: "mimo-v2-pro",
    defaultModel: "xiaomi/mimo-v2-pro",
    defaultReasoningEffort: "high",
    provider: symphonyPiOpenRouterProviderDefaults
  },
  {
    profile: "glm-5-turbo",
    defaultModel: "z-ai/glm-5-turbo",
    defaultReasoningEffort: "high",
    provider: symphonyPiOpenRouterProviderDefaults
  }
] as const satisfies readonly SymphonyPiProfileDefaults[];

export function listSymphonyPiProfileDefaults(): SymphonyPiProfileDefaults[] {
  return symphonyPiProfileDefaultsCatalog.map((profileDefaults) => ({
    ...profileDefaults,
    provider: {
      ...profileDefaults.provider
    }
  }));
}

export function defaultSymphonyPiProfileDefaults(): SymphonyPiProfileDefaults {
  return cloneSymphonyPiProfileDefaults(
    symphonyPiProfileDefaultsCatalog[0]
  );
}

export function findSymphonyPiProfileDefaults(
  profile: string | null | undefined
): SymphonyPiProfileDefaults | null {
  if (typeof profile !== "string") {
    return null;
  }

  const normalizedProfile = profile.trim().toLowerCase();
  if (normalizedProfile === "") {
    return null;
  }

  const matchedProfileDefaults = symphonyPiProfileDefaultsCatalog.find(
    (profileDefaults) => profileDefaults.profile === normalizedProfile
  );

  return matchedProfileDefaults
    ? cloneSymphonyPiProfileDefaults(matchedProfileDefaults)
    : null;
}

function cloneSymphonyPiProfileDefaults(
  profileDefaults: SymphonyPiProfileDefaults
): SymphonyPiProfileDefaults {
  return {
    ...profileDefaults,
    provider: {
      ...profileDefaults.provider
    }
  };
}
