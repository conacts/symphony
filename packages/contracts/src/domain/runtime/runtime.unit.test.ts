import { describe, expect, it } from "vitest";
import {
  symphonyRuntimeClarificationAnswerRequestSchema,
  symphonyRuntimeClarificationAnswerResponseSchema,
  symphonyRuntimeConfigResponseSchema,
  symphonyRuntimeIssuePathSchema,
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshRequestSchema,
  symphonyRuntimeRefreshResponseSchema,
  symphonyRuntimeStateResponseSchema,
  symphonyRuntimeTrackerStateObservationResponseSchema,
  symphonyRuntimeWorkflowObservabilityQuerySchema,
  symphonyRuntimeWorkflowObservabilityResponseSchema,
  symphonyRuntimeWorkflowPathSchema
} from "./index.js";

describe("symphony runtime contracts", () => {
  it("parses the runtime state envelope", () => {
    const parsed = symphonyRuntimeStateResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        counts: { running: 1, retrying: 1 },
        running: [
          {
            trackerIssueId: "issue-1",
            issueIdentifier: "COL-157",
            state: "In Progress",
            workerHost: "docker-host",
            workspacePath: "/tmp/COL-157",
            threadId: "thread-1",
            workspace: {
              backendKind: "docker",
              workerHost: "docker-host",
              prepareDisposition: "reused",
              executionTargetKind: "container",
              materializationKind: "bind_mount",
              hostRepoMetadataAvailable: true,
              containerDisposition: "reused",
              networkDisposition: "reused",
              hostPath: "/tmp/COL-157",
              runtimePath: "/workspace",
              containerId: "container-157",
              containerName: "symphony-col-157",
              networkName: "symphony-network-col-157",
              services: [],
              envBundleSummary: {
                source: "ambient",
                injectedKeys: ["LINEAR_API_KEY"],
                requiredHostKeys: [],
                optionalHostKeys: [],
                repoEnvPath: null,
                projectedRepoKeys: [],
                requiredRepoKeys: [],
                optionalRepoKeys: [],
                staticBindingKeys: [],
                runtimeBindingKeys: [],
                serviceBindingKeys: []
              },
              manifestLifecycle: {
                phases: [
                  {
                    phase: "verify",
                    status: "completed",
                    trigger: "readiness_lifetime",
                    startedAt: "2026-03-31T00:00:00.000Z",
                    endedAt: "2026-03-31T00:00:01.000Z",
                    skipReason: null,
                    failureReason: null,
                    steps: [
                      {
                        phase: "verify",
                        name: "verify",
                        command: "pnpm test:smoke",
                        cwd: "/tmp/COL-157",
                        timeoutMs: 1_000,
                        status: "completed",
                        startedAt: "2026-03-31T00:00:00.000Z",
                        endedAt: "2026-03-31T00:00:01.000Z",
                        failureReason: null
                      }
                    ]
                  }
                ]
              },
              path: null,
              executionTarget: {
                kind: "container",
                workspacePath: "/workspace",
                containerId: "container-157",
                containerName: "symphony-col-157",
                hostPath: "/tmp/COL-157",
                user: "1000:1000"
              },
              materialization: {
                kind: "bind_mount",
                hostPath: "/tmp/COL-157",
                containerPath: "/workspace"
              }
            },
            launchTarget: {
              kind: "container",
              hostLaunchPath: "/tmp/COL-157",
              hostWorkspacePath: "/tmp/COL-157",
              runtimeWorkspacePath: "/workspace",
              containerId: "container-157",
              containerName: "symphony-col-157",
              shell: "sh",
              user: "1000:1000"
            },
            turnCount: 3,
            lastEvent: "notification",
            lastMessage: "Working on tests",
            startedAt: "2026-03-31T00:00:00.000Z",
            lastEventAt: "2026-03-31T00:00:01.000Z",
            tokens: {
              inputTokens: 1,
              outputTokens: 2,
              totalTokens: 3
            }
          }
        ],
        retrying: [
          {
            trackerIssueId: "issue-2",
            issueIdentifier: "COL-158",
            attempt: 2,
            dueAt: "2026-03-31T00:00:05.000Z",
            error: "no available orchestrator slots",
            workerHost: null,
            workspacePath: null,
            workspace: null,
            launchTarget: null
          }
        ],
        agentTotals: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          secondsRunning: 45
        },
        rateLimits: {
          primary: {
            remaining: 10
          }
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the runtime issue detail envelope", () => {
    const parsed = symphonyRuntimeIssueResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 2,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-157",
        trackerIssueId: "issue-1",
        status: "running",
        workspace: {
          backendKind: "docker",
          workerHost: "docker-host",
          prepareDisposition: "reused",
          executionTargetKind: "container",
          materializationKind: "bind_mount",
          hostRepoMetadataAvailable: true,
          containerDisposition: "reused",
          networkDisposition: "reused",
          hostPath: "/tmp/COL-157",
          runtimePath: "/workspace",
          containerId: "container-157",
          containerName: "symphony-col-157",
          networkName: "symphony-network-col-157",
          services: [],
          envBundleSummary: {
            source: "ambient",
            injectedKeys: ["LINEAR_API_KEY"],
            requiredHostKeys: [],
            optionalHostKeys: [],
            repoEnvPath: null,
            projectedRepoKeys: [],
            requiredRepoKeys: [],
            optionalRepoKeys: [],
            staticBindingKeys: [],
            runtimeBindingKeys: [],
            serviceBindingKeys: []
          },
          manifestLifecycle: {
            phases: [
              {
                phase: "verify",
                status: "completed",
                trigger: "readiness_lifetime",
                startedAt: "2026-03-31T00:00:00.000Z",
                endedAt: "2026-03-31T00:00:01.000Z",
                skipReason: null,
                failureReason: null,
                steps: [
                  {
                    phase: "verify",
                    name: "verify",
                    command: "pnpm test:smoke",
                    cwd: "/tmp/COL-157",
                    timeoutMs: 1_000,
                    status: "completed",
                    startedAt: "2026-03-31T00:00:00.000Z",
                    endedAt: "2026-03-31T00:00:01.000Z",
                    failureReason: null
                  }
                ]
              }
            ]
          },
          path: null,
          executionTarget: {
            kind: "container",
            workspacePath: "/workspace",
            containerId: "container-157",
            containerName: "symphony-col-157",
            hostPath: "/tmp/COL-157",
            user: "1000:1000"
          },
          materialization: {
            kind: "bind_mount",
            hostPath: "/tmp/COL-157",
            containerPath: "/workspace"
          }
        },
        attempts: {
          restartCount: 0,
          currentRetryAttempt: 0
        },
        running: {
          workerHost: "docker-host",
          workspacePath: "/tmp/COL-157",
          threadId: "thread-1",
          launchTarget: {
            kind: "container",
            hostLaunchPath: "/tmp/COL-157",
            hostWorkspacePath: "/tmp/COL-157",
            runtimeWorkspacePath: "/workspace",
            containerId: "container-157",
            containerName: "symphony-col-157",
            shell: "sh",
            user: "1000:1000"
          },
          turnCount: 3,
          state: "In Progress",
          startedAt: "2026-03-31T00:00:00.000Z",
          lastEvent: "notification",
          lastMessage: "Working on tests",
          lastEventAt: "2026-03-31T00:00:01.000Z",
          tokens: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3
          }
        },
        retry: null,
        lastError: null,
        tracked: {
          title: "Rebuild the runtime summary",
          state: "In Progress",
          branchName: "symphony/COL-157",
          url: "https://linear.app/coldets/issue/COL-157/runtime-summary",
          projectName: "Symphony",
          teamKey: "COL"
        },
        operator: {
          refreshPath: "/api/v1/refresh",
          refreshDelegatesTo: ["poll", "reconcile"],
          githubPullRequestSearchUrl:
            "https://github.com/openai/symphony/pulls?q=is%3Apr+head%3Asymphony%2FCOL-157",
          pi: {
            defaultModel: "xiaomi/mimo-v2-pro",
            selectedModel: "xiaomi/mimo-v2-pro",
            availableModels: [
              "xiaomi/mimo-v2-pro",
              "gpt-5.4",
              "gpt-5.4-mini"
            ],
            modelOverrideLabelPrefix: "model:",
            selectionHelpText:
              "Pi selection is label-driven. Use model:<preset> for repo-defined tiers or model:<model> for a direct model override."
          },
          pendingClarification: null,
          capability: null
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the workflow observability path and query", () => {
    const path = symphonyRuntimeWorkflowPathSchema.parse({
      workflowId: "workflow-420"
    });
    const query = symphonyRuntimeWorkflowObservabilityQuerySchema.parse({
      historyLimit: "50",
      decisionLimit: "10"
    });

    expect(path.workflowId).toBe("workflow-420");
    expect(query.historyLimit).toBe(50);
    expect(query.decisionLimit).toBe(10);
  });

  it("parses the workflow observability envelope", () => {
    const parsed = symphonyRuntimeWorkflowObservabilityResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 3,
        generatedAt: "2026-04-13T20:00:00.000Z"
      },
      data: {
        workflow: {
          workflowId: "workflow-420",
          trackerIssueId: "issue-420",
          repositoryKey: "openai/symphony",
          issueIdentifier: "SYM-420",
          bindingScope: null,
          routerPresetId: "intelligent-flow",
          routerName: "symphony-intelligent-flow",
          routerVersion: "1",
          archivedAt: null,
          insertedAt: "2026-04-13T19:00:00.000Z",
          updatedAt: "2026-04-13T19:30:00.000Z"
        },
        trackerState: "In Progress",
        pendingClarification: null,
        capability: {
          workflowId: "workflow-420",
          contractId: "contract-420",
          policyId: "default",
          planKind: "execute",
          summary: "Next capability execution is implement.spec.",
          decidedAt: "2026-04-13T19:30:00.000Z",
          capabilityId: "implement.spec",
          modelProfileId: "builder_fast",
          workEpoch: 2,
          pendingClarification: null,
          completion: null
        },
        snapshot: {
          eventSequence: 6,
          currentNode: "active",
          terminal: false,
          lastSignalId: "signal-6",
          lastDecisionId: "decision-3",
          pendingCommandCount: 1,
          projection: {
            currentNode: "active",
            terminal: false,
            pendingCommands: [
              {
                id: "command-1",
                kind: "dispatch.implementation",
                payload: {
                  issueIdentifier: "SYM-420"
                },
                dedupeKey: null
              }
            ]
          }
        },
        replay: {
          recordedEventCount: 6,
          recordedSignalCount: 2,
          recordedDecisionCount: 2,
          recordedCommandCount: 1,
          settledCommandCount: 1,
          signals: [
            {
              id: "signal-1",
              type: "tracker.state_observed",
              source: "tracker",
              occurredAt: "2026-04-13T19:00:01.000Z",
              causationId: null,
              correlationId: null,
              payload: {
                trackerState: "Todo"
              }
            }
          ]
        },
        routerDecision: null,
        currentModule: {
          executionId: null,
          module: {
            moduleId: "implement.spec",
            phase: "implementing",
            executionKind: "agent",
            summary: "Implement the requested ticket slice.",
            description:
              "Produces the canonical change set for the current work epoch.",
            enabledByDefault: true,
            runtimeSupported: true,
            supportedModelProfileIds: ["builder_fast", "builder_deep"],
            producesEvidenceIds: ["change_set"],
            requiresEvidenceIds: []
          },
          workEpoch: 2,
          attempt: null,
          state: "selected",
          summary: "Next capability execution is implement.spec.",
          modelProfileId: "builder_fast",
          selectedAt: "2026-04-13T19:30:00.000Z",
          startedAt: null,
          completedAt: null,
          retryable: null,
          reasonCode: null,
          failureKind: null,
          evidenceProduced: [],
          decision: null
        },
        recentModuleRuns: [],
        history: [
          {
            eventId: "event-1",
            eventSequence: 1,
            kind: "signal_recorded",
            recordedAt: "2026-04-13T19:00:01.000Z",
            signalId: "signal-1",
            signalType: "tracker.state_observed",
            signalSource: "tracker",
            decisionId: null,
            commandId: null,
            fromNode: null,
            toNode: null,
            edgeId: null,
            reasonCode: null,
            event: {
              kind: "signal_recorded",
              recordedAt: "2026-04-13T19:00:01.000Z",
              signal: {
                id: "signal-1",
                type: "tracker.state_observed",
                source: "tracker",
                occurredAt: "2026-04-13T19:00:01.000Z",
                causationId: null,
                correlationId: null,
                payload: {
                  trackerState: "Todo"
                }
              }
            }
          }
        ],
        decisions: [
          {
            decisionId: "decision-3",
            eventSequence: 6,
            signalId: "signal-6",
            fromNode: "bootstrapping",
            toNode: "implementation",
            edgeId: "bootstrapping_to_implementation",
            reasonCode: "dispatch_implementation",
            policy: {
              presetId: "intelligent-flow"
            },
            projectionBefore: {
              currentNode: "bootstrapping"
            },
            projectionAfter: {
              currentNode: "implementation"
            },
            commands: [
              {
                commandId: "command-1",
                kind: "dispatch.implementation",
                dedupeKey: null,
                payload: {
                  issueIdentifier: "SYM-420"
                },
                settled: {
                  eventId: "event-7",
                  eventSequence: 7,
                  recordedAt: "2026-04-13T19:00:05.000Z",
                  status: "succeeded",
                  payload: {
                    dispatched: true
                  }
                }
              }
            ],
            trace: [
              {
                message: "Todo moved into implementation dispatch."
              }
            ],
            selectionMetadata: {
              score: 1
            },
            recordedAt: "2026-04-13T19:00:04.000Z",
            insertedAt: "2026-04-13T19:00:04.000Z"
          }
        ],
        filters: {
          historyLimit: 50,
          decisionLimit: 10
        }
      }
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new TypeError("Expected workflow observability envelope to be successful.");
    }

    expect(parsed.data.snapshot?.currentNode).toBe("active");
    expect(parsed.data.decisions[0]?.commands[0]?.settled?.status).toBe("succeeded");
  });

  it("parses the tracker state observation envelope", () => {
    const parsed = symphonyRuntimeTrackerStateObservationResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-04-10T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-157",
        observedTrackerState: "Todo",
        workflowTrackerState: "Bootstrapping",
        observed: true,
        disposition: "observed",
        recordedAt: "2026-04-10T00:00:00.000Z"
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses ignored tracker state observations with no workflow tracker state", () => {
    const parsed = symphonyRuntimeTrackerStateObservationResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-04-10T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-158",
        observedTrackerState: "Todo",
        workflowTrackerState: null,
        observed: false,
        disposition: "ignored",
        recordedAt: "2026-04-10T00:00:01.000Z"
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses tracker-only runtime issue context", () => {
    const parsed = symphonyRuntimeIssueResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 2,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-106",
        trackerIssueId: "issue-106",
        status: "tracked",
        workspace: {
          backendKind: null,
          workerHost: null,
          prepareDisposition: null,
          executionTargetKind: null,
          materializationKind: null,
          hostRepoMetadataAvailable: false,
          containerDisposition: null,
          networkDisposition: null,
          hostPath: null,
          runtimePath: null,
          containerId: null,
          containerName: null,
          networkName: null,
          services: [],
          envBundleSummary: null,
          manifestLifecycle: null,
          path: null,
          executionTarget: null,
          materialization: null
        },
        attempts: {
          restartCount: 0,
          currentRetryAttempt: 0
        },
        running: null,
        retry: null,
        lastError: null,
        tracked: {
          title: "Historical issue",
          state: "Done",
          branchName: "symphony/COL-106",
          url: "https://linear.app/coldets/issue/COL-106/historical-issue",
          projectName: "Symphony",
          teamKey: "COL"
        },
        operator: {
          refreshPath: "/api/v1/refresh",
          refreshDelegatesTo: ["poll", "reconcile"],
          githubPullRequestSearchUrl:
            "https://github.com/openai/symphony/pulls?q=is%3Apr+head%3Asymphony%2FCOL-106",
          pi: {
            defaultModel: "xiaomi/mimo-v2-pro",
            selectedModel: "xiaomi/mimo-v2-pro",
            availableModels: [
              "xiaomi/mimo-v2-pro",
              "gpt-5.4",
              "gpt-5.4-mini"
            ],
            modelOverrideLabelPrefix: "model:",
            selectionHelpText:
              "Pi selection is label-driven. Use model:<preset> for repo-defined tiers or model:<model> for a direct model override."
          },
          pendingClarification: null,
          capability: null
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses clarification answer requests", () => {
    const parsed = symphonyRuntimeClarificationAnswerRequestSchema.parse({
      requestId: "clarification_123",
      answers: {
        repo_scope: "Proceed with backend-only changes."
      }
    });

    expect(parsed.answers.repo_scope).toBe("Proceed with backend-only changes.");
  });

  it("parses clarification answer responses", () => {
    const parsed = symphonyRuntimeClarificationAnswerResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 2,
        generatedAt: "2026-04-13T18:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-157",
        workflowId: "workflow-157",
        requestId: "clarification_123",
        answeredAt: "2026-04-13T18:00:00.000Z",
        capability: {
          workflowId: "workflow-157",
          contractId: "contract-157",
          policyId: "default",
          planKind: "execute",
          summary: "Next capability execution is implement.spec.",
          decidedAt: "2026-04-13T18:00:01.000Z",
          capabilityId: "implement.spec",
          modelProfileId: "builder_fast",
          workEpoch: 1,
          pendingClarification: null,
          completion: null
        }
      }
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new TypeError("Expected clarification answer response to parse.");
    }

    expect(parsed.data.capability.planKind).toBe("execute");
  });

  it("rejects runtime entries that omit nullable state fields", () => {
    expect(() =>
      symphonyRuntimeStateResponseSchema.parse({
        schemaVersion: "1",
        ok: true,
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T00:00:00.000Z"
        },
        data: {
          counts: { running: 1, retrying: 0 },
          running: [
            {
              trackerIssueId: "issue-1",
              issueIdentifier: "COL-157",
              state: "In Progress",
              workspace: null,
              launchTarget: null,
              turnCount: 0,
              startedAt: "2026-03-31T00:00:00.000Z",
              lastEventAt: null,
              tokens: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0
              }
            }
          ],
          retrying: [],
          agentTotals: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            secondsRunning: 0
          },
          rateLimits: null
        }
      })
    ).toThrow();
  });

  it("parses refresh requests and responses", () => {
    const request = symphonyRuntimeRefreshRequestSchema.parse({});
    const response = symphonyRuntimeRefreshResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 0,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        queued: true,
        coalesced: false,
        requestedAt: "2026-03-31T00:00:00.000Z",
        operations: ["poll", "reconcile"]
      }
    });

    expect(request).toEqual({});
    expect(response.ok).toBe(true);
  });

  it("parses the runtime config envelope", () => {
    const parsed = symphonyRuntimeConfigResponseSchema.parse({
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
            kind: "persisted_workspace_bindings",
            source: "database",
            sourceRepos: ["/Users/example/symphony"],
            bindingScope: {
              organizationId: "org_123",
              linearWorkspaceIdentityId: "workspace_123"
            }
          },
          defaultRepositoryKey: "openai/symphony",
          manifestPath: "/Users/example/symphony/.symphony/runtime.ts",
          bindingScope: {
            organizationId: "org_123",
            linearWorkspaceIdentityId: "workspace_123"
          },
          presetSelection: {
            presetId: "intelligent-flow",
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
        bindingCatalog: {
          organizationId: "org_123",
          linearWorkspaceIdentityId: "workspace_123",
          repositories: [
            {
              repositoryWorkspaceBindingId: "binding_123",
              githubInstallationIdentityId: "gh_installation_123",
              githubRepositoryIdentityId: "gh_repo_123",
              repositoryKey: "openai/symphony",
              linearWorkspaceIdentityId: "workspace_123",
              source: "manual",
              teamBindings: [
                {
                  repositoryTeamBindingId: "team_binding_123",
                  linearTeamIdentityId: "linear_team_123",
                  linearTeamId: "team_id_123",
                  linearTeamKey: "COL",
                  source: "manual"
                }
              ],
              projectBindings: [
                {
                  repositoryProjectBindingId: "project_binding_123",
                  linearProjectIdentityId: "linear_project_123",
                  linearProjectId: "project_id_123",
                  source: "bootstrap"
                }
              ]
            }
          ]
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("rejects blank runtime issue identifiers", () => {
    expect(() =>
      symphonyRuntimeIssuePathSchema.parse({
        issueIdentifier: "   "
      })
    ).toThrowError();
  });
});
