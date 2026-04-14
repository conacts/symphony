import type { SymphonyRuntimeManifestInput } from "@symphony/runtime-contract";

export function buildSymphonyRuntimeManifestInput(
  overrides: Partial<SymphonyRuntimeManifestInput> = {}
): SymphonyRuntimeManifestInput {
  const baseManifest: SymphonyRuntimeManifestInput = {
    schemaVersion: 1,
    repositoryKey: "openai/symphony",
    linear: {
      teamKey: "SYM"
    },
    workspace: {
      packageManager: "pnpm",
      workingDirectory: "."
    },
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
    },
    workflow: {
      defaultRouterPreset: "intelligent-flow"
    }
  };

  return {
    ...baseManifest,
    ...overrides,
    linear: overrides.linear ?? baseManifest.linear,
    workspace: {
      ...baseManifest.workspace,
      ...overrides.workspace
    },
    env: {
      ...baseManifest.env,
      ...overrides.env,
      host: {
        ...baseManifest.env.host,
        ...overrides.env?.host
      },
      inject: overrides.env?.inject ?? baseManifest.env.inject
    },
    lifecycle: {
      ...baseManifest.lifecycle,
      ...overrides.lifecycle
    },
    workflow:
      Object.prototype.hasOwnProperty.call(overrides, "workflow")
        ? overrides.workflow
        : baseManifest.workflow,
    pi: overrides.pi ?? baseManifest.pi,
    services: overrides.services ?? baseManifest.services
  };
}

export function renderSymphonyRuntimeManifestSource(
  manifest: SymphonyRuntimeManifestInput = buildSymphonyRuntimeManifestInput()
): string {
  return `import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime(${JSON.stringify(manifest, null, 2)});
`;
}
