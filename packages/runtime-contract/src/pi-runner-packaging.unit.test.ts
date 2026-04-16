import { describe, expect, it } from "vitest";
import {
  defaultPiRunnerEntrypointRelativePath,
  defaultPiRunnerExecutableName,
  defaultPiRunnerExecutablePath,
  defaultPiRunnerPackageRoot,
  defaultPiRunnerTsxLoaderRelativePath,
  resolvePiRunnerPackagedAssetPaths
} from "./pi-runner-packaging.js";

describe("pi runner packaging", () => {
  it("publishes the canonical executable contract", () => {
    expect(defaultPiRunnerExecutableName).toBe("symphony-pi-runner");
    expect(defaultPiRunnerExecutablePath).toBe(
      "/usr/local/bin/symphony-pi-runner"
    );
  });

  it("resolves the packaged runner assets from the default package root", () => {
    expect(resolvePiRunnerPackagedAssetPaths()).toEqual([
      `${defaultPiRunnerPackageRoot}/${defaultPiRunnerTsxLoaderRelativePath}`,
      `${defaultPiRunnerPackageRoot}/${defaultPiRunnerEntrypointRelativePath}`
    ]);
  });

  it("normalizes trailing slashes in custom package roots", () => {
    expect(resolvePiRunnerPackagedAssetPaths("/custom/pi-runner///")).toEqual([
      "/custom/pi-runner/node_modules/tsx/dist/loader.mjs",
      "/custom/pi-runner/src/pi/runner-entrypoint.ts"
    ]);
  });

  it("rejects empty package roots", () => {
    expect(() => resolvePiRunnerPackagedAssetPaths("   ")).toThrowError(
      /package root must be non-empty/i
    );
  });
});
