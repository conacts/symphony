import type { SymphonyRuntimeManifestInput } from "@symphony/core/runtime-manifest";

export function buildSymphonyRuntimeManifestInput(
  overrides: Partial<SymphonyRuntimeManifestInput> = {}
): SymphonyRuntimeManifestInput {
  const baseManifest: SymphonyRuntimeManifestInput = {
    schemaVersion: 1,
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
    }
  };

  return {
    ...baseManifest,
    ...overrides,
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
      ...(overrides.env?.repo ? { repo: overrides.env.repo } : {}),
      inject: overrides.env?.inject ?? baseManifest.env.inject
    },
    lifecycle: {
      ...baseManifest.lifecycle,
      ...overrides.lifecycle
    },
    services: overrides.services ?? baseManifest.services
  };
}

export function renderSymphonyRuntimeManifestSource(
  manifest: SymphonyRuntimeManifestInput = buildSymphonyRuntimeManifestInput()
): string {
  return `import { defineSymphonyRuntime } from "@symphony/core/runtime-manifest";

export default defineSymphonyRuntime(${JSON.stringify(manifest, null, 2)});
`;
}
