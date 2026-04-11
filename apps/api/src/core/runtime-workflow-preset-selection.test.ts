import { describe, expect, it } from "vitest";
import {
  createDefaultRuntimeWorkflowPresetSelection,
  resolveRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";

describe("runtime workflow preset selection", () => {
  it("falls back to the registry default when no runtime manifest is selected", () => {
    expect(
      resolveRuntimeWorkflowPresetSelection({
        runtimeManifest: null
      })
    ).toEqual(createDefaultRuntimeWorkflowPresetSelection());
  });

  it("uses the preset declared by the runtime manifest", () => {
    expect(
      resolveRuntimeWorkflowPresetSelection({
        runtimeManifest: {
          repoRoot: "/tmp/source-repo",
          manifestPath: "/tmp/source-repo/.symphony/runtime.ts",
          manifest: {
            schemaVersion: 1,
            repositoryKey: "openai/symphony",
            linear: {
              teamKey: "SYM"
            },
            workspace: {
              packageManager: "pnpm",
              workingDirectory: "."
            },
            services: {},
            workflow: {
              defaultRouterPreset: "current-flow"
            },
            pi: null,
            env: {
              host: {
                required: [],
                optional: []
              },
              inject: {}
            },
            lifecycle: {
              bootstrap: [],
              migrate: [],
              verify: [
                {
                  name: "verify",
                  run: "pnpm test"
                }
              ],
              seed: [],
              cleanup: []
            }
          }
        }
      })
    ).toEqual({
      presetId: "current-flow",
      source: "runtime_manifest",
      repositoryKey: "openai/symphony",
      manifestPath: "/tmp/source-repo/.symphony/runtime.ts"
    });
  });

  it("fails fast when the runtime manifest requests an unknown preset", () => {
    expect(() =>
      resolveRuntimeWorkflowPresetSelection({
        runtimeManifest: {
          repoRoot: "/tmp/source-repo",
          manifestPath: "/tmp/source-repo/.symphony/runtime.ts",
          manifest: {
            schemaVersion: 1,
            repositoryKey: "openai/symphony",
            linear: {
              teamKey: "SYM"
            },
            workspace: {
              packageManager: "pnpm",
              workingDirectory: "."
            },
            services: {},
            workflow: {
              defaultRouterPreset: "missing"
            },
            pi: null,
            env: {
              host: {
                required: [],
                optional: []
              },
              inject: {}
            },
            lifecycle: {
              bootstrap: [],
              migrate: [],
              verify: [
                {
                  name: "verify",
                  run: "pnpm test"
                }
              ],
              seed: [],
              cleanup: []
            }
          }
        }
      })
    ).toThrow(/selects an invalid workflow preset/i);
  });

  it("accepts alternate built-in workflow presets from the runtime manifest", () => {
    expect(
      resolveRuntimeWorkflowPresetSelection({
        runtimeManifest: {
          repoRoot: "/tmp/source-repo",
          manifestPath: "/tmp/source-repo/.symphony/runtime.ts",
          manifest: {
            schemaVersion: 1,
            repositoryKey: "openai/symphony",
            linear: {
              teamKey: "SYM"
            },
            workspace: {
              packageManager: "pnpm",
              workingDirectory: "."
            },
            services: {},
            workflow: {
              defaultRouterPreset: "auto-merge"
            },
            pi: null,
            env: {
              host: {
                required: [],
                optional: []
              },
              inject: {}
            },
            lifecycle: {
              bootstrap: [],
              migrate: [],
              verify: [
                {
                  name: "verify",
                  run: "pnpm test"
                }
              ],
              seed: [],
              cleanup: []
            }
          }
        }
      })
    ).toEqual({
      presetId: "auto-merge",
      source: "runtime_manifest",
      repositoryKey: "openai/symphony",
      manifestPath: "/tmp/source-repo/.symphony/runtime.ts"
    });
  });
});
