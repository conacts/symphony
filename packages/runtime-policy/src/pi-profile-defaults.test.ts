import { describe, expect, it } from "vitest";
import {
  defaultSymphonyPiProfileDefaults,
  findSymphonyPiProfileDefaults,
  listSymphonyPiProfileDefaults
} from "./pi-profile-defaults.js";

describe("pi profile defaults", () => {
  it("returns the default Pi profile defaults", () => {
    expect(defaultSymphonyPiProfileDefaults()).toMatchObject({
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      provider: {
        id: "openrouter",
        name: "OpenRouter"
      }
    });
  });

  it("finds a profile by case-insensitive name", () => {
    expect(findSymphonyPiProfileDefaults("GLM-5-TURBO")).toMatchObject({
      profile: "glm-5-turbo",
      defaultModel: "z-ai/glm-5-turbo"
    });
  });

  it("returns cloned catalog entries", () => {
    const defaults = listSymphonyPiProfileDefaults();
    defaults[0]!.provider.name = "Changed";

    expect(defaultSymphonyPiProfileDefaults().provider.name).toBe("OpenRouter");
  });
});
