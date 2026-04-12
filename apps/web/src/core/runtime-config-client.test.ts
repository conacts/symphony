import { describe, expect, it, vi } from "vitest";
import { fetchRuntimeConfig } from "./runtime-config-client";

describe("runtime config client", () => {
  it("loads the typed runtime config snapshot", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "1",
        ok: true,
        meta: {
          durationMs: 0,
          generatedAt: "2026-04-12T00:00:00.000Z"
        },
        data: {
          runtime: {
            repositoryKey: "openai/symphony",
            githubRepository: "openai/symphony",
            trackerKind: "linear",
            trackerTeamKey: "COL",
            agentHarness: "pi",
            workspaceRoot: "/tmp/symphony-workspaces"
          },
          credentials: {
            linearApiKeyConfigured: true,
            githubCliAuthMode: "env",
            githubCliAuthEnvKey: "GITHUB_TOKEN",
            piAuthMode: "provider_env",
            piProviderEnvKey: "OPENAI_API_KEY"
          },
          bootstrap: {
            kind: "workflow_binding",
            repositorySource: {
              kind: "admitted_source_repositories",
              source: "environment",
              sourceRepos: ["/Users/example/symphony"]
            },
            defaultRepositoryKey: "openai/symphony",
            manifestPath: "/Users/example/symphony/.symphony/runtime.ts",
            bindingScope: null,
            presetSelection: {
              presetId: "current-flow",
              source: "runtime_manifest",
              repositoryKey: "openai/symphony",
              manifestPath: "/Users/example/symphony/.symphony/runtime.ts"
            }
          },
          admittedRepositories: [
            {
              repositoryKey: "openai/symphony",
              repoRoot: "/Users/example/symphony",
              linearTeamKey: "COL",
              manifestPath: "/Users/example/symphony/.symphony/runtime.ts",
              promptPath: "/Users/example/symphony/.symphony/prompt.md"
            }
          ],
          bindingCatalog: null
        }
      })
    } as Response);

    const result = await fetchRuntimeConfig("https://runtime.symphony.local", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://runtime.symphony.local/api/v1/runtime/config",
      expect.objectContaining({
        cache: "no-store"
      })
    );
    expect(result.bootstrap.presetSelection.presetId).toBe("current-flow");
    expect(result.admittedRepositories[0]?.repositoryKey).toBe("openai/symphony");
  });
});
