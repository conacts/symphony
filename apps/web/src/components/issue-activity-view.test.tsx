import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildSymphonyDashboardConnectionState,
  buildSymphonyForensicsIssueForensicsBundleResult
} from "../test-support/build-symphony-dashboard-view-fixtures.js";
import { IssueActivityView } from "@/features/issues/components/issue-activity-view";

vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div data-slot="accordion" {...props}>
      {children}
    </div>
  ),
  AccordionItem: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div data-slot="accordion-item" {...props}>
      {children}
    </div>
  ),
  AccordionTrigger: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button data-slot="accordion-trigger" type="button" {...props}>
      {children}
    </button>
  ),
  AccordionContent: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div data-slot="accordion-content" {...props}>
      {children}
    </div>
  )
}));

describe("issue activity view", () => {
  it("renders the unified issue activity stream", () => {
    const html = renderToStaticMarkup(
      <IssueActivityView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueActivity={buildSymphonyForensicsIssueForensicsBundleResult()}
        trackerIssueKey="COL-165"
        loading={false}
      />
    );

    expect(html).toContain("Issue activity");
    expect(html).toContain("Chronological event feed");
    expect(html).toContain("Latest failure");
    expect(html).toContain("Runtime / Workspace");
    expect(html).toContain("Approaching upstream rate limit.");
    expect(html).not.toContain("Open issue runs");
  });

  it("renders bootstrap runtime log payloads as multiline JSON in the accordion", () => {
    const html = renderToStaticMarkup(
      <IssueActivityView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueActivity={buildSymphonyForensicsIssueForensicsBundleResult({
          timeline: [],
          runtimeLogs: [
            {
              entryId: "runtime-log-bootstrap",
              repositoryKey: "symphony",
              level: "info",
              source: "workspace",
              eventType: "workspace_manifest_step_started",
              message: "Manifest lifecycle step bootstrap/install started.",
              trackerIssueId: "issue_123",
              trackerIssueKey: "COL-165",
              runId: "run_12345678",
              payload: {
                manifestLifecycle: {
                  phase: "bootstrap",
                  stepName: "install",
                  command: "pnpm install --frozen-lockfile",
                  cwd: "/workspace",
                  timeoutMs: 30_000
                }
              },
              recordedAt: "2026-03-31T18:05:00.000Z"
            }
          ]
        })}
        trackerIssueKey="COL-165"
        loading={false}
      />
    );

    expect(html).toContain("Manifest lifecycle step bootstrap/install started.");
    expect(html).toContain("Runtime / Workspace");
    expect(html).toContain("Workspace Manifest Step Started");
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("{\n  &quot;manifestLifecycle&quot;: {\n    &quot;phase&quot;: &quot;bootstrap&quot;");
    expect(html).toContain("&quot;command&quot;: &quot;pnpm install --frozen-lockfile&quot;");
  });

  it("suppresses duplicate runtime log rows when the same event is already in the timeline", () => {
    const html = renderToStaticMarkup(
      <IssueActivityView
        connection={buildSymphonyDashboardConnectionState()}
        error={null}
        issueActivity={buildSymphonyForensicsIssueForensicsBundleResult({
          timeline: [
            {
              entryId: "timeline-bootstrap",
              repositoryKey: "openai/symphony",
              trackerIssueId: "issue_123",
              trackerIssueKey: "COL-165",
              runId: "run_12345678",
              turnId: null,
              source: "workspace",
              eventType: "workspace_manifest_step_started",
              message: "Manifest lifecycle step bootstrap/install started.",
              payload: {
                manifestLifecycle: {
                  phase: "bootstrap",
                  stepName: "install"
                }
              },
              recordedAt: "2026-03-31T18:05:00.000Z"
            }
          ],
          runtimeLogs: [
            {
              entryId: "runtime-bootstrap",
              repositoryKey: "openai/symphony",
              level: "info",
              source: "workspace",
              eventType: "workspace_manifest_step_started",
              message: "Manifest lifecycle step bootstrap/install started.",
              trackerIssueId: "issue_123",
              trackerIssueKey: "COL-165",
              runId: "run_12345678",
              payload: {
                manifestLifecycle: {
                  phase: "bootstrap",
                  stepName: "install"
                }
              },
              recordedAt: "2026-03-31T18:05:00.000Z"
            }
          ]
        })}
        trackerIssueKey="COL-165"
        loading={false}
      />
    );

    expect(html.match(/Manifest lifecycle step bootstrap\/install started\./g)).toHaveLength(1);
  });
});
