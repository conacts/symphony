import fsp from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { workspacePackageAliases } from "./workspace-package-aliases.ts";
type TestModuleTiming = {
  moduleId: string;
  relativeModuleId: string;
  environmentSetupDuration: number;
  prepareDuration: number;
  collectDuration: number;
  setupDuration: number;
  duration: number;
  totalDuration: number;
};
type TestModuleLike = {
  moduleId?: string;
  relativeModuleId?: string;
  diagnostic?: () => {
    environmentSetupDuration?: number;
    prepareDuration?: number;
    collectDuration?: number;
    setupDuration?: number;
    duration?: number;
  };
};

function normalizeDirectory(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asDuration(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildModuleTiming(testModule: TestModuleLike): TestModuleTiming {
  const diagnostic = testModule.diagnostic?.() ?? {};
  const moduleId = testModule.moduleId ?? "<unknown-module>";
  const relativeModuleId = testModule.relativeModuleId ?? moduleId;
  const environmentSetupDuration = asDuration(diagnostic.environmentSetupDuration);
  const prepareDuration = asDuration(diagnostic.prepareDuration);
  const collectDuration = asDuration(diagnostic.collectDuration);
  const setupDuration = asDuration(diagnostic.setupDuration);
  const duration = asDuration(diagnostic.duration);

  return {
    moduleId,
    relativeModuleId,
    environmentSetupDuration,
    prepareDuration,
    collectDuration,
    setupDuration,
    duration,
    totalDuration:
      environmentSetupDuration + prepareDuration + collectDuration + setupDuration + duration
  };
}

function sanitizeFileComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-");
}

class SymphonyVitestTimingReporter {
  async onTestRunEnd(testModules: ReadonlyArray<TestModuleLike>): Promise<void> {
    const timings = [...testModules]
      .map(buildModuleTiming)
      .sort((left, right) => right.totalDuration - left.totalDuration);

    if (process.env.SYMPHONY_VITEST_TIMING_SUMMARY === "1") {
      const topEntries = timings.slice(0, 10);
      if (topEntries.length > 0) {
        console.error("\nVitest slowest modules:");
        for (const entry of topEntries) {
          console.error(
            `- ${entry.relativeModuleId}: total=${entry.totalDuration}ms ` +
              `(collect=${entry.collectDuration}ms, tests=${entry.duration}ms, setup=${entry.setupDuration}ms)`
          );
        }
      }
    }

    const outputDirectory = normalizeDirectory(process.env.SYMPHONY_VITEST_TIMING_DIR);
    if (!outputDirectory) {
      return;
    }

    await fsp.mkdir(outputDirectory, {
      recursive: true
    });

    const outputPath = path.join(
      outputDirectory,
      `${sanitizeFileComponent(path.basename(process.cwd()))}.json`
    );

    await fsp.writeFile(
      outputPath,
      JSON.stringify(
        {
          cwd: process.cwd(),
          generatedAt: new Date().toISOString(),
          moduleCount: timings.length,
          timings
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

function resolveVitestMaxWorkers(): number | string {
  const configured = process.env.SYMPHONY_VITEST_MAX_WORKERS?.trim();
  if (configured) {
    return configured;
  }

  // Keep per-package worker pools conservative because Turbo already parallelizes
  // multiple package test tasks across the monorepo.
  return "75%";
}

const base = defineConfig({
  resolve: {
    alias: workspacePackageAliases
  },
  test: {
    maxWorkers: resolveVitestMaxWorkers(),
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    reporters: ["default", new SymphonyVitestTimingReporter()],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/dist/**",
        "**/node_modules/**"
      ]
    }
  }
});

export default base;
