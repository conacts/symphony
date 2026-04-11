import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTempSymphonySqliteHarness,
  renderSymphonyRuntimeManifestSource
} from "@symphony/test-support";
import { createSymphonyIssueStore, initializeSymphonyDb } from "@symphony/db";
import type { WorkflowSignal } from "@symphony/router";
import {
  buildSymphonyTrackerIssue,
  type MemorySymphonyTracker
} from "@symphony/tracker";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";
import {
  applyRuntimeManifestPiPolicy,
  buildWorkspaceBackendPayload,
  loadDefaultSymphonyRuntimeAppServices
} from "./runtime-services.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { loadRuntimeServiceBootstrap } from "./runtime-service-bootstrap.js";
import { resolveDockerWorkspaceAuthContracts } from "./runtime-auth-contract.js";
import { createSymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import {
  buildBootstrapInstallLifecycleEvent,
  createRuntimeDbObserverTestSupport
} from "../test-support/runtime-lifecycle-test-support.js";

const harnesses: SymphonyRuntimeAppServicesHarness[] = [];
const tempDirectories: string[] = [];
const runtimeServicesIntegrationTestTimeoutMs = 15_000;

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime services", () => {
  it(
    "loads the default app services through the explicit prompt and runtime contract",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness({
        startPollScheduler: true,
        startMachineLoadMonitor: true
      });
      harnesses.push(harness);

      const { services, env } = harness;
      const refresh = await services.orchestrator.requestRefresh();

      expect(services.promptTemplate.promptTemplate).toBe("Prompt body\n");
      expect(services.promptContract.promptPath).toContain(".symphony/prompt.md");
      expect(services.runtimePolicy.tracker.kind).toBe("memory");
      expect(refresh).toEqual(
        expect.objectContaining({
          queued: true,
          coalesced: false,
          operations: ["poll", "reconcile"]
        })
      );
      expect(services.health.snapshot()).toEqual(
        expect.objectContaining({
          healthy: true,
          db: {
            file: env.dbFile,
            ready: true
          },
          machineLoad: expect.objectContaining({
            memoryPercent: expect.any(Number)
          } as never)
        } as never)
      );

      await waitFor(() => {
        const poller = services.health.snapshot().poller;
        return poller.lastCompletedAt !== null && poller.inFlight === false;
      });

      const runtimeLogs = await services.runtimeLogs.list();
      const routeWorkflowHydration =
        await services.routeWorkflows.loadHydrationStateByIssueIdentifier(
          "SYM-404"
        );

      expect(runtimeLogs.logs.map((entry) => entry.eventType)).toEqual(
        expect.arrayContaining([
          "db_initialized",
          "tracker_placeholder_active",
          "workspace_backend_selected",
          "poller_started",
          "manual_refresh_queued",
          "poll_started",
          "poll_completed"
        ])
      );
      expect(routeWorkflowHydration).toBeNull();
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it("queries mirrored lifecycle runtime logs by issue identifier through the forensics read model", async () => {
    const harness = await createSymphonyRuntimeTestHarness();
    const repositoryKey = harness.runtimePolicy.github.repo;

    try {
      if (!repositoryKey) {
        throw new TypeError(
          "Runtime test harness requires runtimePolicy.github.repo."
        );
      }

      const { observer } = createRuntimeDbObserverTestSupport({
        dbFile: path.join(harness.root, "symphony.db"),
        repositoryKey
      });

      await observer.recordLifecycleEvent(
        buildBootstrapInstallLifecycleEvent({
          issue: harness.issue,
          recordedAt: "2026-04-09T22:10:00.000Z"
        })
      );

      const bundle = await harness.services.forensics.issueForensicsBundle(
        harness.issue.identifier,
        {
          repo: repositoryKey,
          timelineLimit: 20,
          runtimeLogLimit: 20
        }
      );

      expect(bundle?.runtimeLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            issueIdentifier: harness.issue.identifier,
            runId: null,
            source: "workspace",
            eventType: "workspace_manifest_step_started",
            message: "Manifest lifecycle step bootstrap/install started."
          })
        ])
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("fails fast when the source repo runtime manifest is missing", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: null
    });

    try {
      await expect(
        loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        })
      ).rejects.toThrowError(/Missing Symphony runtime manifest/i);
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails fast when required host env from the runtime manifest is missing", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource(({
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
            required: ["OPENAI_API_KEY"],
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
      }) as never),
      environmentSource: {
        LINEAR_API_KEY: "test-linear-api-key"
      }
    });

    try {
      await expect(
        loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        })
      ).rejects.toThrowError(
        /Required host environment variable OPENAI_API_KEY is missing/i
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("resolves workflow preset selection from the runtime manifest", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource(({
        schemaVersion: 1,
        repositoryKey: "openai/symphony",
        linear: {
          teamKey: "SYM"
        },
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        workflow: {
          defaultRouterPreset: "current-flow"
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
      }) as never)
    });

    try {
      const bootstrap = await loadRuntimeServiceBootstrap({
        env: fixture.env,
        environmentSource: fixture.environmentSource
      });

      expect(bootstrap.workflowPresetSelection).toEqual({
        presetId: "current-flow",
        source: "runtime_manifest",
        repositoryKey: "openai/symphony",
        manifestPath: path.join(fixture.env.sourceRepo!, ".symphony", "runtime.ts")
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("fails fast when the runtime manifest requests an unknown workflow preset", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource(({
        schemaVersion: 1,
        repositoryKey: "openai/symphony",
        linear: {
          teamKey: "SYM"
        },
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        workflow: {
          defaultRouterPreset: "missing"
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
      }) as never)
    });

    try {
      await expect(
        loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        })
      ).rejects.toThrow(/invalid workflow preset/i);
    } finally {
      await fixture.cleanup();
    }
  });

  it("detects when docker-backed runs do not have Pi auth or a provider api key", async () => {
    const fixture = await createRuntimeBootstrapFixture();

    try {
      const bootstrap = await loadRuntimeServiceBootstrap({
        env: fixture.env,
        environmentSource: fixture.environmentSource
      });
      const dockerAuth = resolveDockerWorkspaceAuthContracts({}, {
        preferredApiKeyEnvKey: bootstrap.harnessProviderEnvKey
      });

      expect(dockerAuth.pi.mount).toBeNull();
      expect(dockerAuth.pi.launchEnv).toEqual({});
    } finally {
      await fixture.cleanup();
    }
  });

  it(
    "accepts an OpenRouter api key for the Pi default profile",
    async () => {
      const fixture = await createRuntimeBootstrapFixture({
        environmentSource: {
          LINEAR_API_KEY: "test-linear-api-key",
          SYMPHONY_PI_PROFILE: "mimo-v2-pro"
        }
      });

      try {
        const bootstrap = await loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        });

        expect(bootstrap.runtimePolicy.agent.harness).toBe("pi");
        expect(bootstrap.runtimePolicy.agentRuntime.command).toBe("pi");
        expect(bootstrap.runtimePolicy.pi.profile).toBe("mimo-v2-pro");
        expect(bootstrap.runtimePolicy.pi.defaultModel).toBe(
          "xiaomi/mimo-v2-pro"
        );
        expect(bootstrap.runtimePolicy.pi.defaultReasoningEffort).toBe("high");
        expect(bootstrap.runtimePolicy.pi.provider).toEqual({
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        });
      } finally {
        await fixture.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "loads runtime services with the Pi harness by default",
    async () => {
      const fixture = await createRuntimeBootstrapFixture({
        environmentSource: {
          SYMPHONY_PI_PROFILE: "mimo-v2-pro"
        }
      });

      try {
        const bootstrap = await loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        });

        expect(bootstrap.runtimePolicy.agent.harness).toBe("pi");
        expect(bootstrap.runtimePolicy.agentRuntime.command).toBe("pi");
        expect(bootstrap.runtimePolicy.agentRuntime.readTimeoutMs).toBe(120_000);
        expect(bootstrap.runtimePolicy.pi.profile).toBe("mimo-v2-pro");
        expect(bootstrap.runtimePolicy.pi.defaultModel).toBe(
          "xiaomi/mimo-v2-pro"
        );
        expect(bootstrap.runtimePolicy.pi.provider).toEqual({
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        });
      } finally {
        await fixture.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "selects the admitted repo matching the process Linear scope when multiple repos are admitted",
    async () => {
      const fixture = await createMultiRepoRuntimeBootstrapFixture();

      try {
        const bootstrap = await loadRuntimeServiceBootstrap({
          env: fixture.env,
          environmentSource: fixture.environmentSource
        });
        const runtimeManifest = bootstrap.selectedRuntimeManifestEntry?.runtimeManifest.manifest;

        expect(
          bootstrap.admittedRepositories.map((repository) => repository.repositoryKey)
        ).toEqual(["conacts/symphony", "conacts/coldets-v2"]);
        expect(bootstrap.promptContract.promptPath).toBe(fixture.expectedPromptPath);
        expect(bootstrap.promptTemplate.promptTemplate).toBe("Coldets prompt\n");
        expect(runtimeManifest).not.toBeNull();

        const mergedPolicy = applyRuntimeManifestPiPolicy(
          bootstrap.runtimePolicy,
          runtimeManifest!
        );

        expect(mergedPolicy.pi.defaultPreset).toBe("premium");
        expect(mergedPolicy.pi.presets.premium).toEqual({
          model: "gpt-5.4",
          reasoningEffort: "high",
          authMode: "subscription"
        });
      } finally {
        await fixture.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it("merges repo-defined Pi presets from the runtime manifest into the active policy", async () => {
    const fixture = await createRuntimeBootstrapFixture({
      runtimeManifestSource: renderSymphonyRuntimeManifestSource(({
        schemaVersion: 1,
        repositoryKey: "openai/symphony",
        linear: {
          teamKey: "SYM"
        },
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        workflow: {
          defaultRouterPreset: "current-flow"
        },
        pi: {
          defaultPreset: "basic",
          presets: {
            basic: {
              model: "minimax/minimax-m2.7",
              reasoningEffort: "medium",
              auth: "provider"
            },
            advanced: {
              model: "xiaomi/mimo-v2-pro",
              reasoningEffort: "xhigh",
              auth: "provider"
            },
            premium: {
              model: "gpt-5.4",
              reasoningEffort: "high",
              auth: "subscription"
            }
          }
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
      }) as never),
      environmentSource: {
        SYMPHONY_PI_PROFILE: "mimo-v2-pro"
      }
    });
    try {
      const bootstrap = await loadRuntimeServiceBootstrap({
        env: fixture.env,
        environmentSource: fixture.environmentSource
      });
      const runtimeManifest = bootstrap.selectedRuntimeManifestEntry?.runtimeManifest.manifest;

      expect(runtimeManifest).not.toBeNull();

      const mergedPolicy = applyRuntimeManifestPiPolicy(
        bootstrap.runtimePolicy,
        runtimeManifest!
      );

      expect(mergedPolicy.pi.defaultPreset).toBe("basic");
      expect(mergedPolicy.pi.presets.basic).toEqual({
        model: "minimax/minimax-m2.7",
        reasoningEffort: "medium",
        authMode: "provider"
      });
      expect(mergedPolicy.pi.presets.premium).toEqual({
        model: "gpt-5.4",
        reasoningEffort: "high",
        authMode: "subscription"
      });
      expect(mergedPolicy.pi.defaultModel).toBe("minimax/minimax-m2.7");
      expect(mergedPolicy.agentRuntime.defaultPreset).toBe("basic");
      expect(mergedPolicy.agentRuntime.defaultModel).toBe(
        "minimax/minimax-m2.7"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("builds workspace backend payloads with mounted Pi auth and provider env", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-pi-auth-"));
    tempDirectories.push(root);
    const home = path.join(root, "home");
    await mkdir(path.join(home, ".pi", "agent"), {
      recursive: true
    });
    await writeFile(
      path.join(home, ".pi", "agent", "auth.json"),
      '{"ok":true}\n'
    );

    const dockerAuth = resolveDockerWorkspaceAuthContracts(
      {
        HOME: home,
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      {
        preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
      }
    );

    expect(
      buildWorkspaceBackendPayload({
        workspaceRoot: "/tmp/workspaces",
        metadata: {
          backendKind: "docker"
        },
        dockerGitHubCliAuth: dockerAuth.githubCli,
        dockerLinearLaunchEnv: {
          LINEAR_API_KEY: "test-linear-api-key"
        },
        dockerPiAuth: dockerAuth.pi
      })
    ).toEqual(
      expect.objectContaining({
        backendKind: "docker",
        dockerGitHubCliAuthMode: "none",
        dockerGitHubCliAuthEnvKey: null,
        dockerLinearApiKeyInjected: true,
        dockerPiAuthMounted: true,
        dockerPiProviderEnvKey: "OPENROUTER_API_KEY",
        dockerPiProviderEnvMounted: true
      })
    );
  });

  it("builds workspace backend payloads that prefer GH_TOKEN env injection", () => {
    const dockerAuth = resolveDockerWorkspaceAuthContracts(
      {
        GH_TOKEN: "test-gh-token",
        OPENROUTER_API_KEY: "test-openrouter-api-key"
      },
      {
        preferredApiKeyEnvKey: "OPENROUTER_API_KEY"
      }
    );

    expect(
      buildWorkspaceBackendPayload({
        workspaceRoot: "/tmp/workspaces",
        metadata: {
          backendKind: "docker"
        },
        dockerGitHubCliAuth: dockerAuth.githubCli,
        dockerLinearLaunchEnv: {
          LINEAR_API_KEY: "test-linear-api-key"
        },
        dockerPiAuth: dockerAuth.pi
      })
    ).toEqual(
      expect.objectContaining({
        dockerGitHubCliAuthMode: "env",
        dockerGitHubCliAuthEnvKey: "GH_TOKEN",
        dockerLinearApiKeyInjected: true
      })
    );
  });

  it(
    "reconciles active persisted runs during shutdown",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      const seededAt = new Date().toISOString();
      const seedDb = initializeSymphonyDb({
        dbFile: harness.env.dbFile
      });

      seedDb.client.prepare(`
      insert into symphony_issues (
        issue_identifier, tracker_issue_id, repository_key, latest_run_started_at, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?)
    `).run(
      "COL-SHUTDOWN",
      "issue-shutdown",
      "owner/repo",
      seededAt,
      seededAt,
      seededAt
    );
      seedDb.client.prepare(`
      insert into symphony_runs (
        run_id, repository_key, issue_identifier, attempt, run_mode, status, outcome, worker_host,
        workspace_path, started_at, ended_at, metadata, error_class, error_message, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "run-shutdown",
      "owner/repo",
      "COL-SHUTDOWN",
      1,
      "implementation",
      "running",
      null,
      null,
      "/tmp/workspace",
      seededAt,
      null,
      null,
      null,
      null,
      seededAt,
      seededAt
    );
      seedDb.client.prepare(`
      insert into symphony_turns (
        turn_id, run_id, turn_sequence, thread_id, agent_turn_id,
        prompt_text, status, started_at, ended_at, usage, metadata, inserted_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "turn-shutdown",
      "run-shutdown",
      1,
      "thread-shutdown",
      null,
      "Continue the issue.",
      "running",
      seededAt,
      null,
      null,
      null,
      seededAt,
      seededAt
    );
      seedDb.close();

      await harness.services.shutdown();

      const verifyDb = initializeSymphonyDb({
        dbFile: harness.env.dbFile
      });

      const run = verifyDb.client.prepare(`
      select status, outcome, error_class as errorClass, error_message as errorMessage
      from symphony_runs
      where run_id = ?
    `).get("run-shutdown") as {
      status: string;
      outcome: string | null;
      errorClass: string | null;
      errorMessage: string | null;
    };
      const turn = verifyDb.client.prepare(`
      select status
      from symphony_turns
      where turn_id = ?
    `).get("turn-shutdown") as { status: string };
      expect(run).toEqual(
        expect.objectContaining({
          status: "paused",
          outcome: "runtime_shutdown",
          errorClass: "runtime_shutdown",
          errorMessage: "Symphony runtime shut down while the run was active."
        })
      );
      expect(turn.status).toBe("stopped");

      verifyDb.close();
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "reuses persisted workflow history after runtime services restart for explicit tracker ingress",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      let restartedServices: Awaited<
        ReturnType<typeof loadDefaultSymphonyRuntimeAppServices>
      > | null = null;

      try {
        const issue = buildSymphonyTrackerIssue({
          id: "issue-restart-review",
          identifier: "SYM-RESTART",
          state: "In Review"
        });
        const tracker = harness.services.tracker as MemorySymphonyTracker;
        tracker.setIssues([issue]);

        const firstObservation =
          await harness.services.trackerStateIngress.observeNonRunningIssue({
            issueIdentifier: issue.identifier
          });
        expect(firstObservation).toEqual(
          expect.objectContaining({
            issueIdentifier: issue.identifier,
            trackerState: "In Review",
            observed: true,
            recordedAt: expect.any(String)
          })
        );

        const before =
          await harness.services.routeWorkflows.loadHydrationStateByIssueIdentifier(
            issue.identifier
          );
        const beforeEventSequence = before?.snapshot?.eventSequence ?? null;

        expect(before?.snapshot?.projection.currentNode).toBe("review");
        expect(before?.snapshot?.projection.data).toEqual(
          expect.objectContaining({
            trackerState: "In Review"
          })
        );

        await harness.services.shutdown();

        restartedServices = await loadDefaultSymphonyRuntimeAppServices(
          harness.env,
          harness.environmentSource,
          harness.hostCommandEnvSource,
          {
            startPollScheduler: false,
            startMachineLoadMonitor: false,
            enableDockerPreflight: false
          }
        );
        const restartedTracker = restartedServices.tracker as MemorySymphonyTracker;
        restartedTracker.setIssues([issue]);

        const secondObservation =
          await restartedServices.trackerStateIngress.observeNonRunningIssue({
            issueIdentifier: issue.identifier
          });
        expect(secondObservation).toEqual(
          expect.objectContaining({
            issueIdentifier: issue.identifier,
            trackerState: "In Review",
            observed: false,
            recordedAt: expect.any(String)
          })
        );

        const after =
          await restartedServices.routeWorkflows.loadHydrationStateByIssueIdentifier(
            issue.identifier
          );
        expect(after?.snapshot?.eventSequence ?? null).toBe(beforeEventSequence);
        expect(after?.snapshot?.projection.currentNode).toBe("review");

        const runtimeLogs = await restartedServices.runtimeLogs.list({
          issueIdentifier: issue.identifier
        });
        expect(runtimeLogs.logs.map((entry) => entry.eventType)).toEqual(
          expect.arrayContaining(["tracker_state_ingress_skipped"])
        );
      } finally {
        await restartedServices?.shutdown();
        await harness.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "continues approved merge workflow routing after runtime services restart",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      let restartedServices: Awaited<
        ReturnType<typeof loadDefaultSymphonyRuntimeAppServices>
      > | null = null;

      try {
        const repositoryKey = harness.services.runtimePolicy.github.repo;
        if (!repositoryKey) {
          throw new TypeError(
            "Runtime services restart proof requires runtimePolicy.github.repo."
          );
        }

        const issue = buildSymphonyTrackerIssue({
          id: "issue-restart-merge",
          identifier: "SYM-MERGE",
          state: "Approved"
        });
        const approvedRunId = "run-approved-merge-1";
        const tracker = harness.services.tracker as MemorySymphonyTracker;
        tracker.setIssues([issue]);

        await seedCurrentFlowWorkflowHistory({
          services: harness.services,
          trackerConfig: harness.services.runtimePolicy.tracker,
          repositoryKey,
          issueIdentifier: issue.identifier,
          trackerIssueId: issue.id,
          dbFile: harness.env.dbFile,
          createdAt: "2026-04-10T18:00:00.000Z",
          signals: [
            {
              id: "signal_tracker_approved_observed",
              signal: (routing) =>
                routing.module.runtimeAdapter.createTrackerStateObservedSignal({
                  id: "signal_tracker_approved_observed",
                  occurredAt: "2026-04-10T18:00:00.000Z",
                  trackerState: "Approved",
                  runId: null,
                  runMode: null,
                  causationId: issue.identifier,
                  correlationId: issue.identifier
                })
            },
            {
              id: "signal_approved_merge_started",
              signal: (routing) =>
                routing.module.runtimeAdapter.createRunStartedSignal({
                  id: "signal_approved_merge_started",
                  occurredAt: "2026-04-10T18:00:01.000Z",
                  runId: approvedRunId,
                  runMode: "approved_merge",
                  causationId: approvedRunId,
                  correlationId: issue.identifier
                })
            }
          ]
        });

        const before =
          await harness.services.routeWorkflows.loadHydrationStateByIssueIdentifier(
            issue.identifier
          );
        expect(before?.snapshot?.projection.currentNode).toBe("approved_merge");
        expect(before?.snapshot?.projection.data).toEqual(
          expect.objectContaining({
            trackerState: "In Progress",
            lastObservedTrackerState: "Approved",
            lastDispatchMode: "approved_merge",
            lastRunMode: "approved_merge"
          })
        );

        await harness.services.shutdown();

        restartedServices = await loadDefaultSymphonyRuntimeAppServices(
          harness.env,
          harness.environmentSource,
          harness.hostCommandEnvSource,
          {
            startPollScheduler: false,
            startMachineLoadMonitor: false,
            enableDockerPreflight: false
          }
        );
        const restartedTracker = restartedServices.tracker as MemorySymphonyTracker;
        restartedTracker.setIssues([issue]);

        const result = await restartedServices.runtimeTools.submitMergeResult({
          runId: approvedRunId,
          turnId: null,
          issue: {
            trackerIssueId: issue.id,
            identifier: issue.identifier,
            state: issue.state
          },
          argumentsPayload: {
            status: "merged",
            summary: "Merged after restart.",
            prUrl: "https://github.com/openai/symphony/pull/42",
            mergeCommitSha: "abc123",
            blockingReason: null,
            testsSummary: "pnpm --filter @symphony/api test"
          }
        });

        expect(result.success).toBe(true);

        const after =
          await restartedServices.routeWorkflows.loadHydrationStateByIssueIdentifier(
            issue.identifier
          );
        expect(after?.snapshot?.projection.currentNode).toBe("done");
        expect(after?.snapshot?.projection.data).toEqual(
          expect.objectContaining({
            trackerState: "Done",
            latestMergeResult: {
              runId: approvedRunId,
              status: "merged",
              summary: "Merged after restart.",
              prUrl: "https://github.com/openai/symphony/pull/42",
              mergeCommitSha: "abc123",
              blockingReason: null,
              testsSummary: "pnpm --filter @symphony/api test",
              recordedAt: expect.any(String)
            }
          })
        );
        expect(restartedTracker.getIssue(issue.id)?.state).toBe("Done");
      } finally {
        await restartedServices?.shutdown();
        await harness.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );

  it(
    "exposes workflow comparison through runtime services",
    async () => {
      const harness = await createSymphonyRuntimeAppServicesHarness();
      harnesses.push(harness);

      try {
        const repositoryKey = harness.services.runtimePolicy.github.repo;
        if (!repositoryKey) {
          throw new TypeError(
            "Runtime workflow comparison service test requires runtimePolicy.github.repo."
          );
        }

        const issue = buildSymphonyTrackerIssue({
          id: "issue-compare-flow",
          identifier: "SYM-COMPARE",
          state: "Todo"
        });
        const tracker = harness.services.tracker as MemorySymphonyTracker;
        tracker.setIssues([issue]);

        await seedCurrentFlowWorkflowHistory({
          services: harness.services,
          trackerConfig: harness.services.runtimePolicy.tracker,
          repositoryKey,
          issueIdentifier: issue.identifier,
          trackerIssueId: issue.id,
          dbFile: harness.env.dbFile,
          createdAt: "2026-04-11T12:00:00.000Z",
          signals: [
            {
              id: "signal_todo_observed",
              signal: (routing) =>
                routing.module.runtimeAdapter.createTrackerStateObservedSignal({
                  id: "signal_todo_observed",
                  occurredAt: "2026-04-11T12:01:00.000Z",
                  trackerState: "Todo",
                  runId: null,
                  runMode: null,
                  causationId: null,
                  correlationId: null
                })
            },
            {
              id: "signal_implementation_started",
              signal: (routing) =>
                routing.module.runtimeAdapter.createRunStartedSignal({
                  id: "signal_implementation_started",
                  occurredAt: "2026-04-11T12:01:10.000Z",
                  runId: "run-compare-1",
                  runMode: "implementation",
                  causationId: null,
                  correlationId: null
                })
            },
            {
              id: "signal_delivery_completed",
              signal: (routing) =>
                routing.module.runtimeAdapter.createDeliveryReportedSignal({
                  id: "signal_delivery_completed",
                  occurredAt: "2026-04-11T12:01:20.000Z",
                  runId: "run-compare-1",
                  status: "completed",
                  causationId: null,
                  correlationId: null
                })
            }
          ]
        });

        const comparison =
          await harness.services.workflowComparison.compareByIssueIdentifier({
            issueIdentifier: issue.identifier,
            presetIds: ["current-flow", "auto-merge"]
          });

        expect(comparison?.replay.workflow.issueIdentifier).toBe(issue.identifier);
        expect(comparison?.comparedPresetIds).toEqual([
          "current-flow",
          "auto-merge"
        ]);
        expect(comparison?.comparison.summary.diverged).toBe(true);
        expect(comparison?.comparison.summary.finalNodeByCandidate).toEqual({
          "current-flow": "review",
          "auto-merge": "approved_merge"
        });
      } finally {
        await harness.cleanup();
      }
    },
    runtimeServicesIntegrationTestTimeoutMs
  );
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for runtime services to settle.");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

async function createRuntimeBootstrapFixture(input: {
  env?: Partial<SymphonyRuntimeAppEnv>;
  environmentSource?: Record<string, string | undefined>;
  promptTemplate?: string;
  rootPrefix?: string;
  runtimeManifestSource?: string | null;
} = {}): Promise<{
  cleanup(): Promise<void>;
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
}> {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: input.rootPrefix ?? "symphony-runtime-bootstrap-"
  });
  const root = sqlite.root;
  const workspaceRoot = path.join(root, "workspaces");
  const sourceRepo = path.join(root, "source-repo");
  const promptPath = path.join(sourceRepo, ".symphony", "prompt.md");

  await mkdir(workspaceRoot, {
    recursive: true
  });

  const env = {
    port: 4_400,
    dbFile: sqlite.dbFile,
    sourceRepo,
    sourceRepos: [sourceRepo],
    dockerWorkspaceImage: null,
    dockerMaterializationMode: "bind_mount" as const,
    dockerWorkspacePath: null,
    dockerContainerNamePrefix: null,
    dockerShell: null,
    dockerGitUserName: null,
    dockerGitUserEmail: null,
    dockerSharedPostgresContainerName: "symphony-shared-postgres",
    dockerSharedPostgresImage: "postgres:16",
    dockerSharedPostgresHost: "host.docker.internal",
    dockerSharedPostgresHostPort: 55_432,
    dockerSharedPostgresContainerPort: 5_432,
    dockerSharedPostgresAdminDatabase: "postgres",
    dockerSharedPostgresAdminUsername: "postgres",
    dockerSharedPostgresAdminPassword: "postgres",
    dockerSharedPostgresDatabasePrefix: "symphony",
    dockerSharedPostgresRolePrefix: "symphony",
    allowedOrigins: [],
    linearApiKey: "test-linear-api-key",
    logLevel: "error",
    ...input.env
  } satisfies SymphonyRuntimeAppEnv;

  if (env.sourceRepo) {
    await mkdir(path.join(env.sourceRepo, ".symphony"), {
      recursive: true
    });
    await writeFile(promptPath, `${input.promptTemplate ?? "Prompt body"}\n`);

    if (input.runtimeManifestSource !== null) {
      await writeFile(
        path.join(env.sourceRepo, ".symphony", "runtime.ts"),
        input.runtimeManifestSource ?? renderSymphonyRuntimeManifestSource()
      );
    }
  }

  const environmentSource = {
    LINEAR_API_KEY: env.linearApiKey,
    SYMPHONY_SOURCE_REPO: env.sourceRepo ?? undefined,
    SYMPHONY_SOURCE_REPOS:
      env.sourceRepos.length > 0 ? env.sourceRepos.join(",") : undefined,
    SYMPHONY_TRACKER_KIND: "memory",
    SYMPHONY_WORKSPACE_ROOT: workspaceRoot,
    SYMPHONY_POLL_INTERVAL_MS: "50",
    SYMPHONY_GITHUB_REPOSITORY: "openai/symphony",
    SYMPHONY_GITHUB_WEBHOOK_SECRET: "secret",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_LOGINS: "reviewer",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_COMMENT_LOGINS: "",
    SYMPHONY_GITHUB_ALLOWED_REWORK_LOGINS: "reviewer",
    ...input.environmentSource
  };

  return {
    env,
    environmentSource,
    async cleanup() {
      await rm(root, {
        recursive: true,
        force: true
      });
    }
  };
}

async function seedCurrentFlowWorkflowHistory(input: {
  services: Awaited<ReturnType<typeof loadDefaultSymphonyRuntimeAppServices>>;
  trackerConfig: SymphonyRuntimeAppServicesHarness["services"]["runtimePolicy"]["tracker"];
  repositoryKey: string;
  issueIdentifier: string;
  trackerIssueId: string;
  dbFile: string;
  createdAt: string;
  signals: Array<{
    id: string;
    signal(
      routing: Awaited<ReturnType<typeof createRuntimeCurrentFlowRouting>>
    ): WorkflowSignal;
  }>;
}): Promise<void> {
  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: input.trackerConfig,
    now: () => new Date(input.createdAt)
  });
  const database = initializeSymphonyDb({
    dbFile: input.dbFile
  });

  try {
    const issueStore = createSymphonyIssueStore(database.db);
    await issueStore.upsert({
      issueIdentifier: input.issueIdentifier,
      trackerIssueId: input.trackerIssueId,
      repositoryKey: input.repositoryKey,
      latestRunStartedAt: null,
      recordedAt: "2026-04-09T23:59:00.000Z"
    });

    await input.services.routeWorkflows.ensureWorkflowForIssue({
      issueIdentifier: input.issueIdentifier,
      repositoryKey: input.repositoryKey,
      routerPresetId: routing.presetId,
      router: routing.router,
      createdAt: input.createdAt
    });

    for (const entry of input.signals) {
      const resumed =
        await input.services.routeWorkflows.resumeSessionByIssueIdentifier({
          issueIdentifier: input.issueIdentifier,
          router: routing.router,
          policy: routing.policy
        });
      if (!resumed) {
        throw new TypeError(
          `Route workflow could not be resumed for ${input.issueIdentifier} while recording ${entry.id}.`
        );
      }

      await input.services.routeWorkflows.recordRouteResult({
        workflowId: resumed.hydrationState.workflow.workflowId,
        policy: routing.policy,
        result: await resumed.session.receiveAsync(entry.signal(routing))
      });
    }
  } finally {
    database.close();
  }
}

async function createMultiRepoRuntimeBootstrapFixture(): Promise<{
  cleanup(): Promise<void>;
  env: SymphonyRuntimeAppEnv;
  environmentSource: Record<string, string | undefined>;
  expectedPromptPath: string;
}> {
  const sqlite = await createTempSymphonySqliteHarness({
    rootPrefix: "symphony-runtime-services-multi-repo-"
  });
  const root = sqlite.root;
  const workspaceRoot = path.join(root, "workspaces");
  const symphonyRepo = path.join(root, "symphony");
  const coldetsRepo = path.join(root, "coldets");

  await mkdir(workspaceRoot, {
    recursive: true
  });
  await writeRuntimeRepositoryFixture({
    repoRoot: symphonyRepo,
    prompt: "Symphony prompt\n",
    manifest: buildRuntimeManifest({
      repositoryKey: "conacts/symphony",
      teamKey: "SYM",
      defaultPreset: "basic",
      premiumModel: "gpt-4.1"
    })
  });
  await writeRuntimeRepositoryFixture({
    repoRoot: coldetsRepo,
    prompt: "Coldets prompt\n",
    manifest: buildRuntimeManifest({
      repositoryKey: "conacts/coldets-v2",
      teamKey: "COL",
      defaultPreset: "premium",
      premiumModel: "gpt-5.4"
    })
  });

  const env = {
    port: 4_400,
    dbFile: sqlite.dbFile,
    sourceRepo: symphonyRepo,
    sourceRepos: [symphonyRepo, coldetsRepo],
    dockerWorkspaceImage: null,
    dockerMaterializationMode: "bind_mount" as const,
    dockerWorkspacePath: null,
    dockerContainerNamePrefix: null,
    dockerShell: null,
    dockerGitUserName: null,
    dockerGitUserEmail: null,
    dockerSharedPostgresContainerName: "symphony-shared-postgres",
    dockerSharedPostgresImage: "postgres:16",
    dockerSharedPostgresHost: "host.docker.internal",
    dockerSharedPostgresHostPort: 55_432,
    dockerSharedPostgresContainerPort: 5_432,
    dockerSharedPostgresAdminDatabase: "postgres",
    dockerSharedPostgresAdminUsername: "postgres",
    dockerSharedPostgresAdminPassword: "postgres",
    dockerSharedPostgresDatabasePrefix: "symphony",
    dockerSharedPostgresRolePrefix: "symphony",
    allowedOrigins: [],
    linearApiKey: "test-linear-api-key",
    logLevel: "error"
  } satisfies SymphonyRuntimeAppEnv;
  const environmentSource = {
    LINEAR_API_KEY: env.linearApiKey,
    SYMPHONY_SOURCE_REPO: env.sourceRepo ?? undefined,
    SYMPHONY_SOURCE_REPOS: env.sourceRepos.join(","),
    SYMPHONY_TRACKER_KIND: "linear",
    SYMPHONY_LINEAR_TEAM_KEY: "COL",
    SYMPHONY_WORKSPACE_ROOT: workspaceRoot,
    SYMPHONY_POLL_INTERVAL_MS: "50",
    SYMPHONY_GITHUB_REPOSITORY: "conacts/coldets-v2",
    SYMPHONY_GITHUB_WEBHOOK_SECRET: "secret",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_LOGINS: "reviewer",
    SYMPHONY_GITHUB_ALLOWED_REVIEW_COMMENT_LOGINS: "",
    SYMPHONY_GITHUB_ALLOWED_REWORK_LOGINS: "reviewer"
  };

  return {
    env,
    environmentSource,
    expectedPromptPath: path.join(coldetsRepo, ".symphony", "prompt.md"),
    async cleanup() {
      await sqlite.cleanup();
    }
  };
}

async function writeRuntimeRepositoryFixture(input: {
  repoRoot: string;
  prompt: string;
  manifest: string;
}): Promise<void> {
  await mkdir(path.join(input.repoRoot, ".symphony"), {
    recursive: true
  });
  await writeFile(path.join(input.repoRoot, ".symphony", "prompt.md"), input.prompt);
  await writeFile(path.join(input.repoRoot, ".symphony", "runtime.ts"), input.manifest);
}

function buildRuntimeManifest(input: {
  repositoryKey: string;
  teamKey: string;
  defaultPreset: "basic" | "premium";
  premiumModel: string;
}): string {
  return renderSymphonyRuntimeManifestSource({
    schemaVersion: 1,
    repositoryKey: input.repositoryKey,
    linear: {
      teamKey: input.teamKey
    },
    workspace: {
      packageManager: "pnpm",
      workingDirectory: "."
    },
    workflow: {
      defaultRouterPreset: "current-flow"
    },
    pi: {
      defaultPreset: input.defaultPreset,
      presets: {
        basic: {
          model: "minimax/minimax-m2.7",
          reasoningEffort: "medium",
          auth: "provider"
        },
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          auth: "provider"
        },
        premium: {
          model: input.premiumModel,
          reasoningEffort: "high",
          auth: "subscription"
        }
      }
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
  });
}
