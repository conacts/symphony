import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimeWorkflowObservabilityResult
} from "@/test-support/build-symphony-runtime-operator";
import { IssueWorkflowObservabilityView } from "@/features/issues/components/issue-workflow-observability-view";

describe("issue workflow observability view", () => {
  it("renders the simplified module-centric observability surface", () => {
    const html = renderToStaticMarkup(
      <IssueWorkflowObservabilityView
        runtimeIssue={null}
        workflow={buildSymphonyRuntimeWorkflowObservabilityResult({
          currentModule: {
            executionId: null,
            module: {
              moduleId: "critic.code_review",
              phase: "verifying",
              executionKind: "agent",
              summary: "Review the implementation for correctness and regressions.",
              description:
                "Produces structured code-review evidence for the current change set.",
              enabledByDefault: true,
              runtimeSupported: true,
              supportedModelProfileIds: ["critic_strict"],
              producesEvidenceIds: ["code_review_report"],
              requiresEvidenceIds: ["change_set"]
            },
            workEpoch: 1,
            attempt: null,
            state: "selected",
            summary: "Next capability execution is critic.code_review.",
            modelProfileId: "critic_strict",
            selectedAt: "2026-04-13T19:00:05.000Z",
            startedAt: null,
            completedAt: null,
            retryable: null,
            reasonCode: null,
            failureKind: null,
            evidenceProduced: [],
            decision: {
              decisionId: "decision_2",
              recordedAt: "2026-04-13T19:00:05.000Z",
              reasonCode: "active_selected_code_review",
              selectionMode: "deterministic",
              selectionSummary:
                "Code review is the next admissible verification module.",
              selectionRationale:
                "Implementation produced the required change_set evidence, so critic.code_review is next."
            }
          },
          routerDecision: {
            decisionId: "decision_2",
            recordedAt: "2026-04-13T19:00:05.000Z",
            policyId: "default",
            reasonCode: "active_selected_code_review",
            selectionMode: "deterministic",
            selectionSummary:
              "Code review is the next admissible verification module.",
            selectionRationale:
              "Implementation produced the required change_set evidence, so critic.code_review is next.",
            confidence: null,
            fallbackReason: null,
            selectedModule: {
              moduleId: "critic.code_review",
              phase: "verifying",
              executionKind: "agent",
              summary: "Review the implementation for correctness and regressions.",
              description:
                "Produces structured code-review evidence for the current change set.",
              enabledByDefault: true,
              runtimeSupported: true,
              supportedModelProfileIds: ["critic_strict"],
              producesEvidenceIds: ["code_review_report"],
              requiresEvidenceIds: ["change_set"]
            },
            admissibleCandidates: [
              {
                module: {
                  moduleId: "critic.code_review",
                  phase: "verifying",
                  executionKind: "agent",
                  summary:
                    "Review the implementation for correctness and regressions.",
                  description:
                    "Produces structured code-review evidence for the current change set.",
                  enabledByDefault: true,
                  runtimeSupported: true,
                  supportedModelProfileIds: ["critic_strict"],
                  producesEvidenceIds: ["code_review_report"],
                  requiresEvidenceIds: ["change_set"]
                },
                rank: 0,
                reasonCode: "required_by_contract",
                summary: "Code review is the next admissible verification module.",
                selected: true
              }
            ],
            rejectedCandidates: [
              {
                module: {
                  moduleId: "critic.browser_test",
                  phase: "verifying",
                  executionKind: "agent",
                  summary: "Exercise the change through browser verification.",
                  description:
                    "Produces browser evidence once the execution substrate supports it.",
                  enabledByDefault: false,
                  runtimeSupported: false,
                  supportedModelProfileIds: ["critic_browser"],
                  producesEvidenceIds: ["browser_test_report"],
                  requiresEvidenceIds: ["change_set"]
                },
                rank: null,
                reasonCode: "disabled_by_default",
                summary: "critic.browser_test is disabled in the current runtime.",
                selected: false
              }
            ]
          },
          recentModuleRuns: [
            {
              executionId: "execution_1",
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
              workEpoch: 1,
              attempt: 1,
              state: "completed",
              summary: "Implemented the requested workflow observability slice.",
              modelProfileId: "builder_fast",
              selectedAt: "2026-04-13T19:00:01.000Z",
              startedAt: "2026-04-13T19:00:02.000Z",
              completedAt: "2026-04-13T19:00:04.000Z",
              retryable: null,
              reasonCode: null,
              failureKind: null,
              evidenceProduced: [
                {
                  evidenceId: "change_set",
                  summary: "Code changes were produced.",
                  artifacts: []
                }
              ],
              decision: {
                decisionId: "decision_1",
                recordedAt: "2026-04-13T19:00:01.000Z",
                reasonCode: "active_selected_implementation",
                selectionMode: "deterministic",
                selectionSummary:
                  "Implementation is the first admissible module for this work epoch.",
                selectionRationale:
                  "The workflow has no change_set evidence yet, so implement.spec must run first."
              }
            }
          ],
          decisions: [
            {
              decisionId: "decision_1",
              eventSequence: 1,
              signalId: "signal_1",
              fromNode: "claimed",
              toNode: "active",
              edgeId: "claimed_to_active",
              reasonCode: "active_selected_implementation",
              policy: {
                presetId: "intelligent-flow"
              },
              projectionBefore: {
                currentNode: "claimed"
              },
              projectionAfter: {
                currentNode: "active"
              },
              commands: [
                {
                  commandId: "execution_1",
                  kind: "capability.execute",
                  dedupeKey: null,
                  payload: {
                    workflowId: "workflow-167"
                  },
                  settled: {
                    eventId: "event_3",
                    eventSequence: 3,
                    recordedAt: "2026-04-13T19:00:02.500Z",
                    status: "succeeded",
                    payload: {
                      accepted: true
                    }
                  }
                }
              ],
              trace: [],
              selectionMetadata: null,
              recordedAt: "2026-04-13T19:00:01.000Z",
              insertedAt: "2026-04-13T19:00:01.000Z"
            },
            {
              decisionId: "decision_2",
              eventSequence: 2,
              signalId: "signal_2",
              fromNode: "active",
              toNode: "active",
              edgeId: "active_to_active",
              reasonCode: "active_selected_code_review",
              policy: {
                presetId: "intelligent-flow"
              },
              projectionBefore: {
                currentNode: "active",
                currentModule: "implement.spec"
              },
              projectionAfter: {
                currentNode: "active",
                currentModule: "critic.code_review"
              },
              commands: [
                {
                  commandId: "execution_2",
                  kind: "capability.execute",
                  dedupeKey: null,
                  payload: {
                    workflowId: "workflow-167",
                    capabilityId: "critic.code_review"
                  },
                  settled: null
                }
              ],
              trace: [
                {
                  kind: "candidate_considered",
                  moduleId: "critic.code_review",
                  score: 1
                }
              ],
              selectionMetadata: {
                selectedModuleId: "critic.code_review",
                selectionMode: "deterministic"
              },
              recordedAt: "2026-04-13T19:00:05.000Z",
              insertedAt: "2026-04-13T19:00:05.000Z"
            }
          ]
        })}
      />
    );

    expect(html).toContain("Current module");
    expect(html).toContain("Router decision");
    expect(html).toContain("Recent module runs");
    expect(html).toContain("Run logs");
    expect(html).toContain("critic.code_review");
    expect(html).toContain(
      "Implementation produced the required change_set evidence, so critic.code_review is next."
    );
    expect(html).toContain("Admissible candidates");
    expect(html).toContain("Rejected candidates");
    expect(html).toContain("Implemented the requested workflow observability slice.");
    expect(html).toContain("Selected");
    expect(html).toContain("Command settled");
    expect(html).toContain("Evidence");
    expect(html).toContain("Decision internals");
    expect(html).toContain("Projection before");
    expect(html).toContain("Projection after");
    expect(html).toContain("Selection metadata");
    expect(html).toContain("Workflow event log");
    expect(html).toContain("Recorded payload");
    expect(html).toContain("signal_todo_observed");
  });

  it("renders helpful empty states when no module details exist yet", () => {
    const html = renderToStaticMarkup(
      <IssueWorkflowObservabilityView
        runtimeIssue={null}
        workflow={buildSymphonyRuntimeWorkflowObservabilityResult({
          currentModule: null,
          routerDecision: null,
          recentModuleRuns: [],
          history: [],
          decisions: []
        })}
      />
    );

    expect(html).toContain("No module is currently selected.");
    expect(html).toContain(
      "No intelligent-flow selection metadata has been recorded for this workflow yet."
    );
    expect(html).toContain("No module runs have started for this workflow yet.");
    expect(html).toContain("Per-run logs will appear once a module attempt starts.");
    expect(html).toContain("No workflow events have been recorded for this issue yet.");
  });
});
