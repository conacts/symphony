import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueRequeuePanel } from "@/features/issues/components/issue-requeue-panel";
import { buildSymphonyForensicsIssueDetailResult } from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { buildSymphonyRuntimeIssueResult } from "../test-support/build-symphony-runtime-operator.js";

describe("issue requeue panel", () => {
  it("renders parity-safe requeue affordances", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error={null}
        issueDetail={buildSymphonyForensicsIssueDetailResult()}
        issue={buildSymphonyRuntimeIssueResult()}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("COL-167");
    expect(html).toContain("Linear");
    expect(html).toContain("GitHub");
    expect(html).toContain("Timeline");
    expect(html).toContain('/issues/COL-167/timeline?repo=symphony');
    expect(html).toContain("In Progress");
    expect(html).toContain("xiaomi/mimo-v2-pro");
    expect(html).toContain("Last run");
  });

  it("renders operator context failures", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error="Runtime issue request failed with 404."
        issueDetail={null}
        issue={null}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("Runtime issue context unavailable");
    expect(html).toContain("404");
  });

  it("renders pre-execution clarification without capability answer controls", () => {
    const html = renderToStaticMarkup(
      <IssueRequeuePanel
        error={null}
        issueDetail={buildSymphonyForensicsIssueDetailResult()}
        issue={buildSymphonyRuntimeIssueResult({
          operator: {
            pendingClarification: {
              kind: "contract_intake",
              requestId: "clarification-167",
              raisedByCapabilityId: null,
              workEpoch: null,
              summary:
                "Need a repository-scope clarification before Symphony can start execution.",
              nextAction:
                'Update the ticket body to answer the missing question: "Should this change stay backend-only?" Then move the issue back to Todo to requeue.',
              answerPath: null,
              questions: [
                {
                  id: "repo_scope",
                  prompt: "Should this change stay backend-only?",
                  context: "The current contract is ambiguous."
                }
              ]
            },
            capability: null
          }
        })}
        issueIdentifier="COL-167"
        loading={false}
      />
    );

    expect(html).toContain("Ticket clarification");
    expect(html).toContain("Ticket Clarification");
    expect(html).toContain("Execution has not started yet");
    expect(html).toContain("Should this change stay backend-only?");
    expect(html).toContain("move the issue back to Todo to requeue");
    expect(html).not.toContain("Submit Clarification");
  });
});
