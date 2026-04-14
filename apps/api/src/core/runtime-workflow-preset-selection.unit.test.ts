import { describe, expect, it } from "vitest";
import {
  createDefaultRuntimeWorkflowPresetSelection,
  resolveRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";

describe("runtime workflow preset selection", () => {
  it("uses intelligent-flow as the registry default", () => {
    expect(createDefaultRuntimeWorkflowPresetSelection()).toEqual({
      presetId: "intelligent-flow",
      source: "registry_default",
      repositoryKey: null,
      manifestPath: null
    });
  });

  it("fails fast when no runtime manifest is selected", () => {
    expect(() =>
      resolveRuntimeWorkflowPresetSelection({
        runtimeManifest: null
      })
    ).toThrow(/requires a runtime manifest/i);
  });

  it("fails fast when the runtime manifest does not define workflow configuration", () => {
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
            workflow: null,
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
    ).toThrow(/does not define workflow configuration/i);
  });

  it("rejects current-flow in the live runtime manifest", () => {
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
    ).toThrow(/does not support workflow preset "current-flow"/i);
  });

  it("prefers an explicit bootstrap preset override over the runtime manifest", () => {
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
              defaultRouterPreset: "intelligent-flow"
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
        },
        overridePresetId: "auto-merge"
      })
    ).toEqual({
      presetId: "auto-merge",
      source: "bootstrap_override",
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

  it("fails fast when the bootstrap override requests an unknown preset", () => {
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
              defaultRouterPreset: "intelligent-flow"
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
        },
        overridePresetId: "missing"
      })
    ).toThrow(/bootstrap requested an invalid workflow preset/i);
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

  it("rejects current-flow bootstrap overrides in the live runtime", () => {
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
        },
        overridePresetId: "current-flow"
      })
    ).toThrow(/does not support workflow preset "current-flow"/i);
  });
});
