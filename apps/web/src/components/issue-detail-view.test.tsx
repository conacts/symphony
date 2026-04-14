import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueDetailResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import {
  buildSymphonyRuntimeIssueResult,
  buildSymphonyRuntimeWorkflowObservabilityResult
} from "../test-support/build-symphony-runtime-operator.js";
import { IssueDetailView } from "@/features/issues/components/issue-detail-view";

describe("issue detail view", () => {
  it("renders the issue run history drilldown", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        issueDetailError={null}
        issueDetail={buildSymphonyForensicsIssueDetailResult()}
        issueDetailLoading={false}
        runtimeIssue={null}
        workflowObservability={null}
        workflowObservabilityError={null}
        workflowObservabilityLoading={false}
      />
    );

    expect(html).toContain("Recent run token load");
    expect(html).toContain("Run pressure");
    expect(html).toContain("Run history");
    expect(html).toContain("Status filter");
    expect(html).toContain("Model filter");
    expect(html).toContain('href="/issues/COL-165/runs/');
    expect(html.indexOf("Recent run token load")).toBeLessThan(html.indexOf("Run history"));
  });

  it("renders the degraded state when the issue request fails", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        issueDetailError="issue unavailable"
        issueDetail={null}
        issueDetailLoading={false}
        runtimeIssue={null}
        workflowObservability={null}
        workflowObservabilityError={null}
        workflowObservabilityLoading={false}
      />
    );

    expect(html).toContain("Run forensics degraded");
    expect(html).toContain("issue unavailable");
  });

  it("renders the unavailable state when no issue detail exists yet", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        issueDetailError={null}
        issueDetail={null}
        issueDetailLoading={false}
        runtimeIssue={null}
        workflowObservability={null}
        workflowObservabilityError={null}
        workflowObservabilityLoading={false}
      />
    );

    expect(html).toContain("Issue detail unavailable");
    expect(html).toContain("No run forensics have been recorded for this issue yet.");
    expect(html).not.toContain("Issue detail degraded");
  });

  it("renders a runtime snapshot when forensics detail is not available yet", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        issueDetailError={null}
        issueDetail={null}
        issueDetailLoading={false}
        runtimeIssue={buildSymphonyRuntimeIssueResult({
          status: "tracked",
          running: null,
          retry: null,
          tracked: {
            title: "Add a first property-based test flow with FastCheck",
            state: "In Progress",
            branchName: "symphony/SYM-15",
            url: "https://linear.app/coldets/issue/SYM-15/add-a-first-property-based-test-flow-with-fastcheck",
            projectName: "Dogfooding",
            teamKey: "SYM"
          },
          workspace: {
            backendKind: null,
            prepareDisposition: null,
            executionTargetKind: null,
            materializationKind: null,
            hostPath: null,
            runtimePath: null,
            path: null,
            containerId: null,
            containerName: null,
            envBundleSummary: null,
            services: []
          },
          operator: {
            pi: {
              defaultModel: "z-ai/glm-5",
              selectedModel: "xiaomi/mimo-v2-pro"
            },
            capability: {
              workflowId: "workflow-15",
              contractId: "contract-15",
              policyId: "default",
              decidedAt: "2026-04-13T15:06:59.152Z",
              planKind: "ready_for_manual_completion",
              summary: "Workflow is ready for manual completion.",
              capabilityId: null,
              modelProfileId: null,
              workEpoch: 1,
              pendingClarification: null,
              completion: {
                workEpoch: 1,
                result: "ready_for_manual_completion",
                satisfiedCapabilityIds: ["implement.spec", "critic.code_review"],
                missingCapabilityIds: [],
                satisfiedEvidenceIds: ["change_set", "code_review_report"],
                missingEvidenceIds: [],
                reasons: []
              }
            }
          }
        })}
        workflowObservability={buildSymphonyRuntimeWorkflowObservabilityResult()}
        workflowObservabilityError={null}
        workflowObservabilityLoading={false}
      />
    );

    expect(html).toContain("Workflow observability");
    expect(html).toContain("Current module");
    expect(html).toContain("Router decision");
    expect(html).toContain("Recent module runs");
    expect(html).toContain("Run logs");
    expect(html).toContain("Live runtime snapshot");
    expect(html).toContain("Dogfooding");
    expect(html).toContain("Manual Completion");
    expect(html).toContain("No active agent run is currently attached to this issue.");
    expect(html).toContain("Workspace context");
  });

  it("renders workflow observability even when no run forensics exist yet", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={buildSymphonyDashboardConnectionState()}
        issueDetailError={null}
        issueDetail={null}
        issueDetailLoading={false}
        runtimeIssue={null}
        workflowObservability={buildSymphonyRuntimeWorkflowObservabilityResult()}
        workflowObservabilityError={null}
        workflowObservabilityLoading={false}
      />
    );

    expect(html).toContain("Workflow observability");
    expect(html).toContain("Current module");
    expect(html).toContain("Recent module runs");
    expect(html).not.toContain("Issue detail unavailable");
  });
});
